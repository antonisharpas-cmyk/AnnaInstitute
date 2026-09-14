/**
 * Pure helpers with no server dependencies, so they can be unit tested.
 */

export function normalisePhone(raw: string): string {
  const trimmed = raw.replace(/[^\d+]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  // Cyprus numbers are written locally as eight digits.
  if (trimmed.length === 8) return `+357${trimmed}`;
  return `+${trimmed}`;
}

/** Words that mean stop, in the forms people actually type. */
const STOP_WORDS = [
  "stop",
  "stopp",
  "unstop",
  "unsub",
  "unsubscribe",
  "cancel",
  "quit",
  "end",
  "opt out",
  "optout",
  "διαγραφη",
  "διαγραφή",
  "στοπ",
];

export function looksLikeStop(text: string): boolean {
  const cleaned = text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return false;
  return STOP_WORDS.includes(cleaned) || STOP_WORDS.some((w) => cleaned === `${w} all`);
}

/**
 * Replace the placeholders an administrator can type into a message.
 *
 * The four fixed ones are the person and the two links. Anything else a template
 * needs, such as the apartment a message is about, is passed in `extras` and
 * filled by name, so a template can say {{unit}} without this file knowing what
 * a unit is.
 */
export function fillPlaceholders(
  template: string,
  values: {
    name: string;
    firstName: string;
    priceListUrl?: string;
    filesUrl?: string;
    extras?: Record<string, string>;
  },
): string {
  let filled = template
    .replaceAll("{{name}}", values.name)
    .replaceAll("{{first_name}}", values.firstName)
    .replaceAll("{{price_list_url}}", values.priceListUrl ?? "")
    .replaceAll("{{files_url}}", values.filesUrl ?? "");

  for (const [key, value] of Object.entries(values.extras ?? {})) {
    filled = filled.replaceAll(`{{${key}}}`, value);
  }

  return filled;
}
