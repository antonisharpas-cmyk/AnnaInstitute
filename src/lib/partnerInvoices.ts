import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenseLines, expensePayments, expenses, issuedDocuments, projects } from "@/db/schema";
import { fromCents, toCents } from "@/lib/money";
import { nextInvoiceNumber, nextReceiptNumber } from "@/lib/receipts";
import { keepPdf, paperName, readDocument } from "@/lib/issued";
import { issuerDetails } from "@/lib/issuer";
import { invoicePdf, receiptPdfFrom, type IssuedSnapshot } from "@/lib/paymentPdf";
import { sendAndRecord } from "@/lib/messaging";
import { sendEmail, type EmailAttachment } from "@/lib/messaging/email";
import { readSetting } from "@/lib/settings";
import { englishWord, isCustom, listEntries, shownCode } from "@/lib/choices";
import { asOurCompanyId, partyOf } from "@/lib/parties";
import { statusFor } from "@/lib/expenses";

/**
 * Invoices under Company, both ways.
 *
 * OUT is money coming in: one of our companies, One Eleven unless another is
 * chosen, charges somebody, a company, a client, an agent, a constructor or
 * anybody else. The invoice has a line for each thing charged, each with its
 * own amount and VAT. The CRM numbers it in the issuing company's own series,
 * draws the PDF and emails it. Each payment that comes in is recorded, and our
 * receipt for it is numbered, drawn and emailed at once.
 *
 * IN is money going out: an invoice somebody sent to one of our companies. It
 * is filed with their number and their PDF, and a copy goes to our mailbox.
 * Each payment we make is recorded, and their receipt is filed against it.
 * Until every payment has its receipt, the invoice says the receipt is missing.
 */

export const CATEGORY_WORDS: Record<string, string> = {
  MANAGEMENT_FEES: "Management fees",
  SERVICES: "Services",
  MARKETING: "Marketing",
  OFFICE: "Office",
  RENT: "Rent",
  BILLS: "Bills",
  LEGAL: "Legal and accounting",
  CONSTRUCTION: "Construction",
  OTHER: "Other",
};

/**
 * What an invoice, or one line of it, is for, as it is printed: Other says what
 * it is, and a category the office added in the Builder prints under its own
 * English name.
 */
export function whatFor(
  expense: { category: string | null; categoryOther: string | null; categoryChoice?: string | null },
  own: Record<string, string> = {},
): string {
  const category = expense.category ?? "OTHER";
  const shown = shownCode(category, expense.categoryChoice);
  if (own[shown]) return own[shown];
  if (category === "OTHER" && expense.categoryOther?.trim()) return expense.categoryOther.trim();
  return CATEGORY_WORDS[category] ?? category;
}

/** The English names of the categories the office added, for whatFor. */
export async function ownCategoryWords(): Promise<Record<string, string>> {
  return Object.fromEntries(
    (await listEntries("expenseCategory")).filter((one) => !one.builtin).map((one) => [one.code, one.labelEn || one.defaultEn]),
  );
}

async function load(expenseId: string) {
  const [row] = await db
    .select({ expense: expenses, project: projects })
    .from(expenses)
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(eq(expenses.id, expenseId))
    .limit(1);
  return row ?? null;
}

/** The lines of an invoice, in order, with each development's name. */
export async function linesOf(expenseId: string) {
  return db
    .select({
      id: expenseLines.id,
      projectId: expenseLines.projectId,
      project: projects.name,
      category: expenseLines.category,
      categoryChoice: expenseLines.categoryChoice,
      categoryOther: expenseLines.categoryOther,
      vatRate: expenseLines.vatRate,
      description: expenseLines.description,
      netAmount: expenseLines.netAmount,
      vatAmount: expenseLines.vatAmount,
      totalAmount: expenseLines.totalAmount,
    })
    .from(expenseLines)
    .leftJoin(projects, eq(projects.id, expenseLines.projectId))
    .where(eq(expenseLines.expenseId, expenseId))
    .orderBy(asc(expenseLines.seq));
}

export type InvoiceLine = Awaited<ReturnType<typeof linesOf>>[number];

/** What a whole invoice is for, in words: its lines' categories, each once. */
export function whatForLines(lines: Pick<InvoiceLine, "category" | "categoryChoice" | "categoryOther">[], own: Record<string, string>): string {
  return [...new Set(lines.map((one) => whatFor(one, own)))].join(", ");
}

