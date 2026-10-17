/*
 * The plain pieces of sending through Twilio, kept apart from the sending so
 * they can be tested without a network or an account.
 */
import { normalisePhone } from "./text";

/** A WhatsApp address as Twilio wants it: whatsapp:+35799123456. */
export function whatsappAddress(value: string): string {
  return `whatsapp:${normalisePhone(value.replace(/^whatsapp:/i, ""))}`;
}

/** A number that came in from Twilio, with the whatsapp: in front taken off. */
export function plainNumber(value: string): string {
  return value.replace(/^whatsapp:/i, "").trim();
}

/*
 * The Twilio errors the office will actually meet, in words it can act on.
 * The code and Twilio's own message are kept at the end, for us.
 */
const MEANINGS: Record<number, string> = {
  20003: "Twilio does not accept the Account SID and Auth Token. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
  20404: "Twilio cannot find this account. Check TWILIO_ACCOUNT_SID.",
  21211: "The telephone number is not a valid mobile number.",
  21212: "The sender is not valid. Check TWILIO_SMS_FROM: up to 11 letters and digits, with at least one letter, or a Twilio number.",
  21408: "Sending to this country is switched off in Twilio. Turn it on under Messaging, Settings, Geo permissions.",
  21606: "This sender cannot send to that number. On a trial account, send from your Twilio trial number instead of a name.",
  21608: "On a Twilio trial account messages only go to verified numbers. Add this number under Phone Numbers, Verified Caller IDs, or upgrade the account.",
  21610: "This number replied STOP to us before, so Twilio will not send to it.",
  21612: "Twilio cannot send from this sender to this number.",
  21614: "This is not a mobile number, so it cannot receive a text.",
  21659: "The sender is not a Twilio number of this account. Check TWILIO_SMS_FROM.",
  63007: "Twilio has no WhatsApp sender with this number. Check TWILIO_WHATSAPP_FROM.",
  63015: "This number has not joined the WhatsApp sandbox. Send the join code from that phone to the sandbox number first.",
  63016: "WhatsApp only allows a free text message within 24 hours of the person's last message. Outside that, an approved template is needed.",
  63024: "The number is not on WhatsApp.",
  63032: "WhatsApp did not deliver to this number, because of its own limits on this person or sender.",
};

export function explainTwilioError(status: number, body: string): string {
  let code = 0;
  let message = "";
  try {
    const parsed = JSON.parse(body) as { code?: number; message?: string };
    code = Number(parsed.code ?? 0);
    message = parsed.message ?? "";
  } catch {
    message = body.slice(0, 300);
  }
  const plain = MEANINGS[code] ?? (status === 401 ? MEANINGS[20003] : status >= 500 ? "Twilio did not answer properly. Try again in a few minutes." : "");
  const detail = [code ? String(code) : "", message].filter(Boolean).join(": ").slice(0, 300);
  return [plain, detail ? `(Twilio says ${detail})` : `(Twilio answered ${status})`].filter(Boolean).join(" ");
}
