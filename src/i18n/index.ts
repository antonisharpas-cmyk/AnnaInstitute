import { cookies } from "next/headers";
import { dictionaries, type Locale, type MessageKey } from "./dictionaries";

export const LOCALE_COOKIE = "oe_locale";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const value = jar.get(LOCALE_COOKIE)?.value;
  return value === "el" ? "el" : "en";
}

export function translator(locale: Locale) {
  return (key: MessageKey): string => dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
}

export async function getTranslator() {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}

export type { Locale, MessageKey };
