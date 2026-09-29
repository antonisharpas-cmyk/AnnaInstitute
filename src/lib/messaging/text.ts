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
 *
 * Forgiving about how a placeholder is typed, because it is typed by a person:
 * {{ first_name }}, {{First_Name}} and {{first name}} all mean the same thing.
 * One the CRM has no value for is left as it is, so placeholdersLeft can find it
 * before anything is sent.
 */
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z_ ]*?)\s*\}\}/g;
const keyOf = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, "_");

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
  const known: Record<string, string> = {
    name: values.name,
    first_name: values.firstName,
    firstname: values.firstName,
  };
  /* A link that does not exist is left as it is, so it is caught as unfilled
     rather than sent as "The full price list is here: " with nothing after it. */
  if (values.priceListUrl) known.price_list_url = values.priceListUrl;
  if (values.filesUrl) known.files_url = values.filesUrl;
  for (const [key, value] of Object.entries(values.extras ?? {})) known[keyOf(key)] = value;
  return template.replace(PLACEHOLDER, (whole, raw: string) => known[keyOf(raw)] ?? whole);
}

/** The placeholders still in a text after filling it: the ones that would go out as they are. */
export function placeholdersLeft(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) for (const match of (text ?? "").matchAll(PLACEHOLDER)) found.add(`{{${keyOf(match[1])}}}`);
  return [...found];
}
