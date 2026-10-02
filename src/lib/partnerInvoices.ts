import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenseLines, expenses, issuedDocuments, projects, subownerDirectors, subowners } from "@/db/schema";
import { fromCents, toCents } from "@/lib/money";
import { nextInvoiceNumber } from "@/lib/receipts";
import { companyDetails, keepPdf, paperName, readDocument } from "@/lib/issued";
import { invoicePdf, type IssuedSnapshot } from "@/lib/paymentPdf";
import { sendAndRecord } from "@/lib/messaging";
import { sendEmail, type EmailAttachment } from "@/lib/messaging/email";
import { readSetting } from "@/lib/settings";
import { listEntries, shownCode } from "@/lib/choices";

/**
 * Invoices under Company, both ways.
 *
 * OUT is One Eleven charging a partner company, management fees for a month
 * and the like. The CRM numbers it in the company's one invoice series (the
 * same run as the buyers' invoices, so the numbering has no gaps), draws the
 * PDF, files it on the invoice and emails it to the partner. When their
 * payment arrives, the office uploads the receipt and it is marked paid.
 *
 * IN is an invoice One Eleven received. It is recorded with the supplier's own
 * number and PDF, and a copy goes to the company's own mailbox so it is on
 * record there too. Nothing is drawn for it: the paper is theirs.
 */

export const CATEGORY_WORDS: Record<string, string> = {
  MANAGEMENT_FEES: "Management fees",
  MARKETING: "Marketing",
  OFFICE: "Office",
  RENT: "Rent",
  BILLS: "Bills",
  LEGAL: "Legal and accounting",
  CONSTRUCTION: "Construction",
  OTHER: "Other",
};

/**
 * What the invoice is for, as it is printed: Other says what it is, and a
 * category the office added in the Builder prints under its own English name.
 */
export function whatFor(
  expense: { category: string; categoryOther: string | null; categoryChoice?: string | null },
  own: Record<string, string> = {},
): string {
  const shown = shownCode(expense.category, expense.categoryChoice);
  if (own[shown]) return own[shown];
  if (expense.category === "OTHER" && expense.categoryOther?.trim()) return expense.categoryOther.trim();
  return CATEGORY_WORDS[expense.category] ?? expense.category;
}

/** The English names of the categories the office added, for whatFor. */
export async function ownCategoryWords(): Promise<Record<string, string>> {
  return Object.fromEntries(
    (await listEntries("expenseCategory")).filter((one) => !one.builtin).map((one) => [one.code, one.labelEn || one.defaultEn]),
  );
}

async function load(expenseId: string) {
  const [row] = await db
    .select({ expense: expenses, partner: subowners, project: projects })
    .from(expenses)
    .leftJoin(subowners, eq(subowners.id, expenses.subownerId))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(eq(expenses.id, expenseId))
    .limit(1);
  return row ?? null;
}

