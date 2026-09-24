import "server-only";
import { readFile } from "node:fs/promises";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  contracts,
  documents,
  installments,
  issuedDocuments,
  payments,
  projects,
  units,
  users,
} from "@/db/schema";
import { toCents, fromCents } from "@/lib/money";
import { readSettings } from "@/lib/settings";
import { nextCreditNoteNumber, nextInvoiceNumber } from "@/lib/receipts";
import { creditNotePdf, invoicePdf, receiptPdfFrom, type IssuedSnapshot } from "@/lib/paymentPdf";
import { modelOf, splitGross } from "@/lib/vatModel";
import { saveUpload, resolveStored } from "@/lib/storage";

/**
 * The invoice and the receipt for a buyer's payment: issued, numbered, kept.
 *
 * Recording a payment issues both at once, because in Cyprus VAT on a new home
 * falls due with each payment the developer receives, so the invoice belongs
 * to the money, and the receipt is the paper that says the money arrived. Both
 * are drawn up from the record as it stands that day, saved as PDFs on the
 * contract and the client, listed under Invoices, Clients, and attached to the
 * letter that goes to the buyer.
 *
 * A land exchange gets a receipt for any money on it but no invoice, because
 * nothing is being sold. Issuing twice for the same payment is impossible:
 * asking again hands back what was already issued.
 */

export type IssuedPair = {
  invoice: typeof issuedDocuments.$inferSelect | null;
  receipt: typeof issuedDocuments.$inferSelect | null;
};

const COMPANY_KEYS = [
  "company.name",
  "company.registration",
  "company.vat",
  "company.tic",
  "company.address",
  "company.phone",
  "company.fax",
  "company.email",
  "company.website",
  "company.bankName",
  "company.iban",
  "company.swift",
] as const;

export async function companyDetails(): Promise<IssuedSnapshot["company"]> {
  const c = await readSettings([...COMPANY_KEYS]);
  return {
    name: c["company.name"],
    registration: c["company.registration"],
    vat: c["company.vat"],
    tic: c["company.tic"],
    address: c["company.address"],
    phone: c["company.phone"],
    fax: c["company.fax"],
    email: c["company.email"],
    website: c["company.website"],
    bankName: c["company.bankName"],
    iban: c["company.iban"],
    swift: c["company.swift"],
  };
}

/** What was already issued for one payment: the standing invoice and the receipt. */
export async function issuedFor(paymentId: string): Promise<IssuedPair> {
  const rows = await db
    .select()
    .from(issuedDocuments)
    .where(and(eq(issuedDocuments.paymentId, paymentId), isNull(issuedDocuments.voidedAt)))
    .orderBy(desc(issuedDocuments.createdAt));
  return {
    /* A credited invoice has been replaced; the replacement is the one that stands. */
    invoice: rows.find((row) => row.kind === "INVOICE" && !row.creditedById) ?? null,
    receipt: rows.find((row) => row.kind === "RECEIPT") ?? null,
  };
}

type Category = "INVOICE" | "RECEIPT" | "CREDIT_NOTE" | "REFUND_ACK";

/** Save a drawn PDF as a document on the contract. */
export async function keepPdf(
  buffer: Buffer,
  filename: string,
  title: string,
  category: Category,
  contractId: string,
  userId: string | null,
): Promise<string> {
  const saved = await saveUpload(new File([new Uint8Array(buffer)], filename, { type: "application/pdf" }));
  const [row] = await db
    .insert(documents)
    .values({
      category,
      title,
      originalName: saved.originalName,
      filePath: saved.relativePath,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      /* On the contract only: a contract's files already show on the client's
         card, and a paper filed on both would be listed twice. */
      contractId,
      clientId: null,
      uploadedById: userId,
    })
    .returning({ id: documents.id });
  return row.id;
}

export async function readDocument(documentId: string | null | undefined): Promise<Buffer | null> {
  if (!documentId) return null;
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return null;
  try {
    return await readFile(resolveStored(doc.filePath));
  } catch {
    return null;
  }
}