/** The payments on an invoice, oldest first. */
export async function paymentsOf(expenseId: string) {
  return db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId)).orderBy(asc(expensePayments.paidOn), asc(expensePayments.createdAt));
}

/** Paid, part paid or unpaid, from the payments, written on the invoice. */
export async function settle(expenseId: string): Promise<void> {
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense) return;
  const paid = await paymentsOf(expenseId);
  const paidCents = paid.reduce((a, one) => a + toCents(one.amount), 0);
  const totalCents = toCents(expense.totalAmount);
  await db
    .update(expenses)
    .set({
      paidAmount: fromCents(paidCents),
      status: statusFor(totalCents, paidCents),
      paidOn: paid.length > 0 ? paid[paid.length - 1].paidOn : null,
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, expenseId));
}

/** Whether an invoice we received is paid but still waits for a receipt. */
export function receiptMissing(direction: string, status: string, payments: { receiptDocumentId: string | null }[]): boolean {
  return direction === "IN" && status === "PAID" && payments.some((one) => !one.receiptDocumentId);
}

const rateOf = (line: Pick<InvoiceLine, "vatRate" | "netAmount" | "vatAmount">) => {
  if (line.vatRate !== null && line.vatRate !== undefined) return Number(line.vatRate);
  const net = toCents(line.netAmount);
  return net > 0 ? Math.round((toCents(line.vatAmount) / net) * 100000) / 1000 : 0;
};

/** The snapshot an invoice of ours is drawn from, and its receipts after it. */
async function snapshotOf(expenseId: string, number: string, who: { name?: string | null } | null): Promise<IssuedSnapshot | null> {
  const row = await load(expenseId);
  if (!row) return null;
  const { expense } = row;
  const party = await partyOf(expense);
  const own = await ownCategoryWords();
  const lines = await linesOf(expense.id);
  const label = whatForLines(lines, own) || whatFor(expense, own);
  const developments = [...new Set(lines.map((one) => one.project).filter(Boolean))].join(", ");
  const netCents = toCents(expense.netAmount);
  const vatCents = toCents(expense.vatAmount);
  const totalCents = toCents(expense.totalAmount);

  /* The VAT by rate, when the lines are not all at the same one. */
  const byRate = new Map<number, { netCents: number; vatCents: number }>();
  for (const line of lines) {
    const rate = rateOf(line);
    const was = byRate.get(rate) ?? { netCents: 0, vatCents: 0 };
    byRate.set(rate, { netCents: was.netCents + toCents(line.netAmount), vatCents: was.vatCents + toCents(line.vatAmount) });
  }
  const parts = [...byRate.entries()].sort((a, b) => b[0] - a[0]).map(([rate, sum]) => ({ rate, ...sum }));
  const rate = parts.length === 1 ? parts[0].rate : expense.vatRate !== null ? Number(expense.vatRate) : 0;
  const issuedOn = expense.issueDate ?? new Date();

  return {
    company: await issuerDetails(await asOurCompanyId(expense.ourCompanyId)),
    client: party.bill,
    contractReference: "",
    property: developments,
    stage: label,
    description: expense.description?.trim() || label,
    paidOn: issuedOn.toISOString(),
    issuedOn: issuedOn.toISOString(),
    method: "",
    reference: "",
    netCents,
    vatCents,
    totalCents,
    rate,
    parts: parts.length > 1 ? parts : undefined,
    contractTotalCents: 0,
    receivedToDateCents: 0,
    balanceCents: 0,
    invoiceNumber: number,
    receiptNumber: "",
    recordedBy: who?.name ?? "",
    billTo: "partner",
    dueOn: expense.dueDate ? expense.dueDate.toISOString() : undefined,
    lines: lines.map((one) => ({
      description: [whatFor(one, own), one.project, one.description].filter(Boolean).join(", "),
      netCents: toCents(one.netAmount),
      vatCents: toCents(one.vatAmount),
      rate: rateOf(one),
    })),
  };
}

/**
 * Number and draw the invoice we issue, once, in the series of the company it
 * is from.
 *
 * Returns the invoice number. Calling it again on an invoice that already has
 * its paper changes nothing, so a save that is pressed twice never uses two
 * numbers.
 */