/** The lines of an invoice for several developments, in order, with each development's name. */
export async function linesOf(expenseId: string) {
  return db
    .select({
      id: expenseLines.id,
      projectId: expenseLines.projectId,
      project: projects.name,
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

/** The address a partner is written to: their own, or their first director's. */
async function partnerEmail(subownerId: string, own: string | null): Promise<string | null> {
  if (own?.trim()) return own.trim();
  const [director] = await db
    .select()
    .from(subownerDirectors)
    .where(eq(subownerDirectors.subownerId, subownerId))
    .orderBy(asc(subownerDirectors.createdAt))
    .limit(1);
  return director?.email?.trim() || director?.emailAlternate?.trim() || null;
}

/**
 * Number and draw the invoice to the partner, once.
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
  if (!row || row.expense.direction !== "OUT" || !row.partner) return null;
  if (row.expense.issuedDocumentId) {
    const [done] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, row.expense.issuedDocumentId)).limit(1);
    if (done) return done.number;
  }

  const { expense, partner, project } = row;
  const netCents = toCents(expense.netAmount);
  const vatCents = toCents(expense.vatAmount);
  const totalCents = toCents(expense.totalAmount);
  const rate = expense.vatRate !== null ? Number(expense.vatRate) : netCents > 0 ? Math.round((vatCents / netCents) * 100000) / 1000 : 0;
  const issuedOn = expense.issueDate ?? new Date();
  const number = await nextInvoiceNumber();
  const label = whatFor(expense, await ownCategoryWords());

  /* Several developments: a line each, named, with its own amount. */
  const lines = await linesOf(expense.id);
  const developments = lines.length > 0 ? [...new Set(lines.map((one) => one.project).filter(Boolean))].join(", ") : project?.name ?? "";

  const snapshot: IssuedSnapshot = {
    company: await companyDetails(),
    client: {
      name: partner.company?.trim() || partner.name,
      address: partner.address ?? "",
      country: partner.country ?? "",
      idNumber: "",
      vatNumber: partner.vatNumber ?? "",
      email: (await partnerEmail(partner.id, partner.email)) ?? "",
      phone: partner.phone ?? "",
      registration: partner.registryNumber ?? "",
    },
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
    contractTotalCents: 0,
    receivedToDateCents: 0,
    balanceCents: 0,
    invoiceNumber: number,
    receiptNumber: "",
    recordedBy: who?.name ?? "",
    billTo: "partner",
    dueOn: expense.dueDate ? expense.dueDate.toISOString() : undefined,
    lines:
      lines.length > 0
        ? lines.map((one) => ({
            description: [label, one.project, one.description].filter(Boolean).join(", "),
            netCents: toCents(one.netAmount),
            vatCents: toCents(one.vatAmount),
          }))
        : undefined,
  };

  const pdf = await invoicePdf(snapshot);
  const documentId = await keepPdf(pdf, `${paperName("Invoice", number, label, developments)}.pdf`, paperName("Invoice", number, label, developments), "INVOICE", null, who?.id ?? null, expense.id);
  const [paper] = await db
    .insert(issuedDocuments)
    .values({
      kind: "INVOICE",
      number,
      issuedOn,
      expenseId: expense.id,
      netAmount: fromCents(netCents),
      vatAmount: fromCents(vatCents),
      vatRate: rate.toFixed(3),
      totalAmount: fromCents(totalCents),
      snapshot: JSON.stringify(snapshot),
      documentId,
    })
    .returning();

  await db
    .update(expenses)
    .set({ issuedDocumentId: paper.id, reference: number, updatedAt: new Date() })
    .where(eq(expenses.id, expense.id));

  return number;
}

/**
 * The words of the two invoice emails, in one place.
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
}): { subject: string; body: string } {
  return {
    subject: `Invoice ${v.number} from One Eleven: ${v.what}`,
    body: [
      `Dear ${v.dear},`,
      "",
      `Please find attached invoice ${v.number} for ${v.what}${v.project ? `, ${v.project}` : ""}.`,
      "",
      `Amount before VAT: ${v.net}`,
      `VAT: ${v.vat}`,
      `Total: ${v.total}`,
      v.due ? `Due by: ${v.due}` : "",
      "",
      "Kind regards,",
      "One Eleven",
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n"),
  };
}

export function receivedLetter(v: {
  supplier: string;
  number: string;
  what: string;
  project: string;
  total: string;
  due: string;
}): { subject: string; body: string; html: string } {
  const body = [
    `Invoice received from ${v.supplier}${v.number ? `, their number ${v.number}` : ""}.`,
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

/**
 * The invoice to whoever it concerns.
 *
 * OUT goes to the partner with the PDF. IN goes to the company's own address
 * with the supplier's files, so the invoice is on record in the mailbox too.
 */
export async function emailCompanyInvoice(expenseId: string): Promise<Emailed> {
  const row = await load(expenseId);
  if (!row) return { status: "SKIPPED", to: null, detail: "The invoice is not there." };
  const { expense, partner, project } = row;
  const label = whatFor(expense, await ownCategoryWords());
  const money = (value: string) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(toCents(value) / 100);

  const files: EmailAttachment[] = [];
  const filed = await db.select().from(documents).where(eq(documents.expenseId, expense.id)).orderBy(asc(documents.createdAt));
  for (const doc of filed) {
    const content = await readDocument(doc.id);
    if (content) files.push({ filename: doc.originalName || `${doc.title}.pdf`, content, contentType: doc.mimeType || "application/pdf" });
  }

  let result: { status: string; error?: string | null };
  let to: string | null;

  if (expense.direction === "OUT") {
    if (!partner) return { status: "SKIPPED", to: null, detail: "No company is chosen on this invoice." };
    to = await partnerEmail(partner.id, partner.email);
    if (!to) return { status: "SKIPPED", to: null, detail: `${partner.name} has no email address on their record.` };
    const paper = files.filter((one) => one.filename.startsWith("Invoice "));
    const letter = partnerLetter({
      number: expense.reference ?? "",
      dear: partner.contactName?.trim() || partner.company?.trim() || partner.name,
      what: expense.description?.trim() || label,
      project: project?.name ?? "",
      net: money(expense.netAmount),
      vat: money(expense.vatAmount),
      total: money(expense.totalAmount),
      due: expense.dueDate ? expense.dueDate.toLocaleDateString("en-GB") : "",
    });
    result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: partner.name, email: to, subownerId: partner.id },
      subject: letter.subject,
      body: letter.body,
      withOptOut: false,
      attachments: paper.length > 0 ? paper : files,
    });
  } else {
    to = (await readSetting("company.email"))?.trim() || null;
    if (!to) return { status: "SKIPPED", to: null, detail: "The company email is not set in Settings." };
    const letter = receivedLetter({
      supplier: expense.supplier,
      number: expense.reference ?? "",
      what: expense.description?.trim() || label,
      project: project?.name ?? "",
      total: money(expense.totalAmount),
      due: expense.dueDate ? expense.dueDate.toLocaleDateString("en-GB") : "",
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