/** The buyer, the property and the company as a paper names them today. */
async function partiesOf(contractId: string) {
  const [row] = await db
    .select({ contract: contracts, client: clients, unit: units, project: projects })
    .from(contracts)
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .where(eq(contracts.id, contractId))
    .limit(1);
  if (!row) return null;
  return {
    row,
    company: await companyDetails(),
    client: {
      name: row.client ? `${row.client.firstName} ${row.client.lastName}`.trim() : "",
      address: row.client?.address ?? "",
      country: row.client?.country ?? "",
      idNumber: row.client?.idNumber ?? "",
      vatNumber: row.client?.vatNumber ?? "",
      email: row.client?.email ?? "",
      phone: row.client?.phone ?? "",
    },
    property: [row.project?.name, row.unit?.code].filter(Boolean).join(", "),
  };
}

/** The whole schedule, and what had come in up to and including one payment. */
async function standingOf(contractId: string, upTo?: { paidOn: Date; createdAt: Date }) {
  const [owed] = await db
    .select({ due: sql<string>`coalesce(sum(${installments.totalAmount}), 0)` })
    .from(installments)
    .where(eq(installments.contractId, contractId));
  const [received] = await db
    .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.contractId, contractId),
        eq(payments.kind, "PAYMENT"),
        upTo
          ? or(
              lt(payments.paidOn, upTo.paidOn),
              and(eq(payments.paidOn, upTo.paidOn), lte(payments.createdAt, upTo.createdAt)),
            )
          : undefined,
      ),
    );
  const contractTotalCents = toCents(owed?.due ?? "0");
  const receivedToDateCents = toCents(received?.paid ?? "0");
  return { contractTotalCents, receivedToDateCents, balanceCents: Math.max(0, contractTotalCents - receivedToDateCents) };
}

/**
 * The invoice and receipt for a payment of money.
 *
 * The invoice covers the money and any credit from the reduced VAT already put
 * on the same stage, so the stage is invoiced in full and the invoice says how
 * much of it the credit settled. The receipt is for the money alone.
 */
