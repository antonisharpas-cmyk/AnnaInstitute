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
  /** Where the tests from the Automatic emails page go. Empty means the signed in user. */
  "emails.testAddress": "",
  /** The office's own WhatsApp number, for trying a campaign on itself. */
  "campaigns.testPhone": "",

  /*
   * One Eleven as its own invoices, receipts and credit notes name it: the
   * papers for a development no company holds, and its fees to the companies.
   * A development a company holds is invoiced by that company, from the
   * details on the company's own page.
   */
  "company.name": "ONE ELEVEN INVESTMENT AND DEVELOPING LTD",
  "company.registration": "HE 463268",
  "company.vat": "CY60112799G",
  "company.tic": "60112799G",
  "company.address": "75 Ermou Street, Larnaca 6022, Cyprus",
  "company.phone": "+357 24 342720",
  "company.mobile": "+357 99 858784",
  "company.fax": "",
  "company.email": "info@oneeleven-ent.cy",
  "company.website": "www.oneeleven.com.cy",
  "company.bankName": "Alpha Bank",
  "company.beneficiary": "ONE ELEVEN INVESTMENT AND DEVELOPING LTD",
  "company.bankAccount": "4341010132490",
  "company.iban": "CY53009004340004341010132490",
  "company.swift": "ABKLCY2N",

  /*
   * Where the running numbers carry on from. The printed books stopped at
   * invoice 0015 and receipt 0013, so the CRM starts at the next of each and
   * never goes below the highest it has already used.
   */
  "numbers.nextInvoice": "16",
  "numbers.nextReceipt": "14",
  /** Credit notes have their own series, new with the CRM. */
  "numbers.nextCreditNote": "1",

  /** Where the month's papers go: the accountant, and anybody copied, commas between. */
  "accountant.email": "",
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
