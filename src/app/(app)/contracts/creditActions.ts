"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, issuedDocuments, refunds } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { recordAudit } from "@/lib/audit";
import { toCents, fromCents, parseAmount } from "@/lib/money";
import { approveReducedVat, vatCreditToPayBack } from "@/lib/reducedVat";
import { recordRefund } from "@/lib/refunds";
import { paperAttachment, readDocument } from "@/lib/issued";
import { storeDocuments } from "@/lib/uploads";
import { emailConfigured, sendAndRecord } from "@/lib/messaging";
import type { EmailAttachment } from "@/lib/messaging/email";

const cents = (value: FormDataEntryValue | null) => parseAmount(String(value ?? ""));

/** The buyer's reduced VAT is approved: see lib/reducedVat for every step. */
export async function approveReducedVatAction(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const day = String(formData.get("approvedOn") ?? "").trim();
  const approvedOn = day ? new Date(`${day}T12:00:00`) : new Date();
  const reducedNetCents = cents(formData.get("reducedNet"));
  const reducedRate = Number(String(formData.get("reducedRate") ?? "5")) || 5;
  const standardRate = Number(String(formData.get("standardRate") ?? "19")) || 19;

  if (reducedNetCents <= 0) {
    await flash("said.reducedNeedsAmount", "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }

  /* The approval the buyer sent us is the reason for all of it, so it is kept first. */
  const papers = formData.getAll("approval").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (papers.length === 0) {
    await flash("said.reducedNeedsPaper", "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }
  const [owner] = await db.select({ clientId: contracts.clientId, unitId: contracts.unitId }).from(contracts).where(eq(contracts.id, contractId)).limit(1);
  let documentId: string | null = null;
  try {
    [documentId] = await storeDocuments({
      files: papers,
      title: "Reduced VAT approval",
      category: "VAT_APPROVAL",
      attachTo: { contractId, clientId: owner?.clientId ?? undefined, unitId: owner?.unitId ?? undefined },
      user,
    });
  } catch (error) {
    await flash(`said.papersNotKept|${error instanceof Error ? error.message : ""}`, "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }

  /*
   * The approval writes several PDFs and can take a few seconds. Whatever
   * happens, the office lands back on a freshly loaded contract with a line
   * saying what was done, rather than on a page left half answered: the page
   * itself finishes anything that was not (see finishReducedVat).
   */
  try {
    const result = await approveReducedVat({
      contractId,
      approvedOn,
      reducedNetCents,
      reducedRate,
      standardRate,
      documentId,
      who: { id: user.id, name: user.name, email: user.email },
    });
    /* The client hears straight away, with the cancelled and the new invoices. */
    const emailed = result.cancelled.length > 0 ? await vatPapersTo(contractId, user.id, user.email, true) : "";
    await flash(
      `said.reducedApproved|${result.cancelled.length} invoices cancelled and issued again at the new VAT, credit ${fromCents(result.creditCents)}${emailed ? `; ${emailed}` : ""}`,
    );
  } catch (error) {
    console.error("[reduced vat]", error);
    await flash(`said.reducedFailed|${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`, "bad");
  }
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/invoices/clients");
  redirect(`/contracts/${contractId}`);
}

/** A goodwill refund or a delay penalty: see lib/refunds. */
export async function recordRefundAction(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const purpose = String(formData.get("purpose") ?? "") === "PENALTY" ? "PENALTY" : "REFUND";
  /* Nothing paid back, on a refund only: ticked, or a zero typed in. Then there is no date or method of a payment.
     A delay penalty is always money paid. */
  const typed = String(formData.get("amount") ?? "").trim();
  const nothing = purpose === "REFUND" && (formData.get("nothingBack") === "on" || /^[\s€]*0+([.,]0*)?[\s€]*$/.test(typed));
  const amountCents = nothing ? 0 : cents(typed);
  if (!nothing && !(amountCents > 0)) {
    await flash("said.refundNeedsAmount", "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }
  const day = nothing ? "" : String(formData.get("paidOn") ?? "").trim();
  await recordRefund({
    contractId,
    purpose,
    amountCents,
    paidOn: day ? new Date(`${day}T12:00:00`) : new Date(),
    method: nothing ? null : String(formData.get("method") ?? "") || null,
    /* No cheque number or bank reference is asked for. */
    reference: null,
    note: String(formData.get("note") ?? "").trim() || null,
    cancelContract: purpose === "REFUND" && formData.get("cancelContract") === "on",
    who: { id: user.id, name: user.name, email: user.email },
  });
  await flash(nothing ? "said.refundNothingRecorded" : "said.refundRecorded");
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/invoices/clients");
}

/**
 * The VAT credit no stage is left to take, paid back to the buyer.
 *
 * The amount is the CRM's, not typed: what the buyer paid over and could not
 * set against a later stage. The credit note is issued now, with the
 * acknowledgement for the buyer to sign.
 */
export async function payBackVatCreditAction(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const amountCents = await vatCreditToPayBack(contractId);
  if (amountCents <= 0) {
    await flash("said.vatNothingToPayBack", "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }
  const method = String(formData.get("method") ?? "").trim();
  if (!method) {
    await flash("said.paymentNeedsMethod", "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }
  const day = String(formData.get("paidOn") ?? "").trim();
  const { note } = await recordRefund({
    contractId,
    purpose: "VAT_CHANGE",
    amountCents,
    paidOn: day ? new Date(`${day}T12:00:00`) : new Date(),
    method,
    reference: null,
    note: String(formData.get("note") ?? "").trim() || null,
    cancelContract: false,
    who: { id: user.id, name: user.name, email: user.email },
  });
  await flash(`said.vatPaidBack|${fromCents(amountCents)} euro${note ? `, credit note ${note.number}` : ""}`);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/invoices/clients");
}

/** The acknowledgement, signed and scanned, filed with its refund. */
export async function uploadSignedRefund(refundId: string, contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    await flash("said.chooseAFile", "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }
  const [id] = await storeDocuments({
    files: files.slice(0, 1),
    title: "Signed refund acknowledgement",
    category: "REFUND_ACK",
    attachTo: { contractId },
    user,
  });
  await db.update(refunds).set({ signedDocumentId: id }).where(eq(refunds.id, refundId));
  await flash("said.saved");
  revalidatePath(`/contracts/${contractId}`);
}

async function buyerOf(contractId: string) {
  const [row] = await db
    .select({ contract: contracts, client: clients })
    .from(contracts)
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(eq(contracts.id, contractId))
    .limit(1);
  return row;
}

async function send(
  contractId: string,
  subject: string,
  body: string,
  attachments: EmailAttachment[],
  userId: string,
  userEmail: string,
  quiet = false,
): Promise<string> {
  const row = await buyerOf(contractId);
  if (!row?.client?.email) {
    if (!quiet) await flash("said.noEmailOnRecord", "bad");
    return "the client has no email address";
  }
  if (!emailConfigured()) {
    if (!quiet) await flash("said.mailNotSetUp", "bad");
    return "email is not set up";
  }
  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: {
      clientId: row.client.id,
      name: `${row.client.firstName} ${row.client.lastName}`.trim(),
      email: row.client.email,
    },
    subject,
    body: body.replace("{{first_name}}", row.client.firstName ?? ""),
    withOptOut: false,
    attachments,
  });
  await recordAudit({
    action: "creditNote.sent",
    entity: "contract",
    entityId: contractId,
    detail: `${subject} to ${row.client.email}: ${result.status}`,
    userId,
    userEmail,
  });
  if (quiet) return result.status === "SENT" ? `emailed to ${row.client.email}` : `the email did not go: ${result.error ?? result.status}`;
  await flash(
    result.status === "SENT"
      ? "said.papersSent"
      : `said.receiptFailed${"error" in result && result.error ? `|${String(result.error).slice(0, 160)}` : ""}`,
    result.status === "SENT" ? "good" : "bad",
  );
  return result.status;
}

/**
 * One credit note to the buyer, by hand, with what belongs to it.
 *
 * For the reduced VAT, the invoice it cancels (stamped) and the one that
 * replaces it. For a refund or a penalty, the signed acknowledgement when it
 * has been filed.
 */
export async function sendCreditNote(noteId: string) {
  const user = await requireUser(["ADMIN"]);
  const [note] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, noteId)).limit(1);
  if (!note?.contractId) return;

  const files: EmailAttachment[] = [];
  const own = await paperAttachment(note);
  if (own) files.push(own);
  if (note.invoiceId) {
    const [old] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, note.invoiceId)).limit(1);
    if (old) {
      const stamped = await paperAttachment(old);
      if (stamped) files.push(stamped);
      if (old.replacedById) {
        const [fresh] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, old.replacedById)).limit(1);
        if (fresh) {
          const one = await paperAttachment(fresh);
          if (one) files.push(one);
        }
      }
    }
  }
  const [refund] = await db.select().from(refunds).where(eq(refunds.creditNoteId, note.id)).limit(1);
  if (refund?.signedDocumentId) {
    const signed = await readDocument(refund.signedDocumentId);
    if (signed) files.push({ filename: "Signed acknowledgement.pdf", content: signed, contentType: "application/pdf" });
  }

  await send(
    note.contractId,
    `Credit note ${note.number} from One Eleven`,
    `Dear {{first_name}},\n\nPlease find attached credit note ${note.number}${
      note.reason ? ` (${note.reason})` : ""
    } for ${fromCents(toCents(note.totalAmount))} euro, together with the papers that go with it.\n\nOne Eleven`,
    files,
    user.id,
    user.email,
  );
  revalidatePath(`/contracts/${note.contractId}`);
}

/**
 * Everything the reduced VAT produced, in one email: the invoices at the old
 * VAT, stamped CANCELLED, and the new invoices at the new VAT that replace
 * them, with any stage the credit settled in full. A contract approved before
 * this way of working also has its credit notes, which go too.
 */
export async function sendVatPapers(contractId: string) {
  const user = await requireUser(["ADMIN"]);
  await vatPapersTo(contractId, user.id, user.email, false);
  revalidatePath(`/contracts/${contractId}`);
}

/** The letter itself: the approval sends it by itself, and the button sends it again. */
async function vatPapersTo(contractId: string, userId: string, userEmail: string, quiet: boolean): Promise<string> {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const papers = await db
    .select()
    .from(issuedDocuments)
    .where(eq(issuedDocuments.contractId, contractId))
    .orderBy(asc(issuedDocuments.issuedOn), asc(issuedDocuments.createdAt));
  const olds = papers.filter((one) => one.kind === "INVOICE" && one.replacedById);
  const newIds = olds.map((old) => old.replacedById as string);
  const fresh = papers.filter((one) => newIds.includes(one.id));
  const notes = papers.filter((one) => one.kind === "CREDIT_NOTE" && one.purpose === "VAT_CHANGE" && one.invoiceId && !one.voidedAt);
  /* And any stage the credit settled in full, invoiced on the day of approval. */
  const approvedOn = contract?.reducedVatApprovedOn ? new Date(contract.reducedVatApprovedOn).getTime() : null;
  const covered = approvedOn
    ? papers.filter(
        (one) =>
          one.kind === "INVOICE" &&
          !one.voidedAt &&
          !one.creditedById &&
          !newIds.includes(one.id) &&
          new Date(one.issuedOn).getTime() === approvedOn,
      )
    : [];

  const files: EmailAttachment[] = [];
  for (const paper of [...olds, ...fresh, ...notes, ...covered]) {
    const one = await paperAttachment(paper);
    if (one) files.push(one);
  }
  const credit = olds.reduce((sum, old) => sum + toCents(old.totalAmount), 0) - fresh.reduce((sum, one) => sum + toCents(one.totalAmount), 0);
  const back = await vatCreditToPayBack(contractId);

  if (olds.length === 0) return "no invoice needed changing";
  return send(
    contractId,
    "Your reduced VAT: the new invoices",
    `Dear {{first_name}},\n\nYour reduced VAT has been approved. The invoices issued at the standard rate are cancelled, and a copy of each, stamped CANCELLED, is attached together with the new invoice at the new VAT that replaces it, for the same payment.\n\nPlease keep the new invoices: they are the ones that count from now on, and the cancelled ones can be ignored.\n\nThe VAT you paid over, ${fromCents(credit)} euro, is credited against your next payments: each new invoice shows the full amount, less the credit, and what is left to pay.${back > 0 ? `\n\n${fromCents(back)} euro of it is more than the payments still to come, and we will pay it back to you.` : ""}\n\nOne Eleven`,
    files,
    userId,
    userEmail,
    quiet,
  );
}
