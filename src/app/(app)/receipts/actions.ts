"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { commissionPayments, payments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { getLocale } from "@/i18n";
import { emailConfigured, sendAndRecord } from "@/lib/messaging";
import { agentReceipt, agentReceiptEmail, buyerReceipt, buyerReceiptEmail } from "@/lib/receipts";
import { issuedAttachments, issueForPayment } from "@/lib/issued";

/**
 * Send a receipt, and only when somebody presses the button.
 *
 * The office was emphatic about this and they are right: recording money is one
 * thing and telling somebody about it is another. A payment entered to correct
 * last month's books should not email anybody, and a deposit taken this morning
 * should go the moment the office is happy with the wording. So nothing here
 * runs on its own, from another action, or on a schedule.
 *
 * Every send is written into the message log with whatever the provider said,
 * so "did we send it" has an answer that does not depend on anybody's memory,
 * and the payment itself gains a line saying the receipt went out.
 */
export async function sendBuyerReceipt(paymentId: string) {
  const user = await requireUser(["ADMIN"]);
  const locale = await getLocale();

  const receipt = await buyerReceipt(paymentId);
  if (!receipt || !receipt.client) {
    await flash("said.receiptGone", "bad");
    return;
  }

  if (!receipt.client.email) {
    await flash("said.noEmailOnRecord", "bad");
    revalidatePath(`/clients/${receipt.client.id}`);
    return;
  }

  if (!emailConfigured()) {
    await flash("said.mailNotSetUp", "bad");
    return;
  }

  const { subject, body } = buyerReceiptEmail(receipt, locale);

  /* The same invoice and receipt the automatic letter carries, issued now if
     this payment was recorded before the CRM issued them. */
  await issueForPayment(paymentId, { id: user.id, name: user.name }).catch(() => null);
  const drawn = await issuedAttachments(paymentId).catch(() => []);

  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: {
      clientId: receipt.client.id,
      name: `${receipt.client.firstName} ${receipt.client.lastName}`.trim(),
      email: receipt.client.email,
    },
    subject,
    body,
    // A receipt is not marketing, so it carries no unsubscribe footer.
    withOptOut: false,
    attachments: drawn.length
      ? drawn.map((one) => ({ filename: one.filename, content: one.content, contentType: one.contentType }))
      : undefined,
  });

  await recordAudit({
    action: "receipt.sent",
    entity: "payment",
    entityId: paymentId,
    detail: `${receipt.number} to ${receipt.client.email}: ${result.status}`,
    userId: user.id,
    userEmail: user.email,
  });

  if (result.status === "SENT") {
    await db
      .update(payments)
      .set({
        notes: [receipt.notes, `Receipt ${receipt.number} emailed ${stamp()}`]
          .filter(Boolean)
          .join(" . "),
      })
      .where(eq(payments.id, paymentId));
  }

  /* When it fails, the office is told what the mail server said, not only
     that it failed, because "it did not go" gives nobody anything to fix. */
  await flash(
    result.status === "SENT"
      ? "said.receiptSent"
      : `said.receiptFailed${"error" in result && result.error ? `|${String(result.error).slice(0, 160)}` : ""}`,
    result.status === "SENT" ? "good" : "bad",
  );

  revalidatePath(`/clients/${receipt.client.id}`);
  revalidatePath(`/clients/${receipt.client.id}/receipt/${paymentId}`);
}

/** The same for a commission payment made to an agent. */
export async function sendAgentReceipt(paymentId: string) {
  const user = await requireUser(["ADMIN"]);
  const locale = await getLocale();

  const receipt = await agentReceipt(paymentId);
  if (!receipt) {
    await flash("said.receiptGone", "bad");
    return;
  }

  if (!receipt.agent.email) {
    await flash("said.noEmailOnRecord", "bad");
    revalidatePath(`/agents/${receipt.agent.id}`);
    return;
  }

  if (!emailConfigured()) {
    await flash("said.mailNotSetUp", "bad");
    return;
  }

  const { subject, body } = agentReceiptEmail(receipt, locale);

  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: {
      agentId: receipt.agent.id,
      name: receipt.agent.name,
      email: receipt.agent.email,
    },
    subject,
    body,
    withOptOut: false,
  });

  await recordAudit({
    action: "receipt.sent",
    entity: "commissionPayment",
    entityId: paymentId,
    detail: `${receipt.number} to ${receipt.agent.email}: ${result.status}`,
    userId: user.id,
    userEmail: user.email,
  });

  if (result.status === "SENT") {
    await db
      .update(commissionPayments)
      .set({
        notes: [receipt.notes, `Receipt ${receipt.number} emailed ${stamp()}`]
          .filter(Boolean)
          .join(" . "),
      })
      .where(eq(commissionPayments.id, paymentId));
  }

  await flash(
    result.status === "SENT" ? "said.receiptSent" : "said.receiptFailed",
    result.status === "SENT" ? "good" : "bad",
  );

  revalidatePath(`/agents/${receipt.agent.id}`);
  revalidatePath(`/agents/${receipt.agent.id}/receipt/${paymentId}`);
}

/** Today, for the line written onto the payment when a receipt goes out. */
function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}
