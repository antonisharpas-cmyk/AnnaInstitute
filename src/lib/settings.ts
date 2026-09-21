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
