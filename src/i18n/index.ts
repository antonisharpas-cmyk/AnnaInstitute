import { cookies } from "next/headers";
import { dictionaries, type Locale, type MessageKey } from "./dictionaries";
import { choiceWords } from "@/lib/choices";

export const LOCALE_COOKIE = "oe_locale";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const value = jar.get(LOCALE_COOKIE)?.value;
  return value === "el" ? "el" : "en";
}

/**
 * The words for a locale.
 *
 * The office's own names from the Builder come first, so a status renamed there
 * reads the new way on every page without any page knowing about it.
 */
export function translator(locale: Locale, own: Record<string, string> = {}) {
  return (key: MessageKey): string => own[key] ?? dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
}

export async function getTranslator() {
  const locale = await getLocale();
  return { locale, t: translator(locale, await choiceWords(locale)) };
}

export type { Locale, MessageKey };
