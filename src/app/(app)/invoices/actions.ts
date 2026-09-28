"use server";

import { splitChoice } from "@/lib/choices/lists";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenses, issuedDocuments, subowners } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { fromCents, parseAmount, toCents } from "@/lib/money";
import { emailCompanyInvoice, issuePartnerInvoice } from "@/lib/partnerInvoices";
import { removeDocument, storeDocuments } from "@/lib/uploads";
import { EXPENSE_CATEGORIES, statusFor, type ExpenseCategory } from "@/lib/expenses";

/**
 * The form, read the same way for both kinds.
 *
 * The office types the amount before VAT and the VAT rate; the VAT and the
 * total are worked out here, to the cent, so the paper and the record agree.
 */
async function read(formData: FormData) {
  const direction = String(formData.get("direction") ?? "IN") === "OUT" ? "OUT" : "IN";
  /* The office's own category from the Builder counts as a built in one. */
  const picked = splitChoice(String(formData.get("category") ?? "OTHER"));
  const category = picked.base;
  const netCents = parseAmount(String(formData.get("netAmount") ?? "0"));
  const rateText = String(formData.get("vatRate") ?? "").replace(",", ".").trim();
  const vatRate = rateText === "" ? 0 : Math.max(0, Number(rateText) || 0);
  const vatCents = Math.round((netCents * vatRate) / 100);
  const totalCents = netCents + vatCents;
  const paidCents = Math.min(parseAmount(String(formData.get("paidAmount") ?? "0")), totalCents);

  const issue = String(formData.get("issueDate") ?? "");
  const due = String(formData.get("dueDate") ?? "");
  const subownerId = String(formData.get("subownerId") ?? "").trim() || null;

  /* On an invoice to a partner the "from" is One Eleven and the partner is
     who it is to; the list shows the partner's name either way. */
  let supplier = String(formData.get("supplier") ?? "").trim();
  if (subownerId && (direction === "OUT" || !supplier)) {
    const [partner] = await db.select().from(subowners).where(eq(subowners.id, subownerId)).limit(1);
    supplier = partner?.company?.trim() || partner?.name || supplier;
  }

  return {
    direction,
    supplier,
    subownerId,
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(category)
      ? (category as ExpenseCategory)
      : "OTHER",
    categoryChoice: (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? picked.choice : null,
    categoryOther:
      category === "OTHER" && !picked.choice ? String(formData.get("categoryOther") ?? "").trim() || null : null,
    /* Their own number, on an invoice we received. Ours is given by the CRM. */
    reference: direction === "IN" ? String(formData.get("reference") ?? "").trim() || null : undefined,
    description: String(formData.get("description") ?? "").trim() || null,
    issueDate: issue ? new Date(`${issue}T12:00:00`) : direction === "OUT" ? new Date() : null,
    dueDate: due ? new Date(`${due}T12:00:00`) : null,
    netAmount: fromCents(netCents),
    vatRate: vatRate.toFixed(3),
    vatAmount: fromCents(vatCents),
    totalAmount: fromCents(totalCents),
    paidAmount: fromCents(paidCents),
    status: statusFor(totalCents, paidCents),
    paidOn: paidCents > 0 ? new Date() : null,
    projectId: String(formData.get("projectId") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

/** What became of the email, for the line at the bottom of the screen. */
async function sayWhatWasSent(expenseId: string, issued: string | null) {
  const mail = await emailCompanyInvoice(expenseId);
  const head = issued ? `Invoice ${issued} issued` : "Saved";
  await flash(
    `said.invoiceSaved|${head}, ${mail.status === "SENT" ? mail.detail : `the email did not go: ${mail.detail}`}`,
    mail.status === "SENT" ? "good" : "bad",
  );
}

/** An invoice the company received, or one it issues to a partner. */
export async function createExpense(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = await read(formData);
  if (parsed.direction === "OUT" && !parsed.subownerId) throw new Error("Choose the partner the invoice is to.");
  if (!parsed.supplier) throw new Error("Say who the invoice is from.");

  const inserted = await db
    .insert(expenses)
    .values({ ...parsed, reference: parsed.reference ?? null, recordedByEmail: user.email })
    .returning({ id: expenses.id });

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > 0) {
    await storeDocuments({
      files,
      title: parsed.reference ? `Invoice ${parsed.reference}` : `Invoice from ${parsed.supplier}`,
      category: "OTHER",
      attachTo: { expenseId: inserted[0].id },
      user,
    });
  }

  /* Ours to a partner: numbered, drawn and filed now, in the invoice series. */
  let issued: string | null = null;
  if (parsed.direction === "OUT") {
    issued = await issuePartnerInvoice(inserted[0].id, { id: user.id, name: user.name });
  }

  await recordAudit({
    action: parsed.direction === "OUT" ? "expense.issued" : "expense.create",
    entity: "expense",
    entityId: inserted[0].id,
    detail: `${parsed.direction === "OUT" ? `invoice ${issued ?? ""} to ` : ""}${parsed.supplier}, ${parsed.totalAmount}`,
    userId: user.id,
    userEmail: user.email,
  });

  await sayWhatWasSent(inserted[0].id, issued);
  revalidatePath("/invoices");
  redirect(`/invoices/${inserted[0].id}`);
}

export async function updateExpense(expenseId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [current] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!current) return;

  /*
   * An invoice we issued is a numbered paper that has gone to the partner, so
   * its figures stay as issued. Only the notes and the due date can change;
   * a correction is a new invoice.
   */
  if (current.direction === "OUT" && current.issuedDocumentId) {
    const due = String(formData.get("dueDate") ?? "");
    await db
      .update(expenses)
      .set({
        notes: String(formData.get("notes") ?? "").trim() || null,
        dueDate: due ? new Date(`${due}T12:00:00`) : current.dueDate,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, expenseId));
  } else {
    const parsed = await read(formData);
    await db
      .update(expenses)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(expenses.id, expenseId));
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > 0) {
    await storeDocuments({
      files,
      title: current.reference ? `Invoice ${current.reference}` : `Invoice from ${current.supplier}`,
      category: "OTHER",
      attachTo: { expenseId },
      user,
    });
  }

  await recordAudit({
    action: "expense.update",
    entity: "expense",
    entityId: expenseId,
    detail: current.supplier,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.invoiceSaved");
  revalidatePath(`/invoices/${expenseId}`);
  revalidatePath("/invoices");
}

/**
 * The partner's payment, proved by its receipt.
 *
 * Uploading the receipt is the moment the invoice is paid: the file is kept on
 * the invoice and the invoice is marked paid in full on that day.
 */
export async function uploadPaymentReceipt(expenseId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense) return;
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    await flash("said.chooseAFile", "bad");
    revalidatePath(`/invoices/${expenseId}`);
    return;
  }
  await storeDocuments({
    files,
    title: `Receipt for invoice ${expense.reference ?? ""}`.trim(),
    category: "RECEIPT",
    attachTo: { expenseId },
    user,
  });
  const totalCents = toCents(expense.totalAmount);
  const paidOn = String(formData.get("paidOn") ?? "");
  await db
    .update(expenses)
    .set({
      paidAmount: fromCents(totalCents),
      status: statusFor(totalCents, totalCents),
      paidOn: paidOn ? new Date(`${paidOn}T12:00:00`) : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, expenseId));
  await recordAudit({
    action: "expense.receipt",
    entity: "expense",
    entityId: expenseId,
    detail: `receipt filed, paid ${fromCents(totalCents)}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.invoicePaid");
  revalidatePath(`/invoices/${expenseId}`);
  revalidatePath("/invoices");
}

/** The same email again, on a button. */
export async function resendCompanyInvoice(expenseId: string) {
  await requireUser(["ADMIN"]);
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense) return;
  await sayWhatWasSent(expenseId, null);
  revalidatePath(`/invoices/${expenseId}`);
}

/** Mark an invoice paid in full, which is what happens most of the time. */
export async function markExpensePaid(expenseId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const rows = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  const expense = rows[0];
  if (!expense) return;

  const totalCents = toCents(expense.totalAmount);
  const typed = String(formData.get("amount") ?? "").trim();
  const paidCents = typed ? toCents(expense.paidAmount) + toCents(typed) : totalCents;
  const paidOn = String(formData.get("paidOn") ?? "");

  await db
    .update(expenses)
    .set({
      paidAmount: fromCents(Math.min(paidCents, totalCents)),
      status: statusFor(totalCents, paidCents),
      paidOn: paidOn ? new Date(paidOn) : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, expenseId));

  await recordAudit({
    action: "expense.paid",
    entity: "expense",
    entityId: expenseId,
    detail: fromCents(paidCents),
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.invoicePaid");
  revalidatePath(`/invoices/${expenseId}`);
  revalidatePath("/invoices");
}

export async function deleteExpenseFile(documentId: string, expenseId: string) {
  const user = await requireUser(["ADMIN"]);
  await removeDocument(documentId, user);
  revalidatePath(`/invoices/${expenseId}`);
}

export async function deleteExpense(expenseId: string) {
  const user = await requireUser(["ADMIN"]);

  /* An invoice we issued keeps its number in the series: the paper is marked
     void rather than taken away, so the run of numbers has no gap. */
  const [current] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (current?.issuedDocumentId) {
    await db
      .update(issuedDocuments)
      .set({ voidedAt: new Date(), voidReason: "The company invoice was deleted" })
      .where(eq(issuedDocuments.id, current.issuedDocumentId));
  }

  const filed = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.expenseId, expenseId));
  for (const doc of filed) await removeDocument(doc.id, user);

  await db.delete(expenses).where(eq(expenses.id, expenseId));

  await recordAudit({
    action: "expense.delete",
    entity: "expense",
    entityId: expenseId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/invoices");
  redirect("/invoices");
}
