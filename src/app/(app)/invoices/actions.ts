"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fromCents, toCents } from "@/lib/money";
import { removeDocument, storeDocuments } from "@/lib/uploads";
import { EXPENSE_CATEGORIES, statusFor, type ExpenseCategory } from "@/lib/expenses";

function read(formData: FormData) {
  const category = String(formData.get("category") ?? "OTHER");
  const netCents = toCents(String(formData.get("netAmount") ?? "0"));
  const vatCents = toCents(String(formData.get("vatAmount") ?? "0"));
  const typedTotal = String(formData.get("totalAmount") ?? "").trim();
  const totalCents = typedTotal ? toCents(typedTotal) : netCents + vatCents;
  const paidCents = toCents(String(formData.get("paidAmount") ?? "0"));

  const issue = String(formData.get("issueDate") ?? "");
  const due = String(formData.get("dueDate") ?? "");

  return {
    supplier: String(formData.get("supplier") ?? "").trim(),
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(category)
      ? (category as ExpenseCategory)
      : "OTHER",
    reference: String(formData.get("reference") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    issueDate: issue ? new Date(issue) : null,
    dueDate: due ? new Date(due) : null,
    netAmount: fromCents(netCents),
    vatAmount: fromCents(vatCents),
    totalAmount: fromCents(totalCents),
    paidAmount: fromCents(paidCents),
    status: statusFor(totalCents, paidCents),
    paidOn: paidCents > 0 ? new Date() : null,
    projectId: String(formData.get("projectId") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

/** An invoice the company has been sent. */
export async function createExpense(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = read(formData);
  if (!parsed.supplier) throw new Error("Say who the invoice is from.");

  const inserted = await db
    .insert(expenses)
    .values({ ...parsed, recordedByEmail: user.email })
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

  await recordAudit({
    action: "expense.create",
    entity: "expense",
    entityId: inserted[0].id,
    detail: `${parsed.supplier}, ${parsed.totalAmount}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/invoices");
  redirect(`/invoices/${inserted[0].id}`);
}

export async function updateExpense(expenseId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = read(formData);

  await db
    .update(expenses)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(expenses.id, expenseId));

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > 0) {
    await storeDocuments({
      files,
      title: parsed.reference ? `Invoice ${parsed.reference}` : `Invoice from ${parsed.supplier}`,
      category: "OTHER",
      attachTo: { expenseId },
      user,
    });
  }

  await recordAudit({
    action: "expense.update",
    entity: "expense",
    entityId: expenseId,
    detail: parsed.supplier,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/invoices/${expenseId}`);
  revalidatePath("/invoices");
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