export async function issueForPayment(
  paymentId: string,
  who: { id?: string | null; name?: string | null } | null = null,
): Promise<IssuedPair> {
  const already = await issuedFor(paymentId);

  const [row] = await db
    .select({
      payment: payments,
      contract: contracts,
      installment: installments,
      recorder: users.name,
    })
    .from(payments)
    .innerJoin(contracts, eq(contracts.id, payments.contractId))
    .leftJoin(installments, eq(installments.id, payments.installmentId))
    .leftJoin(users, eq(users.id, payments.recordedById))
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!row) return already;
  /* A credit moved between stages is not money: see issueForCreditCover. */
  if (row.payment.kind !== "PAYMENT") return already;

  const sale = row.contract.kind !== "LAND_EXCHANGE";
  if (already.receipt && (already.invoice || !sale)) return already;

  const parties = await partiesOf(row.contract.id);
  if (!parties) return already;
  const standing = await standingOf(row.contract.id, row.payment);

  /* Credit from the reduced VAT sitting on this stage, not yet invoiced. */
  const credits =
    row.installment && sale && !already.invoice
      ? await db
          .select({ id: payments.id, amount: payments.amount })
          .from(payments)
          .where(
            and(
              eq(payments.installmentId, row.installment.id),
              eq(payments.kind, "CREDIT"),
              isNull(payments.invoicedById),
              sql`${payments.amount} > 0`,
            ),
          )
      : [];
  const creditCents = credits.reduce((sum, one) => sum + toCents(one.amount), 0);

  const cashCents = toCents(row.payment.amount);
  const grossCents = cashCents + creditCents;
  const model = modelOf(row.contract);
  const split = row.installment
    ? splitGross(grossCents, { netCents: toCents(row.installment.netAmount), vatCents: toCents(row.installment.vatAmount) }, model)
    : splitGross(grossCents, { netCents: 0, vatCents: 0 }, model);
  const rate = split.netCents > 0 ? Math.round((split.vatCents / split.netCents) * 100 * 1000) / 1000 : model.rate;

  const stage = row.installment?.label ?? "Payment";
  const invoiceNumber = sale ? (already.invoice?.number ?? (await nextInvoiceNumber())) : "";
  const receiptNumber = row.payment.receiptNumber ?? "";

  const snapshot: IssuedSnapshot = {
    company: parties.company,
    client: parties.client,
    contractReference: row.contract.reference ?? "",
    property: parties.property,
    stage,
    description: `${stage}${parties.property ? `, ${parties.property}` : ""}${
      row.contract.reference ? `, contract ${row.contract.reference}` : ""
    }`,
    paidOn: new Date(row.payment.paidOn).toISOString(),
    issuedOn: new Date(row.payment.paidOn).toISOString(),
    method: row.payment.method ?? "",
    reference: row.payment.reference ?? "",
    netCents: split.netCents,
    vatCents: split.vatCents,
    totalCents: grossCents,
    rate,
    parts: split.parts,
    creditAppliedCents: creditCents || undefined,
    payableCents: creditCents ? cashCents : undefined,
    ...standing,
    invoiceNumber,
    receiptNumber,
    recordedBy: row.recorder ?? who?.name ?? "",
  };

  const base = {
    paymentId,
    contractId: row.contract.id,
    clientId: row.contract.clientId ?? null,
    vatRate: rate.toFixed(3),
    issuedOn: new Date(row.payment.paidOn),
  };

  let invoice = already.invoice;
  if (sale && !invoice) {
    const pdf = await invoicePdf(snapshot);
    const documentId = await keepPdf(pdf, `Invoice ${invoiceNumber}.pdf`, `Invoice ${invoiceNumber}`, "INVOICE", row.contract.id, who?.id ?? row.payment.recordedById ?? null);
    [invoice] = await db
      .insert(issuedDocuments)
      .values({
        ...base,
        kind: "INVOICE",
        number: invoiceNumber,
        documentId,
        netAmount: fromCents(split.netCents),
        vatAmount: fromCents(split.vatCents),
        totalAmount: fromCents(grossCents),
        snapshot: JSON.stringify(snapshot),
      })
      .returning();
    if (credits.length > 0) {
      await db
        .update(payments)
        .set({ invoicedById: invoice.id })
        .where(inArray(payments.id, credits.map((one) => one.id)));
    }
  }

  let receipt = already.receipt;
  if (!receipt && receiptNumber) {
    /* A number typed by hand that another receipt already carries gets a
       letter after it, so the paper can still be kept. */
    let number = receiptNumber;
    for (let n = 0; n < 26; n++) {
      const [taken] = await db
        .select({ id: issuedDocuments.id })
        .from(issuedDocuments)
        .where(and(eq(issuedDocuments.kind, "RECEIPT"), eq(issuedDocuments.number, number)))
        .limit(1);
      if (!taken) break;
      number = `${receiptNumber}${String.fromCharCode(65 + n)}`;
    }
    /* The receipt is for the money that arrived, with its share of the VAT. */
    const cashNet = grossCents > 0 ? Math.round((cashCents * split.netCents) / grossCents) : cashCents;
    const receiptSnapshot: IssuedSnapshot = {
      ...snapshot,
      receiptNumber: number,
      totalCents: cashCents,
      netCents: cashNet,
      vatCents: cashCents - cashNet,
    };
    const pdf = await receiptPdfFrom(receiptSnapshot);
    const documentId = await keepPdf(pdf, `Receipt ${number}.pdf`, `Receipt ${number}`, "RECEIPT", row.contract.id, who?.id ?? row.payment.recordedById ?? null);
    [receipt] = await db
      .insert(issuedDocuments)
      .values({
        ...base,
        kind: "RECEIPT",
        number,
        invoiceId: invoice?.id ?? null,
        documentId,
        netAmount: fromCents(cashNet),
        vatAmount: fromCents(cashCents - cashNet),
        totalAmount: fromCents(cashCents),
        snapshot: JSON.stringify(receiptSnapshot),
      })
      .returning();
  }

  return { invoice: invoice ?? null, receipt: receipt ?? null };
}

/**
 * A stage the credit from the reduced VAT covers in full.
 *
 * No money will arrive for it, so its invoice is issued now, settled by the
 * credit, against the credit that was put on it.
 */