export async function issuePartnerInvoice(
  expenseId: string,
  who: { id?: string | null; name?: string | null } | null,
): Promise<string | null> {
  const row = await load(expenseId);
  if (!row || row.expense.direction !== "OUT") return null;
  if (row.expense.issuedDocumentId) {
    const [done] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, row.expense.issuedDocumentId)).limit(1);
    if (done) return done.number;
  }
  const issuerId = await asOurCompanyId(row.expense.ourCompanyId);
  const number = await nextInvoiceNumber(issuerId);
  const snapshot = await snapshotOf(expenseId, number, who);
  if (!snapshot) return null;

  const pdf = await invoicePdf(snapshot);
  const title = paperName("Invoice", number, snapshot.stage, snapshot.property);
  const documentId = await keepPdf(pdf, `${title}.pdf`, title, "INVOICE", null, who?.id ?? null, expenseId);
  const [paper] = await db
    .insert(issuedDocuments)
    .values({
      kind: "INVOICE",
      number,
      issuedOn: new Date(snapshot.issuedOn),
      expenseId,
      issuerId,
      netAmount: fromCents(snapshot.netCents),
      vatAmount: fromCents(snapshot.vatCents),
      vatRate: snapshot.rate.toFixed(3),
      totalAmount: fromCents(snapshot.totalCents),
      snapshot: JSON.stringify(snapshot),
      documentId,
    })
    .returning();

  await db.update(expenses).set({ issuedDocumentId: paper.id, reference: number, updatedAt: new Date() }).where(eq(expenses.id, expenseId));
  return number;
}

/**
 * Our receipt for money received on an invoice we issued: numbered in the same
 * company's receipt series, drawn and filed on the invoice.
 */
export async function issueIncomeReceipt(paymentId: string, who: { id?: string | null; name?: string | null } | null) {
  const [payment] = await db.select().from(expensePayments).where(eq(expensePayments.id, paymentId)).limit(1);
  if (!payment) return null;
  if (payment.issuedDocumentId) {
    const [done] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, payment.issuedDocumentId)).limit(1);
    if (done) return done;
  }
  const row = await load(payment.expenseId);
  if (!row || row.expense.direction !== "OUT") return null;
  const { expense } = row;
  const issuerId = await asOurCompanyId(expense.ourCompanyId);
  const base = await snapshotOf(expense.id, expense.reference ?? "", who);
  if (!base) return null;

  const all = await paymentsOf(expense.id);
  const upTo = all.slice(0, all.findIndex((one) => one.id === paymentId) + 1);
  const paidCents = upTo.reduce((a, one) => a + toCents(one.amount), 0);
  const amountCents = toCents(payment.amount);
  const totalCents = toCents(expense.totalAmount);
  const number = await nextReceiptNumber(payment.paidOn, issuerId);
  const method = payment.method ?? "";

  const snapshot: IssuedSnapshot = {
    ...base,
    description: `Payment of invoice ${expense.reference ?? ""}, ${base.stage}`.replace(/\s+,/, ","),
    paidOn: payment.paidOn.toISOString(),
    issuedOn: new Date().toISOString(),
    method,
    methodName: payment.methodOther?.trim() || (method && isCustom(method) ? await englishWord("paymentMethod", method) : undefined),
    reference: payment.reference ?? "",
    netCents: amountCents,
    vatCents: 0,
    totalCents: amountCents,
    receivedToDateCents: paidCents,
    balanceCents: Math.max(0, totalCents - paidCents),
    receiptNumber: number,
    parts: undefined,
    lines: undefined,
    billTo: undefined,
    againstInvoice: {
      number: expense.reference ?? "",
      totalCents,
      paidCents,
      remainingCents: Math.max(0, totalCents - paidCents),
    },
  };

  const pdf = await receiptPdfFrom(snapshot);
  const title = paperName("Receipt", number, base.stage, base.property);
  const documentId = await keepPdf(pdf, `${title}.pdf`, title, "RECEIPT", null, who?.id ?? null, expense.id);
  const [paper] = await db
    .insert(issuedDocuments)
    .values({
      kind: "RECEIPT",
      number,
      issuedOn: new Date(),
      expenseId: expense.id,
      issuerId,
      invoiceId: expense.issuedDocumentId,
      netAmount: fromCents(amountCents),
      vatAmount: "0",
      vatRate: "0",
      totalAmount: fromCents(amountCents),
      snapshot: JSON.stringify(snapshot),
      documentId,
    })
    .returning();
  await db.update(expensePayments).set({ issuedDocumentId: paper.id }).where(eq(expensePayments.id, paymentId));
  return paper;
}

/** A receipt of ours that is taken back: the number stays used, the paper is void. */
export async function voidIncomeReceipt(issuedDocumentId: string | null, reason: string) {
  if (!issuedDocumentId) return;
  await db
    .update(issuedDocuments)
    .set({ voidedAt: new Date(), voidReason: reason })
    .where(and(eq(issuedDocuments.id, issuedDocumentId), isNull(issuedDocuments.voidedAt)));
}

