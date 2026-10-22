import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { installments, issuedDocuments, messages, payments } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { removeDocument } from "@/lib/uploads";
import type { SessionUser } from "@/lib/auth";

/*
 * Taking back a stage invoice issued by mistake.
 *
 * An issued invoice is never deleted, as a rule: it is voided or credited and
 * keeps its number. The one exception is an invoice nobody outside the office
 * ever saw, issued before the money by pressing a stage's button too early.
 * It may go only when all of this holds, so the series is never left with a
 * gap and no paper the buyer holds ever disappears:
 *
 *   it is an invoice issued for a stage, before any money, and still standing
 *   no receipt names it
 *   it was never emailed: no email that names it went out
 *   it is the last invoice of its company's series, so the next one takes its number
 */

/** Why this invoice cannot be taken back, or null when it can. */
export async function whyNotWithdraw(invoiceId: string): Promise<string | null> {
  const [paper] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, invoiceId)).limit(1);
  if (!paper || paper.kind !== "INVOICE") return "Not an invoice.";
  if (paper.paymentId || !paper.installmentId) return "Only an invoice issued for a stage before the money can be taken back.";
  if (paper.voidedAt || paper.creditedById || paper.replacedById) return "This invoice was already cancelled or credited.";

  const [receipt] = await db
    .select({ id: issuedDocuments.id })
    .from(issuedDocuments)
    .where(and(eq(issuedDocuments.invoiceId, invoiceId), isNull(issuedDocuments.voidedAt)))
    .limit(1);
  if (receipt) return "A receipt was issued against this invoice.";

  if (paper.clientId) {
    const [sent] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.clientId, paper.clientId),
          eq(messages.channel, "EMAIL"),
          eq(messages.status, "SENT"),
          sql`lower(coalesce(${messages.subject}, '')) like ${`%invoice ${paper.number.toLowerCase()}%`}`,
        ),
      )
      .limit(1);
    if (sent) return "This invoice was emailed to the buyer, so it stays. Credit it instead.";
  }

  const [later] = await db
    .select({ id: issuedDocuments.id })
    .from(issuedDocuments)
    .where(
      and(
        eq(issuedDocuments.kind, "INVOICE"),
        eq(issuedDocuments.issuerId, paper.issuerId),
        sql`${issuedDocuments.createdAt} > ${paper.createdAt}`,
      ),
    )
    .limit(1);
  if (later) return "A later invoice of the same company exists, so taking this one back would leave a gap in the numbers.";

  return null;
}

/** Take the invoice back: the record and its PDF go, and the stage reads as not sent. */
export async function withdrawInvoice(invoiceId: string, user: SessionUser): Promise<{ ok: boolean; said: string }> {
  const why = await whyNotWithdraw(invoiceId);
  if (why) return { ok: false, said: why };
  const [paper] = await db.select().from(issuedDocuments).where(eq(issuedDocuments.id, invoiceId)).limit(1);
  if (!paper) return { ok: false, said: "Not found." };

  await db.delete(issuedDocuments).where(eq(issuedDocuments.id, invoiceId));
  if (paper.documentId) await removeDocument(paper.documentId, user);
  if (paper.installmentId) {
    await db.update(installments).set({ invoiceSentAt: null, updatedAt: new Date() }).where(eq(installments.id, paper.installmentId));
  }

  await recordAudit({
    action: "invoice.withdrawn",
    entity: "contract",
    entityId: paper.contractId,
    detail: `Invoice ${paper.number} taken back, issued by mistake and never sent. The next invoice of the company takes its number.`,
    userId: user.id,
    userEmail: user.email,
  });
  return { ok: true, said: `Invoice ${paper.number} taken back. The next invoice takes its number.` };
}

/*
 * The papers issued for a payment recorded as history.
 *
 * A payment entered while Recording history was on carries no invoice and no
 * receipt of ours. If papers were issued for it anyway, by opening its Invoice
 * or Receipt link, they can be taken back on the same terms as above: never
 * emailed, nothing else resting on them, and each the last of its series.
 */