export async function issueForCreditCover(
  installmentId: string,
  when: Date,
  who: { id?: string | null; name?: string | null } | null = null,
): Promise<typeof issuedDocuments.$inferSelect | null> {
  const credits = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.installmentId, installmentId),
        eq(payments.kind, "CREDIT"),
        isNull(payments.invoicedById),
        sql`${payments.amount} > 0`,
      ),
    )
    .orderBy(asc(payments.createdAt));
  if (credits.length === 0) return null;
  const [line] = await db.select().from(installments).where(eq(installments.id, installmentId)).limit(1);
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, line.contractId)).limit(1);
  const parties = await partiesOf(contract.id);
  if (!parties) return null;

  const grossCents = credits.reduce((sum, one) => sum + toCents(one.amount), 0);
  const model = modelOf(contract);
  const split = splitGross(grossCents, { netCents: toCents(line.netAmount), vatCents: toCents(line.vatAmount) }, model);
  const rate = split.netCents > 0 ? Math.round((split.vatCents / split.netCents) * 100 * 1000) / 1000 : model.rate;
  const number = await nextInvoiceNumber();
  const standing = await standingOf(contract.id);

  const snapshot: IssuedSnapshot = {
    company: parties.company,
    client: parties.client,
    contractReference: contract.reference ?? "",
    property: parties.property,
    stage: line.label,
    description: `${line.label}${parties.property ? `, ${parties.property}` : ""}${contract.reference ? `, contract ${contract.reference}` : ""}`,
    paidOn: when.toISOString(),
    issuedOn: when.toISOString(),
    method: "CREDIT",
    reference: "",
    netCents: split.netCents,
    vatCents: split.vatCents,
    totalCents: grossCents,
    rate,
    parts: split.parts,
    creditAppliedCents: grossCents,
    payableCents: 0,
    ...standing,
    invoiceNumber: number,
    receiptNumber: "",
    recordedBy: who?.name ?? "",
  };
  const pdf = await invoicePdf(snapshot);
  const documentId = await keepPdf(pdf, `Invoice ${number}.pdf`, `Invoice ${number}`, "INVOICE", contract.id, who?.id ?? null);
  const [invoice] = await db
    .insert(issuedDocuments)
    .values({
      kind: "INVOICE",
      number,
      issuedOn: when,
      paymentId: credits[credits.length - 1].id,
      contractId: contract.id,
      clientId: contract.clientId ?? null,
      netAmount: fromCents(split.netCents),
      vatAmount: fromCents(split.vatCents),
      vatRate: rate.toFixed(3),
      totalAmount: fromCents(grossCents),
      snapshot: JSON.stringify(snapshot),
      documentId,
    })
    .returning();
  await db
    .update(payments)
    .set({ invoicedById: invoice.id })
    .where(inArray(payments.id, credits.map((one) => one.id)));
  return invoice;
}

/**
 * A credit note, on its own series.
 *
 * Either the full reversal of one invoice, naming it, or an agreed amount for a
 * refund or a penalty, including VAT at the rate the buyer paid.
 */
