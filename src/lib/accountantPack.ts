import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, clients, constructorPayments, constructorProjects, constructors, documents, expenses, issuedDocuments, projects, refunds, subowners } from "@/db/schema";
import { issuerIdOfContract } from "@/lib/issuer";
import { issuerOfProjects } from "@/lib/issuer";
import { toCents } from "@/lib/money";
import { paperAttachment, readDocument } from "@/lib/issued";
import type { IssuedSnapshot } from "@/lib/paymentPdf";
import { readSetting } from "@/lib/settings";
import { makeZip, type ZipEntry } from "@/lib/zip";
import { makeXlsx } from "@/lib/xlsx";
import { sendAndRecord } from "@/lib/messaging";
import { emailList } from "@/lib/buyers";
import { ownCategoryWords, whatFor } from "@/lib/partnerInvoices";

/**
 * The month's papers, for the accountant.
 *
 * Every invoice, receipt and credit note the CRM issued in a month, the
 * invoices One Eleven issued to the companies, and the invoices it received,
 * listed so the office can tick what goes. What is ticked becomes one ZIP:
 * a folder for each company that issued papers, a folder inside for each kind
 * of paper, and an Excel list of all of it at the top. It can be downloaded,
 * or emailed in one go to the accountant's address.
 */

export type PackGroup = "invoice" | "receipt" | "credit" | "companyInvoice" | "received" | "constructor" | "refundAck";

export const PACK_GROUPS: PackGroup[] = ["invoice", "receipt", "credit", "companyInvoice", "received", "constructor", "refundAck"];

const FOLDER: Record<PackGroup, string> = {
  invoice: "Invoices",
  receipt: "Receipts",
  credit: "Credit notes",
  companyInvoice: "Invoices issued",
  received: "Invoices received",
  constructor: "Constructors",
  refundAck: "Refund acknowledgements",
};

const KIND_WORD: Record<PackGroup, string> = {
  invoice: "Invoice",
  receipt: "Receipt",
  credit: "Credit note",
  companyInvoice: "Invoice issued",
  received: "Invoice received",
  constructor: "Constructor payment",
  refundAck: "Refund acknowledgement",
};

export type PackItem = {
  key: string;
  group: PackGroup;
  company: string;
  number: string;
  date: string;
  party: string;
  about: string;
  netCents: number;
  vatCents: number;
  totalCents: number;
  /** Voided or credited papers are listed, marked, and left unticked. */
  state: "" | "voided" | "credited" | "cancelled" | "pending" | "unsigned";
  files: number;
};

/** "2026-10" to the first moment of that month and of the next, on the office's clock. */
export function monthRange(month: string): { from: Date; to: Date; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const now = new Date();
  const y = match ? Number(match[1]) : now.getFullYear();
  const m = match ? Number(match[2]) - 1 : now.getMonth();
  const from = new Date(y, m, 1);
  return {
    from,
    to: new Date(y, m + 1, 1),
    label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  };
}

