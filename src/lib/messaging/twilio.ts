import "server-only";
import type { Channel, SendResult } from "./types";
import { normalisePhone } from "./text";
import { explainTwilioError, whatsappAddress } from "./twilioParts";

/**
 * SMS and WhatsApp through Twilio.
 *
 *   TWILIO_ACCOUNT_SID     the Account SID, starting AC
 *   TWILIO_AUTH_TOKEN      the Auth Token; or an API key instead, with
 *                          TWILIO_API_KEY_SID (SK...) and TWILIO_API_KEY_SECRET
 *   TWILIO_SMS_FROM        who the text comes from: a name of up to 11 letters
 *                          and digits, such as OneEleven, which is what Cyprus
 *                          phones show, or a Twilio number
 *   TWILIO_MESSAGING_SERVICE_SID  optional, a Messaging Service to send through instead
 *   TWILIO_WHATSAPP_FROM   the WhatsApp number, +14155238886 for the sandbox
 *
 * When TWILIO_ACCOUNT_SID is set, Twilio carries SMS and WhatsApp and SMS.to is
 * not used. A channel without its sender is not configured, and falls back to
 * SMS when MESSAGING_FALLBACK_TO_SMS allows it, as before.
 */
const clean = (value: string | undefined) => (value ?? "").trim().replace(/^["']|["']$/g, "").trim();
const env = (name: string) => clean(process.env[name]);

export function twilioStarted(): boolean {
  return Boolean(env("TWILIO_ACCOUNT_SID"));
}

function credentials(): { user: string; password: string } | null {
  const account = env("TWILIO_ACCOUNT_SID");
  if (!account) return null;
  if (env("TWILIO_API_KEY_SID") && env("TWILIO_API_KEY_SECRET")) {
    return { user: env("TWILIO_API_KEY_SID"), password: env("TWILIO_API_KEY_SECRET") };
  }
  if (env("TWILIO_AUTH_TOKEN")) return { user: account, password: env("TWILIO_AUTH_TOKEN") };
  return null;
}

export function twilioChannelConfigured(channel: Channel): boolean {
  if (!credentials()) return false;
  if (channel === "SMS") return Boolean(env("TWILIO_MESSAGING_SERVICE_SID") || env("TWILIO_SMS_FROM"));
  if (channel === "WHATSAPP") return Boolean(env("TWILIO_WHATSAPP_FROM"));
  return false;
}

/** What is set up, without any secret, for the Settings page. */
export function twilioSetup() {
  if (!twilioStarted()) return null;
  return {
    account: env("TWILIO_ACCOUNT_SID"),
    signedIn: Boolean(credentials()),
    smsFrom: env("TWILIO_MESSAGING_SERVICE_SID") ? "Messaging Service" : env("TWILIO_SMS_FROM"),
    whatsappFrom: env("TWILIO_WHATSAPP_FROM"),
  };
}

/* The WhatsApp refusals that mean "this person, this way, not now", worth an SMS instead. */
const WHATSAPP_TO_SMS = new Set([63015, 63016, 63024, 63032]);

export async function sendViaTwilio(options: { channel: Channel; to: string; body: string }): Promise<SendResult> {
  const fallback = String(process.env.MESSAGING_FALLBACK_TO_SMS ?? "true") === "true";
  let channel = options.channel;
  if (!twilioChannelConfigured(channel)) {
    if (channel !== "SMS" && fallback && twilioChannelConfigured("SMS")) {
      channel = "SMS";
    } else {
      return {
        status: "SIMULATED",
        error: credentials()
          ? `${options.channel} is not set up in Twilio yet, so nothing was sent.`
          : "Twilio is not fully configured (TWILIO_AUTH_TOKEN missing), so nothing was sent.",
      };
    }
  }

  const login = credentials()!;
  const form = new URLSearchParams();
  form.set("Body", options.body);
  if (channel === "WHATSAPP") {
    form.set("To", whatsappAddress(options.to));
    form.set("From", whatsappAddress(env("TWILIO_WHATSAPP_FROM")));
  } else {
    form.set("To", normalisePhone(options.to));
    if (env("TWILIO_MESSAGING_SERVICE_SID")) form.set("MessagingServiceSid", env("TWILIO_MESSAGING_SERVICE_SID"));
    else form.set("From", env("TWILIO_SMS_FROM"));
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env("TWILIO_ACCOUNT_SID"))}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${login.user}:${login.password}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        /* A provider that never answers is a failure after half a minute, not a campaign stuck sending. */
        signal: AbortSignal.timeout(30000),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      /*
       * A WhatsApp that cannot go to this person (not on WhatsApp, outside the
       * 24 hours without a template, not in the sandbox) goes by SMS instead,
       * when the office allows the fallback, so the news still arrives.
       */
      const code = (() => {
        try {
          return Number((JSON.parse(text) as { code?: number }).code ?? 0);
        } catch {
          return 0;
        }
      })();
      if (channel === "WHATSAPP" && fallback && WHATSAPP_TO_SMS.has(code) && twilioChannelConfigured("SMS")) {
        const sms = await sendViaTwilio({ channel: "SMS", to: options.to, body: options.body });
        return sms.status === "SENT"
          ? { ...sms, error: `Sent by SMS: ${explainTwilioError(response.status, text)}` }
          : sms;
      }
      return { status: "FAILED", error: explainTwilioError(response.status, text), usedChannel: channel };
    }
    const payload = JSON.parse(text) as { sid?: string };
    return { status: "SENT", providerId: payload.sid ?? null, usedChannel: channel };
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error.message : String(error), usedChannel: channel };
  }
}