export async function issueCreditNote(options: {
  contractId: string;
  purpose: "VAT_CHANGE" | "REFUND" | "PENALTY";
  reason: string;
  when: Date;
  netCents: number;
  vatCents: number;
  parts?: { rate: number; netCents: number; vatCents: number }[];
  description: string;
  relatesTo?: typeof issuedDocuments.$inferSelect | null;
  who?: { id?: string | null; name?: string | null } | null;
}): Promise<typeof issuedDocuments.$inferSelect> {
  const parties = await partiesOf(options.contractId);
  if (!parties) throw new Error("The contract is not there.");
  const number = await nextCreditNoteNumber();
  const totalCents = options.netCents + options.vatCents;
  const rate = options.netCents > 0 ? Math.round((options.vatCents / options.netCents) * 100 * 1000) / 1000 : 0;
  const standing = await standingOf(options.contractId);
  const snapshot: IssuedSnapshot = {
    company: parties.company,
    client: parties.client,
    contractReference: parties.row.contract.reference ?? "",
    property: parties.property,
    stage: "",
    description: options.description,
    paidOn: options.when.toISOString(),
    issuedOn: options.when.toISOString(),
    method: "",
    reference: "",
    netCents: options.netCents,
    vatCents: options.vatCents,
    totalCents,
    rate,
    parts: options.parts,
    ...standing,
    invoiceNumber: "",
    receiptNumber: "",
    recordedBy: options.who?.name ?? "",
    creditNoteNumber: number,
    relatesToInvoice: options.relatesTo?.number,
    relatesToInvoiceDate: options.relatesTo ? new Date(options.relatesTo.issuedOn).toISOString() : undefined,
    purpose: options.purpose,
    reason: options.reason,
  };
  const pdf = await creditNotePdf(snapshot);
  const documentId = await keepPdf(pdf, `Credit note ${number}.pdf`, `Credit note ${number}`, "CREDIT_NOTE", options.contractId, options.who?.id ?? null);
  const [note] = await db
    .insert(issuedDocuments)
    .values({
      kind: "CREDIT_NOTE",
      number,
      issuedOn: options.when,
      paymentId: options.relatesTo?.paymentId ?? null,
      contractId: options.contractId,
      clientId: parties.row.contract.clientId ?? null,
      invoiceId: options.relatesTo?.id ?? null,
      netAmount: fromCents(options.netCents),
      vatAmount: fromCents(options.vatCents),
      vatRate: rate.toFixed(3),
      totalAmount: fromCents(totalCents),
      snapshot: JSON.stringify(snapshot),
      documentId,
      purpose: options.purpose,
      reason: options.reason,
    })
    .returning();
  return note;
}

/**
 * A payment taken off again: its papers are marked void, never removed.
 *
 * The numbers stay used, so the series has no gap, and the list shows them
 * struck through with the reason.
 */
export async function voidForPayment(paymentId: string, reason: string): Promise<void> {
  await db
    .update(issuedDocuments)
    .set({ voidedAt: new Date(), voidReason: reason })
    .where(and(eq(issuedDocuments.paymentId, paymentId), isNull(issuedDocuments.voidedAt)));
}

type Attachment = { filename: string; content: Buffer; contentType: string; documentId: string };

/** One issued paper as an attachment: its stamped copy when it has one. */
export async function paperAttachment(paper: typeof issuedDocuments.$inferSelect): Promise<Attachment | null> {
  const id = paper.stampedDocumentId ?? paper.documentId;
  const content = await readDocument(id);
  if (!content || !id) return null;
  const name = paper.kind === "INVOICE" ? "Invoice" : paper.kind === "RECEIPT" ? "Receipt" : "Credit note";
  return {
    filename: `${name} ${paper.number}${paper.stampedDocumentId ? " CANCELLED" : ""}.pdf`,
    content,
    contentType: "application/pdf",
    documentId: id,
  };
}

/** The PDF files of one payment's papers, for a letter. */
export async function issuedAttachments(paymentId: string): Promise<Attachment[]> {
  const pair = await issuedFor(paymentId);
  const out: Attachment[] = [];
  for (const paper of [pair.invoice, pair.receipt]) {
    if (!paper) continue;
    const one = await paperAttachment(paper);
    if (one) out.push(one);
  }
  return out;
}

/* ---------------------------------------------------------------------------
   The list under Invoices, Clients
   --------------------------------------------------------------------------- */

export type IssuedFilters = {
  query?: string;
  from?: string;
  to?: string;
  project?: string;
  kind?: string;
  state?: string;
  limit?: number;
  offset?: number;
};

/**
 * Every paper issued to buyers, one line each: invoices, receipts and credit
 * notes, newest first, with what each one relates to.
 */
