import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { installments, issuedDocuments, messages } from "@/db/schema";
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
