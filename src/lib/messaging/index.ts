import "server-only";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { isSuppressed } from "../suppression";
import { unsubscribeUrl } from "../unsubscribe";
import { emailConfigured, sendEmail, type EmailAttachment } from "./email";
import { channelConfigured, sendViaSmsTo, smsConfigured } from "./smsto";
export { fillPlaceholders, looksLikeStop, normalisePhone } from "./text";
import type { Channel, SendResult } from "./types";

export type { Channel, SendResult } from "./types";
export { emailConfigured, smsConfigured, channelConfigured };

export type Recipient = {
  name: string;
  email?: string | null;
  phone?: string | null;
  clientId?: string | null;
  agentId?: string | null;
};

export function addressFor(channel: Channel, recipient: Recipient): string | null {
  if (channel === "EMAIL") return recipient.email?.trim() || null;
  return recipient.phone?.trim() || null;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Send one message and write down what happened.
 *
 * Three things always happen, in this order:
 *   1. the suppression list is checked, and a suppressed address is never contacted,
 *   2. the opt out is added to the message itself, an unsubscribe link on email
 *      and a reply keyword on the text channels,
 *   3. the outcome is recorded per recipient, including the provider reference
 *      or the error, so there is proof of what went where.
 */
export async function sendAndRecord(options: {
  campaignId?: string | null;
  channel: Channel;
  recipient: Recipient;
  subject?: string | null;
  body: string;
  /** Clients get an opt out. Agents are a business contact list and do not. */
  withOptOut: boolean;
  /** Email only. Text channels cannot carry a file. */
  attachments?: EmailAttachment[];
}): Promise<SendResult & { messageId: string }> {
  const { channel, recipient } = options;
  const to = addressFor(channel, recipient);

  const record = async (
    status: "SENT" | "FAILED" | "SUPPRESSED" | "SIMULATED",
    body: string,
    result?: Partial<SendResult>,
  ) => {
    const inserted = await db
      .insert(messages)
      .values({
        campaignId: options.campaignId ?? null,
        channel: result?.usedChannel ?? channel,
        toAddress: to ?? "no address",
        clientId: recipient.clientId ?? null,
        agentId: recipient.agentId ?? null,
        subject: options.subject ?? null,
        body,
        status,
        providerId: result?.providerId ?? null,
        error: result?.error ?? null,
        sentAt: status === "SENT" ? new Date() : null,
      })
      .returning({ id: messages.id });
    return inserted[0].id;
  };

  if (!to) {
    const messageId = await record("FAILED", options.body, {
      error:
        channel === "EMAIL"
          ? "No email address on the record."
          : "No telephone number on the record.",
    });
    return { status: "FAILED", error: "No address", messageId };
  }

  if (await isSuppressed(channel === "EMAIL" ? "EMAIL" : "PHONE", to)) {
    const messageId = await record("SUPPRESSED", options.body, {
      error: "On the suppression list, so nothing was sent.",
    });
    return { status: "FAILED", error: "Suppressed", messageId };
  }

  let body = options.body;
  let html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;line-height:1.6;color:#121111">${escapeHtml(
    body,
  )
    .split("\n")
    .join("<br>")}</div>`;

  if (options.withOptOut && recipient.clientId) {
    if (channel === "EMAIL") {
      const url = unsubscribeUrl(recipient.clientId);
      html += `<hr style="margin:24px 0 12px;border:none;border-top:1px solid #e3e5e8"><p style="font-family:system-ui,Arial,sans-serif;font-size:12px;color:#6b7280">If you would rather not receive these, <a href="${url}" style="color:#3d8397">unsubscribe here</a>.</p>`;
      body = `${body}\n\nIf you would rather not receive these, unsubscribe here: ${url}`;
    } else if (!/reply stop/i.test(body)) {
      body = `${body}\nReply STOP to opt out.`;
    }
  }

  const result =
    channel === "EMAIL"
      ? await sendEmail({
          to,
          subject: options.subject ?? "One Eleven",
          text: body,
          html,
          attachments: options.attachments,
        })
      : await sendViaSmsTo({ channel, to, body });

  const messageId = await record(result.status, body, result);
  return { ...result, messageId };
}