export async function listIssued(filters: IssuedFilters) {
  const parts: SQL[] = [];
  if (filters.query) {
    const like = `%${filters.query}%`;
    parts.push(
      or(
        ilike(clients.firstName, like),
        ilike(clients.lastName, like),
        sql`concat(${clients.firstName}, ' ', ${clients.lastName}) ilike ${like}`,
        ilike(issuedDocuments.number, like),
        ilike(contracts.reference, like),
        ilike(units.code, like),
      ) as SQL,
    );
  }
  if (filters.from) parts.push(gte(issuedDocuments.issuedOn, new Date(`${filters.from}T00:00:00`)));
  if (filters.to) parts.push(lte(issuedDocuments.issuedOn, new Date(`${filters.to}T23:59:59`)));
  if (filters.project) parts.push(eq(units.projectId, filters.project));
  if (filters.kind === "INVOICE" || filters.kind === "RECEIPT" || filters.kind === "CREDIT_NOTE") {
    parts.push(eq(issuedDocuments.kind, filters.kind));
  }
  if (filters.state === "void") parts.push(sql`${issuedDocuments.voidedAt} is not null`);
  else if (filters.state === "credited") parts.push(sql`${issuedDocuments.creditedById} is not null`);
  else if (filters.state !== "all") parts.push(isNull(issuedDocuments.voidedAt));

  const where = parts.length ? and(...parts) : undefined;

  const rows = await db
    .select({
      paper: issuedDocuments,
      client: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName },
      contract: { id: contracts.id, reference: contracts.reference },
      unit: { code: units.code },
      project: { name: projects.name },
    })
    .from(issuedDocuments)
    .leftJoin(clients, eq(clients.id, issuedDocuments.clientId))
    .leftJoin(contracts, eq(contracts.id, issuedDocuments.contractId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .where(where)
    .orderBy(desc(issuedDocuments.issuedOn), desc(issuedDocuments.createdAt));

  /* The numbers each paper points at, so a line can say "credits 0016". */
  const byId = new Map<string, string>();
  const ids = [...new Set(rows.flatMap((row) => [row.paper.invoiceId, row.paper.creditedById, row.paper.replacedById]).filter(Boolean) as string[])];
  if (ids.length > 0) {
    for (const one of await db
      .select({ id: issuedDocuments.id, number: issuedDocuments.number, kind: issuedDocuments.kind })
      .from(issuedDocuments)
      .where(inArray(issuedDocuments.id, ids))) {
      byId.set(one.id, one.number);
    }
  }

  const all = rows.map((row) => {
    const snap = JSON.parse(row.paper.snapshot) as IssuedSnapshot;
    return {
      ...row,
      stage: snap.stage || snap.reason || "",
      invoiceNumber: row.paper.invoiceId ? (byId.get(row.paper.invoiceId) ?? "") : "",
      creditNoteNumber: row.paper.creditedById ? (byId.get(row.paper.creditedById) ?? "") : "",
      replacedByNumber: row.paper.replacedById ? (byId.get(row.paper.replacedById) ?? "") : "",
      creditApplied: snap.creditAppliedCents ?? 0,
    };
  });

  /* What was invoiced, what was credited, and the VAT that leaves. */
  const totals = all.reduce(
    (sum, one) => {
      if (one.paper.voidedAt) return sum;
      const total = toCents(one.paper.totalAmount);
      const vat = toCents(one.paper.vatAmount);
      if (one.paper.kind === "INVOICE") return { ...sum, invoiced: sum.invoiced + total, vat: sum.vat + vat };
      if (one.paper.kind === "CREDIT_NOTE") return { ...sum, credited: sum.credited + total, vat: sum.vat - vat };
      return { ...sum, received: sum.received + total };
    },
    { invoiced: 0, credited: 0, vat: 0, received: 0 },
  );

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 50;
  return { rows: all.slice(offset, offset + limit), total: all.length, totals };
}

/** Payments recorded before the papers existed, which can be issued by hand. */
export async function paymentsWithoutPapers(limit = 20) {
  return db
    .select({
      payment: payments,
      client: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName },
      contract: { id: contracts.id, reference: contracts.reference },
    })
    .from(payments)
    .innerJoin(contracts, eq(contracts.id, payments.contractId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(
      and(
        eq(payments.kind, "PAYMENT"),
        sql`not exists (select 1 from issued_documents i where i.payment_id = ${payments.id} and i.voided_at is null)`,
      ),
    )
    .orderBy(asc(payments.paidOn))
    .limit(limit);
}
