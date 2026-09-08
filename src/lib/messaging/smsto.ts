import "server-only";
import type { Channel, SendResult } from "./types";
import { normalisePhone } from "./text";

export { looksLikeStop, normalisePhone } from "./text";

/**
 * SMS, WhatsApp and Viber through SMS.to, who are based in Cyprus and carry all
 * three on one account.
 *
 * SMS uses their documented single message endpoint. WhatsApp and Viber are only
 * attempted when a path is set in the environment, because the exact path and the
 * template arrangement have to be confirmed when the account is opened, and
 * WhatsApp additionally needs a dedicated number, business verification with Meta
 * and approved templates. Until then those channels fall back to SMS if
 * MESSAGING_FALLBACK_TO_SMS is true, and are otherwise recorded as simulated.
 */
const BASE = process.env.SMSTO_BASE_URL ?? "https://api.sms.to";

export function smsConfigured(): boolean {
  return Boolean(process.env.SMSTO_API_KEY);
}

export function channelConfigured(channel: Channel): boolean {
  if (channel === "SMS") return smsConfigured();
  if (channel === "WHATSAPP") return smsConfigured() && Boolean(process.env.SMSTO_WHATSAPP_PATH);
  if (channel === "VIBER") return smsConfigured() && Boolean(process.env.SMSTO_VIBER_PATH);
  return false;
}

function pathFor(channel: Channel): string | null {
  if (channel === "SMS") return "/sms/send";
  if (channel === "WHATSAPP") return process.env.SMSTO_WHATSAPP_PATH ?? null;
  if (channel === "VIBER") return process.env.SMSTO_VIBER_PATH ?? null;
  return null;
}

export async function sendViaSmsTo(options: {
  channel: Channel;
  to: string;
  body: string;
}): Promise<SendResult> {
  const fallback = String(process.env.MESSAGING_FALLBACK_TO_SMS ?? "true") === "true";
  let channel = options.channel;

  if (!channelConfigured(channel)) {
    if (channel !== "SMS" && fallback && smsConfigured()) {
      channel = "SMS";
    } else {
      return {
        status: "SIMULATED",
        error: smsConfigured()
          ? `${options.channel} is not configured yet, so nothing was sent.`
          : "SMS.to is not configured, so nothing was sent.",
      };
    }
  }

  const path = pathFor(channel);
  if (!path) {
    return {
      status: "SIMULATED",
      error: `No endpoint is configured for ${channel}.`,
    };
  }

  try {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SMSTO_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: normalisePhone(options.to),
        message: options.body,
        sender_id: process.env.SMSTO_SENDER_ID || undefined,
        callback_url: process.env.APP_URL
          ? `${process.env.APP_URL}/api/webhooks/sms-status`
          : undefined,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return {
        status: "FAILED",
        error: `${response.status} ${JSON.stringify(payload).slice(0, 300)}`,
        usedChannel: channel,
      };
    }

    const providerId =
      (payload.message_id as string) ??
      (payload.id as string) ??
      (payload.success ? "accepted" : null);

    return { status: "SENT", providerId, usedChannel: channel };
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      usedChannel: channel,
    };
  }
}