/**
 * The words of the invoice emails, in one place.
 *
 * Used for the real email and for the test the office sends itself from the
 * Automatic emails page, so the test is always the letter that really goes.
 */
export function partnerLetter(v: {
  number: string;
  dear: string;
  what: string;
  project: string;
  net: string;
  vat: string;
  total: string;
  due: string;
  from?: string;
  /** The lines, each with its amount, when there is more than one. */
  lines?: string[];
}): { subject: string; body: string } {
  return {
    subject: `Invoice ${v.number} from ${v.from || "One Eleven"}: ${v.what}`,
    body: [
      `Dear ${v.dear},`,
      "",
      `Please find attached invoice ${v.number} for ${v.what}${v.project ? `, ${v.project}` : ""}.`,
      "",
      ...(v.lines && v.lines.length > 1 ? [...v.lines, ""] : []),
      `Amount before VAT: ${v.net}`,
      `VAT: ${v.vat}`,
      `Total: ${v.total}`,
      v.due ? `Due by: ${v.due}` : "",
      "",
      "Kind regards,",
      v.from || "One Eleven",
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n"),
  };
}

export function incomeReceiptLetter(v: {
  dear: string;
  receipt: string;
  invoice: string;
  amount: string;
  day: string;
  remaining: string;
  from: string;
}): { subject: string; body: string } {
  return {
    subject: `Receipt ${v.receipt} from ${v.from}: ${v.amount} received`,
    body: [
      `Dear ${v.dear},`,
      "",
      `Thank you for your payment of ${v.amount} on ${v.day} against invoice ${v.invoice}.`,
      "",
      "Our receipt is attached.",
      v.remaining ? `Still to pay on this invoice: ${v.remaining}.` : "The invoice is now paid in full.",
      "",
      "Kind regards,",
      v.from,
    ].join("\n"),
  };
}

export function receivedLetter(v: {
  supplier: string;
  number: string;
  what: string;
  project: string;
  total: string;
  due: string;
  to?: string;
}): { subject: string; body: string; html: string } {
  const body = [
    `Invoice received from ${v.supplier}${v.number ? `, their number ${v.number}` : ""}${v.to ? `, to ${v.to}` : ""}.`,
    `For: ${v.what}${v.project ? `, ${v.project}` : ""}`,
    `Total: ${v.total}${v.due ? `, due ${v.due}` : ""}`,
  ].join("\n");
  return {
    subject: `Invoice received: ${v.supplier}, ${v.total}`,
    body,
    html: body.split("\n").map((line) => `<p>${line.replace(/</g, "&lt;")}</p>`).join(""),
  };
}

export type Emailed = { status: "SENT" | "SKIPPED" | "FAILED"; to: string | null; detail: string };

const euro = (cents: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * The invoice to whoever it concerns.
 *
 * OUT goes to the party it is to, with the PDF. IN goes to the mailbox of our
 * company it is to, with their files, so the invoice is on record there too.
 */
export async function emailCompanyInvoice(expenseId: string): Promise<Emailed> {
  const row = await load(expenseId);
  if (!row) return { status: "SKIPPED", to: null, detail: "The invoice is not there." };
  const { expense } = row;
  const own = await ownCategoryWords();
  const lines = await linesOf(expense.id);
  const label = whatForLines(lines, own) || whatFor(expense, own);
  const developments = [...new Set(lines.map((one) => one.project).filter(Boolean))].join(", ");
  const ours = await issuerDetails(await asOurCompanyId(expense.ourCompanyId));
  const money = (value: string) => euro(toCents(value));

  const files: EmailAttachment[] = [];
  const filed = await db.select().from(documents).where(eq(documents.expenseId, expense.id)).orderBy(asc(documents.createdAt));
  for (const doc of filed) {
    if (doc.category === "RECEIPT") continue;
    const content = await readDocument(doc.id);
    if (content) files.push({ filename: doc.originalName || `${doc.title}.pdf`, content, contentType: doc.mimeType || "application/pdf" });
  }

  let result: { status: string; error?: string | null };
  let to: string | null;

  if (expense.direction === "OUT") {
    const party = await partyOf(expense);
    to = party.email || null;
    if (!to) return { status: "SKIPPED", to: null, detail: `${party.name} has no email address. Add one and press Email it again.` };
    const paper = filed.find((doc) => doc.category === "INVOICE");
    const attachment = paper ? files.find((one) => one.filename === (paper.originalName || `${paper.title}.pdf`)) : null;
    const letter = partnerLetter({
      number: expense.reference ?? "",
      dear: party.dear,
      what: expense.description?.trim() || label,
      project: developments,
      net: money(expense.netAmount),
      vat: money(expense.vatAmount),
      total: money(expense.totalAmount),
      due: expense.dueDate ? expense.dueDate.toLocaleDateString("en-GB") : "",
      from: ours.name,
      lines: lines.map((one) => `${[whatFor(one, own), one.project, one.description].filter(Boolean).join(", ")}: ${money(one.totalAmount)}`),
    });
    result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { ...party.recipient, email: to },
      subject: letter.subject,
      body: letter.body,
      withOptOut: false,
      attachments: attachment ? [attachment] : files,
    });
  } else {
    to = ours.email?.trim() || (await readSetting("company.email"))?.trim() || null;
    if (!to) return { status: "SKIPPED", to: null, detail: "The company email is not set in Settings." };
    const letter = receivedLetter({
      supplier: expense.supplier,
      number: expense.reference ?? "",
      what: expense.description?.trim() || label,
      project: developments,
      total: money(expense.totalAmount),
      due: expense.dueDate ? expense.dueDate.toLocaleDateString("en-GB") : "",
      to: ours.name,
    });
    result = await sendEmail({ to, subject: letter.subject, text: letter.body, html: letter.html, attachments: files });
  }

  if (result.status === "SENT") {
    await db.update(expenses).set({ emailedAt: new Date() }).where(eq(expenses.id, expense.id));
    return { status: "SENT", to, detail: `emailed to ${to}` };
  }
  if (result.status === "SIMULATED") return { status: "SKIPPED", to, detail: result.error ?? "email is not set up" };
  return { status: "FAILED", to, detail: result.error ?? "the email did not go" };
}

