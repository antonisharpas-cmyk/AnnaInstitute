import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/*
 * The handful of things the office sets once and forgets.
 *
 * A key and a value, with the default written here beside the key rather than
 * spread through the code, so "what happens if nobody has set this" has one
 * answer in one place.
 */

export const DEFAULTS = {
  /** The hour the day's summary goes out, on the office's own clock. */
  "appointments.summaryHour": "21",
  /** Whether a day with nothing on it still gets an email. */
  "appointments.summaryWhenEmpty": "no",
  /** Whether the summary is sent at all. */
  "appointments.summaryOn": "yes",
  /** The last day a summary was sent, so it is never sent twice. */
  "appointments.summaryLastSent": "",
  /** What happened on that run, in one line, for the settings page to show. */
  "appointments.summaryLastResult": "",
  /** Whether clients get a reminder the day before an appointment. */
  "appointments.reminderOn": "yes",
  /** The hour of the morning the day before when reminders start going. */
  "appointments.reminderHour": "10",
  /** The master switch for every email the CRM sends. */
  "mail.enabled": "yes",

  /*
   * The company as its invoices and receipts name it. Prefilled from the
   * office's own printed books; the ones left empty are asked for in Settings.
   */
  "company.name": "ONE ELEVEN INVESTMENT & DEVELOPING LTD",
  "company.registration": "HE 476522",
  "company.vat": "CY60112799G",
  "company.tic": "60112799G",
  "company.address": "4 Konstantinou Palaiologou & Zalongou, Rea Court, Shop 4, 6036 Larnaca, Cyprus",
  "company.phone": "+357 99658784, 70003396",
  "company.fax": "+357 24817905",
  "company.email": "info@oneeleven-ent.cy",
  "company.website": "",
  "company.bankName": "",
  "company.iban": "",
  "company.swift": "",

  /*
   * Where the running numbers carry on from. The printed books stopped at
   * invoice 0015 and receipt 0013, so the CRM starts at the next of each and
   * never goes below the highest it has already used.
   */
  "numbers.nextInvoice": "16",
  "numbers.nextReceipt": "14",
  /** Credit notes have their own series, new with the CRM. */
  "numbers.nextCreditNote": "1",
} as const;

export type SettingKey = keyof typeof DEFAULTS;

export async function readSetting(key: SettingKey): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? DEFAULTS[key];
}

export async function readSettings<K extends SettingKey>(keys: K[]): Promise<Record<K, string>> {
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  const answer = {} as Record<K, string>;
  for (const key of keys) {
    answer[key] = rows.find((row) => row.key === key)?.value ?? DEFAULTS[key];
  }
  return answer;
}

export async function writeSetting(key: SettingKey, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
