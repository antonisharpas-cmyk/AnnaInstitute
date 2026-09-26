import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenses, issuedDocuments, projects, subownerDirectors, subowners } from "@/db/schema";
import { fromCents, toCents } from "@/lib/money";
import { nextInvoiceNumber } from "@/lib/receipts";
import { companyDetails, keepPdf, readDocument } from "@/lib/issued";
import { invoicePdf, type IssuedSnapshot } from "@/lib/paymentPdf";
import { sendAndRecord } from "@/lib/messaging";
import { sendEmail, type EmailAttachment } from "@/lib/messaging/email";
import { readSetting } from "@/lib/settings";

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

/** What the invoice is for, as it is printed: Other says what it is. */
export function whatFor(expense: { category: string; categoryOther: string | null }): string {
  if (expense.category === "OTHER" && expense.categoryOther?.trim()) return expense.categoryOther.trim();
  return CATEGORY_WORDS[expense.category] ?? expense.category;
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
  const label = whatFor(expense);

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
    property: project?.name ?? "",
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
  };

  const pdf = await invoicePdf(snapshot);
  const documentId = await keepPdf(pdf, `Invoice ${number}.pdf`, `Invoice ${number}`, "INVOICE", null, who?.id ?? null, expense.id);
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
  const label = whatFor(expense);
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
    if (!partner) return { status: "SKIPPED", to: null, detail: "No partner is chosen on this invoice." };
    to = await partnerEmail(partner.id, partner.email);
    if (!to) return { status: "SKIPPED", to: null, detail: `${partner.name} has no email address on their record.` };
    const paper = files.filter((one) => one.filename.startsWith("Invoice "));
    result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: partner.name, email: to, subownerId: partner.id },
      subject: `Invoice ${expense.reference ?? ""} from One Eleven: ${expense.description?.trim() || label}`,
      body: [
        `Dear ${partner.contactName?.trim() || partner.company?.trim() || partner.name},`,
        "",
        `Please find attached invoice ${expense.reference ?? ""} for ${expense.description?.trim() || label}${project ? `, ${project.name}` : ""}.`,
        "",
        `Amount before VAT: ${money(expense.netAmount)}`,
        `VAT: ${money(expense.vatAmount)}`,
        `Total: ${money(expense.totalAmount)}`,
        expense.dueDate ? `Due by: ${expense.dueDate.toLocaleDateString("en-GB")}` : "",
        "",
        "Kind regards,",
        "One Eleven",
      ]
        .filter((line, i, all) => line !== "" || all[i - 1] !== "")
        .join("\n"),
      withOptOut: false,
      attachments: paper.length > 0 ? paper : files,
    });
  } else {
    to = (await readSetting("company.email"))?.trim() || null;
    if (!to) return { status: "SKIPPED", to: null, detail: "The company email is not set in Settings." };
    const text = [
      `Invoice received from ${expense.supplier}${expense.reference ? `, their number ${expense.reference}` : ""}.`,
      `For: ${expense.description?.trim() || label}${project ? `, ${project.name}` : ""}`,
      `Total: ${money(expense.totalAmount)}${expense.dueDate ? `, due ${expense.dueDate.toLocaleDateString("en-GB")}` : ""}`,
    ].join("\n");
    result = await sendEmail({
      to,
      subject: `Invoice received: ${expense.supplier}, ${money(expense.totalAmount)}`,
      text,
      html: text.split("\n").map((line) => `<p>${line.replace(/</g, "&lt;")}</p>`).join(""),
      attachments: files,
    });
  }

  if (result.status === "SENT") {
    await db.update(expenses).set({ emailedAt: new Date() }).where(eq(expenses.id, expense.id));
    return { status: "SENT", to, detail: `emailed to ${to}` };
  }
  if (result.status === "SIMULATED") return { status: "SKIPPED", to, detail: result.error ?? "email is not set up" };
  return { status: "FAILED", to, detail: result.error ?? "the email did not go" };
}
