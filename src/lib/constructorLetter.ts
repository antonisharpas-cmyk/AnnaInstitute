import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { constructors, documents } from "@/db/schema";
import { constructorWithJobs, paymentOf } from "@/lib/constructors";
import { formatAmount, toCents } from "@/lib/money";
import { resolveStored } from "@/lib/storage";
import type { EmailAttachment } from "@/lib/messaging/email";

/**
 * The letter to the constructor about one payment, sent only when the office
 * presses the button on that payment.
 *
 * It confirms what was paid, when, and for which development, where the
 * development stands against the agreed amount, and carries every file saved
 * on the payment. When the constructor's receipt is not on the payment yet, it
 * asks for it.
 */
export async function constructorPaymentLetter(paymentId: string) {
  const found = await paymentOf(paymentId);
  if (!found) return null;
  const [who] = await db.select().from(constructors).where(eq(constructors.id, found.job.constructorId)).limit(1);
  if (!who) return null;
  const whole = await constructorWithJobs(who.id);
  const job = whole?.jobs.find((one) => one.job.id === found.job.id);
  if (!job) return null;

  const papers = await db
    .select()
    .from(documents)
    .where(eq(documents.constructorPaymentId, paymentId))
    .orderBy(asc(documents.createdAt));
  const attachments: EmailAttachment[] = papers.map((row) => ({
    filename: row.originalName || row.title,
    path: resolveStored(row.filePath),
    contentType: row.mimeType ?? undefined,
  }));
  const hasReceipt = papers.some((row) => row.category === "RECEIPT");

  const money = (cents: number) => formatAmount(cents, "en");
  const amount = money(toCents(found.payment.amount));
  const day = new Date(found.payment.paidOn).toLocaleDateString("en-GB");
  const project = job.project.name;
  const kind = found.payment.kind?.trim();

  const lines = [
    `Dear ${who.contactName?.trim() || who.name},`,
    "",
    `We confirm that we have paid you ${amount} on ${day} for ${project}.`,
    ...(kind ? ["", `What it is for: ${kind}`] : []),
    "",
    `Paid to you so far for ${project}: ${money(job.paidCents)} of the agreed ${money(job.agreedCents)}. Remaining: ${money(job.remainingCents)}.`,
    "",
    attachments.length > 0
      ? `The papers we hold for this payment are attached.${hasReceipt ? "" : " Please send us your receipt for it."}`
      : "Please send us your invoice and your receipt for this payment.",
    "",
    "Kind regards,",
    "One Eleven",
  ];

  return {
    constructor: who,
    status: found.payment.status,
    subject: `Payment for ${project}: ${amount}`,
    body: lines.join("\n"),
    attachments,
  };
}
