"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, issuedDocuments, refunds } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { recordAudit } from "@/lib/audit";
import { toCents, fromCents, parseAmount } from "@/lib/money";
import { approveReducedVat } from "@/lib/reducedVat";
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
      who: { id: user.id, name: user.name, email: user.email },
    });
    await flash(
      `said.reducedApproved|${result.creditNotes.length} credit notes, ${result.invoices.length} new invoices, credit ${fromCents(result.creditCents)}`,
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
  const amountCents = cents(formData.get("amount"));
  if (amountCents <= 0) {
    await flash("said.refundNeedsAmount", "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }
  const day = String(formData.get("paidOn") ?? "").trim();
  await recordRefund({
    contractId,
    purpose,
    amountCents,
    paidOn: day ? new Date(`${day}T12:00:00`) : new Date(),
    method: String(formData.get("method") ?? "") || null,
    reference: String(formData.get("reference") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    cancelContract: formData.get("cancelContract") === "on",
    who: { id: user.id, name: user.name, email: user.email },
  });
  await flash("said.refundRecorded");
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
) {
  const row = await buyerOf(contractId);
  if (!row?.client?.email) {
    await flash("said.noEmailOnRecord", "bad");
    return;
  }
  if (!emailConfigured()) {
    await flash("said.mailNotSetUp", "bad");
    return;
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
  await flash(
    result.status === "SENT"
      ? "said.papersSent"
      : `said.receiptFailed${"error" in result && result.error ? `|${String(result.error).slice(0, 160)}` : ""}`,
    result.status === "SENT" ? "good" : "bad",
  );
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
 * Everything the reduced VAT produced, in one email: the credit notes, the
 * stamped invoices they cancel, and the new invoices at the new VAT.
 */
export async function sendVatPapers(contractId: string) {
  const user = await requireUser(["ADMIN"]);
  const notes = await db
    .select()
    .from(issuedDocuments)
    .where(
      and(
        eq(issuedDocuments.contractId, contractId),
        eq(issuedDocuments.kind, "CREDIT_NOTE"),
        eq(issuedDocuments.purpose, "VAT_CHANGE"),
        isNull(issuedDocuments.voidedAt),
      ),
    );
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const oldIds = notes.map((note) => note.invoiceId).filter(Boolean) as string[];
  const olds = oldIds.length
    ? await db.select().from(issuedDocuments).where(inArray(issuedDocuments.id, oldIds))
    : [];
  const newIds = olds.map((old) => old.replacedById).filter(Boolean) as string[];
  const fresh = newIds.length
    ? await db.select().from(issuedDocuments).where(inArray(issuedDocuments.id, newIds))
    : [];
  /* And any stage the credit settled in full, invoiced on the day of approval. */
  const covered = contract?.reducedVatApprovedOn
    ? (
        await db
          .select()
          .from(issuedDocuments)
          .where(
            and(
              eq(issuedDocuments.contractId, contractId),
              eq(issuedDocuments.kind, "INVOICE"),
              eq(issuedDocuments.issuedOn, contract.reducedVatApprovedOn),
              isNull(issuedDocuments.creditedById),
            ),
          )
      ).filter((one) => !newIds.includes(one.id))
    : [];

  const files: EmailAttachment[] = [];
  for (const paper of [...notes, ...olds, ...fresh, ...covered]) {
    const one = await paperAttachment(paper);
    if (one) files.push(one);
  }
  const credit = olds.reduce((sum, old) => sum + toCents(old.totalAmount), 0) - fresh.reduce((sum, one) => sum + toCents(one.totalAmount), 0);

  await send(
    contractId,
    "Your reduced VAT: credit notes and new invoices",
    `Dear {{first_name}},\n\nYour reduced VAT has been approved. The invoices issued at the standard rate are cancelled by the attached credit notes, and new invoices at the new VAT are attached for the same payments.\n\nThe VAT you paid over, ${fromCents(credit)} euro, is not paid back: it is credited against your next payments, and each invoice shows how much of it was used.\n\nOne Eleven`,
    files,
    user.id,
    user.email,
  );
  revalidatePath(`/contracts/${contractId}`);
}
