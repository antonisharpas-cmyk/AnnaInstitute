"use server";

import { splitChoice } from "@/lib/choices/lists";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenseLines, expensePayments, expenses, issuedDocuments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { fromCents, parseAmount, toCents } from "@/lib/money";
import {
  emailCompanyInvoice,
  emailIncomeReceipt,
  issueIncomeReceipt,
  issuePartnerInvoice,
  settle,
  voidIncomeReceipt,
} from "@/lib/partnerInvoices";
import { asOurCompanyId, partyOf, splitParty } from "@/lib/parties";
import { removeDocument, storeDocument, storeDocuments } from "@/lib/uploads";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/expenses";

/**
 * The form, read the same way for both kinds.
 *
 * Every invoice is its lines: what each is for, the development it belongs to
 * when it belongs to one, the amount before VAT and its VAT rate. The VAT and
 * the totals are worked out here, line by line, to the cent, so the paper and
 * the record agree.
 */
async function read(formData: FormData) {
  const direction = String(formData.get("direction") ?? "IN") === "OUT" ? "OUT" : "IN";
  const all = (name: string) => formData.getAll(name).map((one) => String(one).trim());
  const categories = all("lineCategory");
  const others = all("lineCategoryOther");
  const projectsTyped = all("lineProject");
  const words = all("lineDescription");
  const nets = all("lineNet").map((one) => parseAmount(one));
  const rates = all("lineRate").map((one) => Math.max(0, Number(one.replace(",", ".")) || 0));

  const lines = categories
    .map((raw, i) => {
      const picked = splitChoice(raw || "OTHER");
      const known = (EXPENSE_CATEGORIES as readonly string[]).includes(picked.base);
      const category = (known ? picked.base : "OTHER") as ExpenseCategory;
      const netCents = nets[i] ?? 0;
      const rate = rates[i] ?? 0;
      const vatCents = Math.round((netCents * rate) / 100);
      return {
        category,
        categoryChoice: known ? picked.choice : null,
        categoryOther: category === "OTHER" && !picked.choice ? others[i] || null : null,
        /* "NONE" is the company itself, chosen on purpose: no development. */
        projectId: projectsTyped[i] && projectsTyped[i] !== "NONE" ? projectsTyped[i] : null,
        description: words[i] || null,
        netCents,
        rate,
        vatCents,
        totalCents: netCents + vatCents,
      };
    })
    .filter((one) => one.netCents !== 0)
    .map((one, seq) => ({ ...one, seq }));

  const netCents = lines.reduce((a, one) => a + one.netCents, 0);
  const vatCents = lines.reduce((a, one) => a + one.vatCents, 0);
  const totalCents = netCents + vatCents;
  const linesProjects = [...new Set(lines.map((one) => one.projectId))];
  const rates1 = [...new Set(lines.map((one) => one.rate))];
  /* The invoice's own category is its biggest line's, for the lists that group by one. */
  const main = [...lines].sort((a, b) => b.totalCents - a.totalCents)[0];

  const issue = String(formData.get("issueDate") ?? "");
  const due = String(formData.get("dueDate") ?? "");
  const ourCompanyId = await asOurCompanyId(String(formData.get("ourCompanyId") ?? ""));
  const party = splitParty(String(formData.get("party") ?? "OTHER"));
  const typedName = String(formData.get("partyName") ?? "").trim();
  const typedEmail = String(formData.get("partyEmail") ?? "").trim() || null;
  const typedAddress = String(formData.get("partyAddress") ?? "").trim() || null;

  /* The name the list shows: the record's own, or the name typed. */
  const found = await partyOf({
    partyKind: party.kind,
    partyId: party.id,
    supplier: typedName,
    partyEmail: party.kind === "OTHER" ? typedEmail : null,
    partyAddress: typedAddress,
  });

  return {
    direction,
    ourCompanyId,
    partyKind: found.kind,
    partyId: found.id,
    partyEmail: found.kind === "OTHER" ? typedEmail : null,
    partyAddress: found.kind === "OTHER" ? typedAddress : null,
    supplier: found.name,
    subownerId: found.kind === "COMPANY" ? found.id : null,
    category: main?.category ?? ("OTHER" as ExpenseCategory),
    categoryChoice: main?.categoryChoice ?? null,
    categoryOther: main?.categoryOther ?? null,
    /* Their own number, on an invoice we received. Ours is given by the CRM. */
    reference: direction === "IN" ? String(formData.get("reference") ?? "").trim() || null : undefined,
    /* Each line says what it covers; an older invoice keeps the words it had. */
    description: formData.has("description") ? String(formData.get("description") ?? "").trim() || null : undefined,
    issueDate: issue ? new Date(`${issue}T12:00:00`) : direction === "OUT" ? new Date() : null,
    dueDate: due ? new Date(`${due}T12:00:00`) : null,
    netAmount: fromCents(netCents),
    vatRate: rates1.length === 1 ? rates1[0].toFixed(3) : null,
    vatAmount: fromCents(vatCents),
    totalAmount: fromCents(totalCents),
    /* Lines all for one development still say which: the invoice's own. */
    projectId: linesProjects.length === 1 ? linesProjects[0] : null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    lines,
  };
}