/** The month before this one, which is the one usually sent. */
export function lastMonth(): string {
  const now = new Date();
  const one = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${one.getFullYear()}-${String(one.getMonth() + 1).padStart(2, "0")}`;
}

const clean = (name: string) => name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "Company";
const day = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

function read(snapshot: string): Partial<IssuedSnapshot> {
  try {
    return JSON.parse(snapshot) as IssuedSnapshot;
  } catch {
    return {};
  }
}

/** Everything a month holds, issued and received. */
export async function monthPapers(month: string): Promise<PackItem[]> {
  const { from, to } = monthRange(month);
  const ownName = await readSetting("company.name");

  const issued = await db
    .select()
    .from(issuedDocuments)
    .where(and(gte(issuedDocuments.issuedOn, from), lt(issuedDocuments.issuedOn, to)))
    .orderBy(asc(issuedDocuments.issuedOn), asc(issuedDocuments.createdAt));

  const companies = await db.select({ id: subowners.id, name: subowners.name, company: subowners.company }).from(subowners);
  const companyName = (issuerId: string, snap: Partial<IssuedSnapshot>) =>
    snap.company?.name ||
    (issuerId ? (companies.find((one) => one.id === issuerId)?.company || companies.find((one) => one.id === issuerId)?.name) : "") ||
    ownName;

  const items: PackItem[] = issued.map((paper) => {
    const snap = read(paper.snapshot);
    const group: PackGroup = paper.expenseId && paper.kind !== "RECEIPT"
      ? "companyInvoice"
      : paper.kind === "RECEIPT"
        ? "receipt"
        : paper.kind === "CREDIT_NOTE"
          ? "credit"
          : "invoice";
    return {
      key: `i:${paper.id}`,
      group,
      company: companyName(paper.issuerId ?? "", snap),
      number: paper.number,
      date: new Date(paper.issuedOn).toISOString(),
      party: snap.client?.name ?? "",
      about: [snap.property, snap.stage].filter(Boolean).join(", ") || snap.description || "",
      netCents: toCents(paper.netAmount),
      vatCents: toCents(paper.vatAmount),
      totalCents: toCents(paper.totalAmount),
      state: paper.voidedAt ? (paper.replacedById ? "cancelled" : "voided") : paper.creditedById ? "credited" : "",
      files: paper.documentId ? 1 : 0,
    };
  });

  /* The invoices received that month, with the files filed on them. */
  const received = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.direction, "IN"),
        gte(sql`coalesce(${expenses.issueDate}, ${expenses.createdAt})`, from),
        lt(sql`coalesce(${expenses.issueDate}, ${expenses.createdAt})`, to),
      ),
    )
    .orderBy(asc(sql`coalesce(${expenses.issueDate}, ${expenses.createdAt})`));
  const files = received.length
    ? await db
        .select({ expenseId: documents.expenseId, n: sql<number>`count(*)::int` })
        .from(documents)
        .where(inArray(documents.expenseId, received.map((one) => one.id)))
        .groupBy(documents.expenseId)
    : [];
  const words = await ownCategoryWords();
  for (const one of received) {
    items.push({
      key: `e:${one.id}`,
      group: "received",
      /* Filed under the company of ours it was addressed to. */
      company: one.ourCompanyId ? companyName(one.ourCompanyId, {}) : ownName,
      number: one.reference ?? "",
      date: new Date(one.issueDate ?? one.createdAt).toISOString(),
      party: one.supplier,
      about: [whatFor(one, words), one.description].filter(Boolean).join(", "),
      netCents: toCents(one.netAmount),
      vatCents: toCents(one.vatAmount),
      totalCents: toCents(one.totalAmount),
      state: "",
      files: files.find((f) => f.expenseId === one.id)?.n ?? 0,
    });
  }

  /*
   * The payments to the constructors that month, with the papers filed on each:
   * their invoice and their receipt. A payment still pending is listed and left
   * unticked; a cancelled one is left out. Each goes under the company that
   * holds the development it was for.
   */
  const built = await db
    .select({ payment: constructorPayments, who: constructors, project: projects })
    .from(constructorPayments)
    .innerJoin(constructorProjects, eq(constructorProjects.id, constructorPayments.constructorProjectId))
    .innerJoin(constructors, eq(constructors.id, constructorProjects.constructorId))
    .leftJoin(projects, eq(projects.id, constructorProjects.projectId))
    .where(and(gte(constructorPayments.paidOn, from), lt(constructorPayments.paidOn, to), sql`${constructorPayments.status} <> 'CANCELLED'`))
    .orderBy(asc(constructorPayments.paidOn));
  const builtFiles = built.length
    ? await db
        .select({ paymentId: documents.constructorPaymentId, n: sql<number>`count(*)::int` })
        .from(documents)
        .where(inArray(documents.constructorPaymentId, built.map((one) => one.payment.id)))
        .groupBy(documents.constructorPaymentId)
    : [];
  const holders = await issuerOfProjects();
  for (const one of built) {
    const holder = one.project ? (holders.get(one.project.id) ?? "") : "";
    const totalCents = toCents(one.payment.amount);
    items.push({
      key: `c:${one.payment.id}`,
      group: "constructor",
      company: holder ? companyName(holder, {}) : ownName,
      number: "",
      date: new Date(one.payment.paidOn).toISOString(),
      party: one.who.company?.trim() || one.who.name,
      about: [one.project?.name, one.payment.kind].filter(Boolean).join(", "),
      netCents: totalCents,
      vatCents: 0,
      totalCents,
      state: one.payment.status === "PAID" ? "" : "pending",
      files: builtFiles.find((f) => f.paymentId === one.payment.id)?.n ?? 0,
    });
  }

  /*
   * The acknowledgement each refund or delay penalty comes with, beside its
   * credit note: the copy the client signed, or, until it is uploaded, the one
   * drawn up for signing, listed and left unticked.
   */
  const paidBack = await db
    .select({ refund: refunds, note: issuedDocuments, client: clients })
    .from(refunds)
    .leftJoin(issuedDocuments, eq(issuedDocuments.id, refunds.creditNoteId))
    .leftJoin(clients, eq(clients.id, refunds.clientId))
    .where(and(gte(refunds.paidOn, from), lt(refunds.paidOn, to), sql`${refunds.purpose} <> 'VAT_CHANGE'`))
    .orderBy(asc(refunds.paidOn));
  for (const one of paidBack) {
    if (!one.refund.signedDocumentId && !one.refund.acknowledgementDocumentId) continue;
    const totalCents = toCents(one.refund.amount);
    const issuer = one.note ? (one.note.issuerId ?? "") : await issuerIdOfContract(one.refund.contractId);
    items.push({
      key: `r:${one.refund.id}`,
      group: "refundAck",
      company: issuer ? companyName(issuer, {}) : ownName,
      number: one.note?.number ?? "",
      date: new Date(one.refund.paidOn).toISOString(),
      party: one.client ? `${one.client.firstName ?? ""} ${one.client.lastName ?? ""}`.trim() : "",
      about: `${one.refund.purpose === "PENALTY" ? "Delay penalty" : "Refund"}${one.note ? `, credit note ${one.note.number}` : ", nothing paid back"}`,
      netCents: totalCents,
      vatCents: 0,
      totalCents,
      state: one.refund.signedDocumentId ? "" : "unsigned",
      files: 1,
    });
  }

  return items;
}

/** The ticked papers as one ZIP: a folder per company, a folder per kind, and the list. */
export async function buildPack(month: string, keys: string[]) {
  const { label } = monthRange(month);
  const wanted = new Set(keys);
  const items = (await monthPapers(month)).filter((one) => wanted.has(one.key));
  const entries: ZipEntry[] = [];
  const rows: (string | number)[][] = [];
  const missing: string[] = [];

  for (const item of items) {
    const folder = `${clean(item.company)}/${FOLDER[item.group]}`;
    const placed: string[] = [];
    if (item.key.startsWith("i:")) {
      const [paper] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, item.key.slice(2))).limit(1);
      const file = paper ? await paperAttachment(paper) : null;
      if (file) {
        entries.push({ name: `${folder}/${file.filename}`, data: file.content, at: new Date(item.date) });
        placed.push(`${folder}/${file.filename}`);
      }
    } else {
      /* A refund's acknowledgement: the signed copy when it is in, the one drawn up otherwise. */
      let only: string | null = null;
      if (item.key.startsWith("r:")) {
        const [refund] = await db.select().from(refunds).where(eq(refunds.id, item.key.slice(2))).limit(1);
        only = refund?.signedDocumentId ?? refund?.acknowledgementDocumentId ?? "none";
      }
      const docs = await db
        .select()
        .from(documents)
        .where(
          only
            ? eq(documents.id, only)
            : item.key.startsWith("c:")
              ? eq(documents.constructorPaymentId, item.key.slice(2))
              : eq(documents.expenseId, item.key.slice(2)),
        )
        .orderBy(asc(documents.createdAt));
      for (const doc of docs) {
        const content = await readDocument(doc.id);
        if (!content) continue;
        const name = clean(`${item.party} ${item.number}`.trim()) + ` ${clean(doc.originalName || doc.title)}`;
        entries.push({ name: `${folder}/${name}`, data: content, at: new Date(item.date) });
        placed.push(`${folder}/${name}`);
      }
    }
    if (placed.length === 0) missing.push(`${KIND_WORD[item.group]} ${item.number}`.trim());
    rows.push([
      item.company,
      KIND_WORD[item.group],
      item.number,
      day(new Date(item.date)),
      item.party,
      item.about,
      item.netCents / 100,
      item.vatCents / 100,
      item.totalCents / 100,
      item.state === "pending" ? "Pending, not paid yet" : item.state === "unsigned" ? "Not signed yet" : item.state === "voided" ? "Voided" : item.state === "cancelled" ? "Cancelled, issued again at the reduced VAT" : item.state === "credited" ? "Credited" : "",
      placed.join(", ") || "No file",
    ]);
  }

  const list = makeXlsx(
    label,
    ["Company", "Paper", "Number", "Date", "Client or company", "About", "Before VAT", "VAT", "Total", "Status", "File in the ZIP"],
    rows,
    [34, 20, 10, 12, 30, 40, 13, 11, 13, 10, 60],
  );
  entries.unshift({ name: `List of papers, ${label}.xlsx`, data: list });

  return {
    zip: makeZip(entries),
    filename: `One Eleven papers, ${label}.zip`,
    label,
    count: items.length,
    missing,
    counts: PACK_GROUPS.map((group) => ({ group, n: items.filter((one) => one.group === group).length })),
  };
}

/** Emails of the size an inbox takes: past this, the office downloads it instead. */
export const MAX_EMAIL_BYTES = 20 * 1024 * 1024;

export async function emailPack(options: {
  month: string;
  keys: string[];
  to: string;
  note?: string;
  who: { id: string; email: string };
}): Promise<{ ok: boolean; detail: string }> {
  const addresses = emailList(options.to);
  if (addresses.length === 0) return { ok: false, detail: "Type the accountant's email address first." };
  const pack = await buildPack(options.month, options.keys);
  if (pack.count === 0) return { ok: false, detail: "Tick at least one paper." };
  if (pack.zip.length > MAX_EMAIL_BYTES) {
    return {
      ok: false,
      detail: `The ZIP is ${Math.round(pack.zip.length / 1048576)} MB, too large for one email. Download it and send it another way, or send it in two goes.`,
    };
  }

  const company = await readSetting("company.name");
  const lines = pack.counts.filter((one) => one.n > 0).map((one) => `${FOLDER[one.group]}: ${one.n}`);
  const body = [
    "Dear accountant,",
    "",
    `Attached are the papers of ${pack.label}, in one ZIP: a folder for each company, and inside it a folder for each kind of paper. The Excel list at the top of the ZIP names every one, with its amounts.`,
    "",
    ...lines,
    ...(options.note?.trim() ? ["", options.note.trim()] : []),
    ...(pack.missing.length ? ["", `Listed without a file: ${pack.missing.join(", ")}.`] : []),
    "",
    "Kind regards,",
    company,
  ].join("\n");

  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: { name: "Accountant", email: addresses[0] },
    cc: addresses.slice(1),
    subject: `${company}: papers for ${pack.label}`,
    body,
    withOptOut: false,
    attachments: [{ filename: pack.filename, content: pack.zip, contentType: "application/zip" }],
  });

  const { recordAudit } = await import("@/lib/audit");
  await recordAudit({
    action: "accountant.pack",
    entity: "settings",
    entityId: options.month,
    detail: `${pack.count} papers to ${addresses.join(", ")}: ${result.status}${result.error ? `, ${result.error}` : ""}`,
    userId: options.who.id,
    userEmail: options.who.email,
  });

  if (result.status === "SENT") return { ok: true, detail: `Sent to ${addresses.join(", ")}: ${pack.count} papers, ${Math.max(1, Math.round(pack.zip.length / 1024))} KB.` };
  if (result.status === "SIMULATED") return { ok: false, detail: result.error ?? "Email is not set up, so nothing was sent." };
  return { ok: false, detail: result.error ?? "It did not go." };
}

/** When each month was last sent, newest first. */
export async function packHistory(limit = 12) {
  return db
    .select({ month: auditLogs.entityId, detail: auditLogs.detail, at: auditLogs.createdAt, by: auditLogs.userEmail })
    .from(auditLogs)
    .where(eq(auditLogs.action, "accountant.pack"))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