/** Our receipt for one payment, to whoever paid it, the moment it is recorded. */
export async function emailIncomeReceipt(paymentId: string): Promise<Emailed> {
  const [payment] = await db.select().from(expensePayments).where(eq(expensePayments.id, paymentId)).limit(1);
  if (!payment?.issuedDocumentId) return { status: "SKIPPED", to: null, detail: "There is no receipt for this payment." };
  const row = await load(payment.expenseId);
  if (!row) return { status: "SKIPPED", to: null, detail: "The invoice is not there." };
  const { expense } = row;
  const party = await partyOf(expense);
  const ours = await issuerDetails(await asOurCompanyId(expense.ourCompanyId));
  const [paper] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, payment.issuedDocumentId)).limit(1);
  const done = (status: Emailed["status"], detail: string, to: string | null): Emailed => ({ status, to, detail });
  const remember = async (error: string | null) =>
    db
      .update(expensePayments)
      .set(error ? { emailError: error } : { emailedAt: new Date(), emailError: null })
      .where(eq(expensePayments.id, paymentId));

  if (!party.email) {
    await remember(`${party.name} has no email address`);
    return done("SKIPPED", `${party.name} has no email address, so the receipt was not emailed.`, null);
  }
  const content = await readDocument(paper?.documentId);
  const all = await paymentsOf(expense.id);
  const upTo = all.slice(0, all.findIndex((one) => one.id === paymentId) + 1);
  const remainingCents = Math.max(0, toCents(expense.totalAmount) - upTo.reduce((a, one) => a + toCents(one.amount), 0));
  const letter = incomeReceiptLetter({
    dear: party.dear,
    receipt: paper?.number ?? "",
    invoice: expense.reference ?? "",
    amount: euro(toCents(payment.amount)),
    day: payment.paidOn.toLocaleDateString("en-GB"),
    remaining: remainingCents > 0 ? euro(remainingCents) : "",
    from: ours.name,
  });
  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: { ...party.recipient, email: party.email },
    subject: letter.subject,
    body: letter.body,
    withOptOut: false,
    attachments: content ? [{ filename: `Receipt ${paper?.number ?? ""}.pdf`, content, contentType: "application/pdf" }] : [],
  });
  if (result.status === "SENT") {
    await remember(null);
    return done("SENT", `receipt ${paper?.number ?? ""} emailed to ${party.email}`, party.email);
  }
  const error = result.error ?? (result.status === "SIMULATED" ? "email is not set up" : "the email did not go");
  await remember(error);
  return done(result.status === "SIMULATED" ? "SKIPPED" : "FAILED", error, party.email);
}