type Lines = Awaited<ReturnType<typeof read>>["lines"];

/** The lines of an invoice, written again whole. */
async function saveLines(expenseId: string, lines: Lines) {
  await db.delete(expenseLines).where(eq(expenseLines.expenseId, expenseId));
  if (lines.length === 0) return;
  await db.insert(expenseLines).values(
    lines.map((one) => ({
      expenseId,
      projectId: one.projectId,
      description: one.description,
      category: one.category,
      categoryChoice: one.categoryChoice,
      categoryOther: one.categoryOther,
      vatRate: one.rate.toFixed(3),
      netAmount: fromCents(one.netCents),
      vatAmount: fromCents(one.vatCents),
      totalAmount: fromCents(one.totalCents),
      seq: one.seq,
    })),
  );
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

const filesIn = (formData: FormData, name = "files") =>
  formData.getAll(name).filter((entry): entry is File => entry instanceof File && entry.size > 0);

/** An invoice we issue to somebody, or one somebody sent us. */
export async function createExpense(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const { lines, ...parsed } = await read(formData);
  const files = filesIn(formData);
  const problem =
    !parsed.supplier
      ? parsed.direction === "OUT"
        ? "Choose who the invoice is to."
        : "Choose who the invoice is from."
      : lines.length === 0
        ? "Add at least one line with an amount."
        : parsed.direction === "IN" && files.length === 0
          ? "Upload the invoice they sent us."
          : null;
  if (problem) {
    await flash(`said.invoiceNotSaved|${problem}`, "bad");
    revalidatePath("/invoices/new");
    return;
  }

  const inserted = await db
    .insert(expenses)
    .values({ ...parsed, reference: parsed.reference ?? null, recordedByEmail: user.email })
    .returning({ id: expenses.id });
  const expenseId = inserted[0].id;
  await saveLines(expenseId, lines);

  if (files.length > 0) {
    await storeDocuments({
      files,
      title: parsed.reference ? `Invoice ${parsed.reference} from ${parsed.supplier}` : `Invoice from ${parsed.supplier}`,
      category: "OTHER",
      attachTo: { expenseId },
      user,
    });
  }

  /* Ours: numbered, drawn and filed now, in the series of the company it is from. */
  let issued: string | null = null;
  if (parsed.direction === "OUT") {
    issued = await issuePartnerInvoice(expenseId, { id: user.id, name: user.name });
  }

  await recordAudit({
    action: parsed.direction === "OUT" ? "expense.issued" : "expense.create",
    entity: "expense",
    entityId: expenseId,
    detail: `${parsed.direction === "OUT" ? `invoice ${issued ?? ""} to ` : "from "}${parsed.supplier}, ${parsed.totalAmount}`,
    userId: user.id,
    userEmail: user.email,
  });

  await sayWhatWasSent(expenseId, issued);
  revalidatePath("/invoices");
  redirect(`/invoices/${expenseId}`);
}

export async function updateExpense(expenseId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [current] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!current) return;

  /*
   * An invoice we issued is a numbered paper that has gone out, so its figures
   * stay as issued. Only the notes and the due date can change; a correction
   * is a new invoice.
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
    const { lines, ...parsed } = await read(formData);
    if (lines.length === 0 || !parsed.supplier) {
      await flash(`said.invoiceNotSaved|${lines.length === 0 ? "Add at least one line with an amount." : "Choose who the invoice is from."}`, "bad");
      revalidatePath(`/invoices/${expenseId}`);
      return;
    }
    await db
      .update(expenses)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(expenses.id, expenseId));
    await saveLines(expenseId, lines);
    await settle(expenseId);
  }

  const files = filesIn(formData);
  if (files.length > 0) {
    await storeDocuments({
      files,
      title: current.reference ? `Invoice ${current.reference} from ${current.supplier}` : `Invoice from ${current.supplier}`,
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

function readPayment(formData: FormData) {
  const amountCents = parseAmount(String(formData.get("amount") ?? ""));
  const day = String(formData.get("paidOn") ?? "");
  return {
    amountCents,
    paidOn: day ? new Date(`${day}T12:00:00`) : new Date(),
    method: String(formData.get("method") ?? "").trim(),
    reference: String(formData.get("reference") ?? "").trim() || null,
  };
}

/**
 * Money received on an invoice we issued.
 *
 * Recorded, then our receipt is numbered, drawn and emailed to whoever paid,
 * all at once, so nobody has to remember to send it.
 */
export async function recordIncomePayment(expenseId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense || expense.direction !== "OUT") return;
  const typed = readPayment(formData);
  const owedCents = toCents(expense.totalAmount) - toCents(expense.paidAmount);
  const problem =
    typed.amountCents <= 0
      ? "Type the amount received."
      : typed.amountCents > owedCents
        ? `That is more than is still to receive on this invoice (${fromCents(owedCents)}).`
        : !typed.method
          ? "Choose how it was paid."
          : null;
  if (problem) {
    await flash(`said.paymentNotSaved|${problem}`, "bad");
    revalidatePath(`/invoices/${expenseId}`);
    return;
  }
  const [payment] = await db
    .insert(expensePayments)
    .values({
      expenseId,
      paidOn: typed.paidOn,
      amount: fromCents(typed.amountCents),
      method: typed.method,
      reference: typed.reference,
      recordedByEmail: user.email,
    })
    .returning();
  await settle(expenseId);
  const receipt = await issueIncomeReceipt(payment.id, { id: user.id, name: user.name });
  const mail = await emailIncomeReceipt(payment.id);

  await recordAudit({
    action: "expense.income",
    entity: "expense",
    entityId: expenseId,
    detail: `${fromCents(typed.amountCents)} received, receipt ${receipt?.number ?? "none"}, ${mail.detail}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(
    `said.receiptIssued|Receipt ${receipt?.number ?? ""}: ${mail.status === "SENT" ? mail.detail : `the email did not go: ${mail.detail}`}`,
    mail.status === "SENT" ? "good" : "bad",
  );
  revalidatePath(`/invoices/${expenseId}`);
  revalidatePath("/invoices");
}

/**
 * Money we paid on an invoice we received, with their receipt when it is in
 * hand already. Without it, the payment waits for it.
 */
export async function recordExpensePayment(expenseId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense || expense.direction !== "IN") return;
  const typed = readPayment(formData);
  const owedCents = toCents(expense.totalAmount) - toCents(expense.paidAmount);
  const problem =
    typed.amountCents <= 0
      ? "Type the amount paid."
      : typed.amountCents > owedCents
        ? `That is more than is still to pay on this invoice (${fromCents(owedCents)}).`
        : !typed.method
          ? "Choose how it was paid."
          : null;
  if (problem) {
    await flash(`said.paymentNotSaved|${problem}`, "bad");
    revalidatePath(`/invoices/${expenseId}`);
    return;
  }
  const [file] = filesIn(formData, "receipt");
  let receiptDocumentId: string | null = null;
  if (file) {
    receiptDocumentId = await storeDocument({
      file,
      title: `Receipt from ${expense.supplier}${expense.reference ? ` for invoice ${expense.reference}` : ""}`,
      category: "RECEIPT",
      attachTo: { expenseId },
      user,
    });
  }
  await db.insert(expensePayments).values({
    expenseId,
    paidOn: typed.paidOn,
    amount: fromCents(typed.amountCents),
    method: typed.method,
    reference: typed.reference,
    receiptDocumentId,
    recordedByEmail: user.email,
  });
  await settle(expenseId);
  await recordAudit({
    action: "expense.paid",
    entity: "expense",
    entityId: expenseId,
    detail: `${fromCents(typed.amountCents)} paid${receiptDocumentId ? ", with their receipt" : ", their receipt to come"}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(`said.paymentSaved|${receiptDocumentId ? "Their receipt is filed with it." : "Upload their receipt when it comes."}`);
  revalidatePath(`/invoices/${expenseId}`);
  revalidatePath("/invoices");
}

/** Their receipt for a payment we made, when it comes. */
export async function uploadTheirReceipt(expenseId: string, paymentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [row] = await db
    .select({ payment: expensePayments, expense: expenses })
    .from(expensePayments)
    .innerJoin(expenses, eq(expenses.id, expensePayments.expenseId))
    .where(and(eq(expensePayments.id, paymentId), eq(expensePayments.expenseId, expenseId)))
    .limit(1);
  const [file] = filesIn(formData, "receipt");
  if (!row || !file) {
    await flash("said.chooseAFile", "bad");
    revalidatePath(`/invoices/${expenseId}`);
    return;
  }
  const documentId = await storeDocument({
    file,
    title: `Receipt from ${row.expense.supplier}${row.expense.reference ? ` for invoice ${row.expense.reference}` : ""}`,
    category: "RECEIPT",
    attachTo: { expenseId },
    user,
  });
  await db.update(expensePayments).set({ receiptDocumentId: documentId }).where(eq(expensePayments.id, paymentId));
  await recordAudit({
    action: "expense.receipt",
    entity: "expense",
    entityId: expenseId,
    detail: `their receipt for ${row.payment.amount} filed`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  revalidatePath(`/invoices/${expenseId}`);
  revalidatePath("/invoices");
}

/** Our receipt again, on a button. */
export async function resendIncomeReceipt(expenseId: string, paymentId: string) {
  const user = await requireUser(["ADMIN"]);
  const [payment] = await db
    .select()
    .from(expensePayments)
    .where(and(eq(expensePayments.id, paymentId), eq(expensePayments.expenseId, expenseId)))
    .limit(1);
  if (!payment) return;
  if (!payment.issuedDocumentId) await issueIncomeReceipt(paymentId, { id: user.id, name: user.name });
  const mail = await emailIncomeReceipt(paymentId);
  await flash(`said.receiptIssued|${mail.status === "SENT" ? mail.detail : `the email did not go: ${mail.detail}`}`, mail.status === "SENT" ? "good" : "bad");
  revalidatePath(`/invoices/${expenseId}`);
}

/**
 * A payment recorded by mistake, taken off. Our receipt for it keeps its
 * number and is marked void, so the run of numbers has no gap.
 */
export async function deleteExpensePayment(expenseId: string, paymentId: string) {
  const user = await requireUser(["ADMIN"]);
  const [payment] = await db
    .select()
    .from(expensePayments)
    .where(and(eq(expensePayments.id, paymentId), eq(expensePayments.expenseId, expenseId)))
    .limit(1);
  if (!payment) return;
  await voidIncomeReceipt(payment.issuedDocumentId, "The payment was taken off");
  if (payment.receiptDocumentId) await removeDocument(payment.receiptDocumentId, user);
  await db.delete(expensePayments).where(eq(expensePayments.id, paymentId));
  await settle(expenseId);
  await recordAudit({
    action: "expense.payment.delete",
    entity: "expense",
    entityId: expenseId,
    detail: `${payment.amount} of ${payment.paidOn.toISOString().slice(0, 10)} taken off`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.deleted");
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

export async function deleteExpenseFile(documentId: string, expenseId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.update(expensePayments).set({ receiptDocumentId: null }).where(eq(expensePayments.receiptDocumentId, documentId));
  await removeDocument(documentId, user);
  revalidatePath(`/invoices/${expenseId}`);
}

export async function deleteExpense(expenseId: string) {
  const user = await requireUser(["ADMIN"]);

  /* Papers we issued keep their numbers in the series: they are marked void
     rather than taken away, so the run of numbers has no gap. */
  await db
    .update(issuedDocuments)
    .set({ voidedAt: new Date(), voidReason: "The company invoice was deleted" })
    .where(eq(issuedDocuments.expenseId, expenseId));

  const filed = await db.select({ id: documents.id }).from(documents).where(eq(documents.expenseId, expenseId));
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