async function papersOfPayment(paymentId: string) {
  return db
    .select()
    .from(issuedDocuments)
    .where(and(eq(issuedDocuments.paymentId, paymentId), isNull(issuedDocuments.voidedAt)));
}

/** Why the papers of this history payment cannot be taken back, or null when they can. */
export async function whyNotWithdrawPayment(paymentId: string): Promise<string | null> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) return "Payment not found.";
  if (!payment.history) return "Only papers of a payment recorded as history can be taken back.";
  const papers = await papersOfPayment(paymentId);
  if (papers.length === 0) return "No papers were issued for this payment.";

  for (const paper of papers) {
    if (paper.creditedById || paper.replacedById) return `${paper.kind === "RECEIPT" ? "Receipt" : "Invoice"} ${paper.number} was credited.`;
    /* Nothing of another payment rests on it: no other receipt names this invoice. */
    if (paper.kind === "INVOICE") {
      const [other] = await db
        .select({ id: issuedDocuments.id })
        .from(issuedDocuments)
        .where(
          and(
            eq(issuedDocuments.invoiceId, paper.id),
            isNull(issuedDocuments.voidedAt),
            sql`coalesce(${issuedDocuments.paymentId}, '') <> ${paymentId}`,
          ),
        )
        .limit(1);
      if (other) return `A receipt of another payment names invoice ${paper.number}.`;
    }
    if (paper.clientId) {
      const word = paper.kind === "RECEIPT" ? "receipt" : "invoice";
      const [sent] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.clientId, paper.clientId),
            eq(messages.channel, "EMAIL"),
            eq(messages.status, "SENT"),
            sql`lower(coalesce(${messages.subject}, '')) like ${`%${word} ${paper.number.toLowerCase()}%`}`,
          ),
        )
        .limit(1);
      if (sent) return `${paper.kind === "RECEIPT" ? "Receipt" : "Invoice"} ${paper.number} was emailed to the buyer, so it stays.`;
    }
    const [later] = await db
      .select({ id: issuedDocuments.id })
      .from(issuedDocuments)
      .where(
        and(
          eq(issuedDocuments.kind, paper.kind),
          eq(issuedDocuments.issuerId, paper.issuerId),
          sql`${issuedDocuments.createdAt} > ${paper.createdAt}`,
        ),
      )
      .limit(1);
    if (later) return `A later ${paper.kind === "RECEIPT" ? "receipt" : "invoice"} of the same company exists. Take the newest back first.`;
  }
  return null;
}

/** Take back every paper issued for a history payment: the records and their PDFs. */
export async function withdrawPaymentPapers(paymentId: string, user: SessionUser): Promise<{ ok: boolean; said: string }> {
  const why = await whyNotWithdrawPayment(paymentId);
  if (why) return { ok: false, said: why };
  const papers = await papersOfPayment(paymentId);
  /* The receipt first, since it names the invoice. */
  const ordered = [...papers].sort((a, b) => (a.kind === "RECEIPT" ? -1 : b.kind === "RECEIPT" ? 1 : 0));
  for (const paper of ordered) {
    await db.delete(issuedDocuments).where(eq(issuedDocuments.id, paper.id));
    if (paper.documentId) await removeDocument(paper.documentId, user);
  }
  const names = ordered.map((paper) => `${paper.kind === "RECEIPT" ? "receipt" : "invoice"} ${paper.number}`).join(" and ");
  await recordAudit({
    action: "invoice.withdrawn",
    entity: "payment",
    entityId: paymentId,
    detail: `${names} taken back: issued by mistake for a payment recorded as history, never sent.`,
    userId: user.id,
    userEmail: user.email,
  });
  return { ok: true, said: `${names.charAt(0).toUpperCase()}${names.slice(1)} taken back.` };
}
