import { normalisePhone } from "@/lib/messaging/text";

/*
 * Will an SMS reach this number?
 *
 * The CRM writes a number in full, with its country, before sending: +357 is
 * added only to an eight digit Cyprus number, and anything else has to carry
 * its own + or 00. A UK mobile typed locally as 07..., or a landline, cannot
 * get an SMS, and finding that out from a failed campaign is too late. This
 * says what is wrong in plain words, or nothing when the number looks right.
 * It is a check of how the number is written, not a promise it is in use.
 */
export function phoneProblem(raw: string | null | undefined): string | null {
  const typed = (raw ?? "").trim();
  if (!typed) return null;
  const digits = typed.replace(/\D/g, "");
  if (digits.length < 8) return "Too short to be a mobile number.";
  const full = normalisePhone(typed);
  if (!/^\+[1-9]\d{7,14}$/.test(full)) {
    return /^\+0/.test(full)
      ? "No country code. Write it with + and the country, for example +44 7700 900123."
      : "Not a number an SMS can go to. Check the digits.";
  }
  if (full.startsWith("+357")) {
    const local = full.slice(4);
    if (local.length !== 8) return "A Cyprus number has 8 digits after +357.";
    if (!local.startsWith("9")) return "A Cyprus landline. Landlines cannot get an SMS.";
  }
  if (full.startsWith("+44") && !full.startsWith("+447")) return "A UK landline. UK mobiles start with +44 7.";
  if (full.startsWith("+1")) return "USA or Canada: an SMS sent by name does not arrive there.";
  return null;
}

/** The number as it will be sent, with its country. */
export function fullNumber(raw: string): string {
  return normalisePhone(raw);
}
