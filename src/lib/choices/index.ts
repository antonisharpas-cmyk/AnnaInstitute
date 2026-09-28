/* No server-only marker: the commission rule reads the stage names, and it is
   also run from the command line scripts that bring older records into line. */
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { choices } from "@/db/schema";
import { dictionaries, type MessageKey } from "@/i18n/dictionaries";
import { LIST_BY_KEY, LISTS, baseOf, isCustom, labelKey, type ListKey } from "./lists";

export * from "./lists";

/**
 * The office's own lists, read once and kept.
 *
 * Every page needs them, for its words and its pickers, and they change only
 * when somebody saves in the Builder, so they are read once per process and
 * forgotten on every save there. If the table is not there yet, the moment
 * before the migration runs, the lists read as the CRM ships them and nothing
 * is kept, so the first read after the migration sees the real rows.
 */
type Row = typeof choices.$inferSelect;

const store = globalThis as unknown as { __oeChoices?: Row[] | null };

export async function choiceRows(): Promise<Row[]> {
  if (store.__oeChoices) return store.__oeChoices;
  try {
    const rows = await db.select().from(choices).orderBy(asc(choices.sortOrder), asc(choices.createdAt));
    store.__oeChoices = rows;
    return rows;
  } catch {
    return [];
  }
}

export function forgetChoices(): void {
  store.__oeChoices = null;
}

/** The office's own words, as dictionary entries, for the translator. */
export async function choiceWords(locale: "en" | "el"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const row of await choiceRows()) {
    const def = LIST_BY_KEY[row.list as ListKey];
    if (!def) continue;
    const word = (locale === "el" ? row.labelEl?.trim() || row.labelEn?.trim() : row.labelEn?.trim()) || "";
    if (word) out[`${def.prefix}.${row.code}`] = word;
  }
  return out;
}

export type Entry = {
  code: string;
  /** The built in value it counts as; its own code when it is built in. */
  base: string;
  builtin: boolean;
  auto: boolean;
  locked: boolean;
  active: boolean;
  order: number;
  labelEn: string | null;
  labelEl: string | null;
  /** What the CRM calls it before anybody renamed it. */
  defaultEn: string;
  defaultEl: string;
  id: string | null;
};

/** One list as the office has it: the built in values, then its own, in its order. */
export async function listEntries(list: ListKey): Promise<Entry[]> {
  const def = LIST_BY_KEY[list];
  const rows = (await choiceRows()).filter((row) => row.list === list);
  const byCode = new Map(rows.map((row) => [row.code, row]));
  const word = (locale: "en" | "el", code: string) =>
    (dictionaries[locale] as Record<string, string>)[labelKey(list, code)] ??
    (dictionaries.en as Record<string, string>)[labelKey(list, code)] ??
    code.replace(/_/g, " ").toLowerCase();

  const entries: Entry[] = def.builtins.map((one, index) => {
    const row = byCode.get(one.code);
    return {
      code: one.code,
      base: one.code,
      builtin: true,
      auto: Boolean(one.auto),
      locked: Boolean(one.locked || one.auto),
      active: one.auto || one.locked ? true : (row?.active ?? true),
      order: row?.sortOrder ?? (index + 1) * 10,
      labelEn: row?.labelEn ?? null,
      labelEl: row?.labelEl ?? null,
      defaultEn: word("en", one.code),
      defaultEl: word("el", one.code),
      id: row?.id ?? null,
    };
  });

  const known = new Set(def.builtins.map((one) => one.code));
  for (const row of rows) {
    if (!isCustom(row.code) || !known.has(baseOf(row.code))) continue;
    entries.push({
      code: row.code,
      base: baseOf(row.code),
      builtin: false,
      auto: false,
      locked: false,
      active: row.active,
      order: row.sortOrder,
      labelEn: row.labelEn,
      labelEl: row.labelEl,
      defaultEn: row.labelEn ?? row.code,
      defaultEl: row.labelEl ?? row.labelEn ?? row.code,
      id: row.id,
    });
  }

  return entries.sort((a, b) => a.order - b.order);
}

export type Option = { value: string; label: string };

/**
 * What a picker offers.
 *
 * The values switched on, in the office's order, without the ones the CRM
 * writes by itself. The record's own value is always there too, even if it has
 * since been switched off, so opening an old record never quietly changes it.
 * A filter asks for everything, because it has to find the old ones as well.
 */
export async function optionsFor(
  list: ListKey,
  t: (key: MessageKey) => string,
  options?: { current?: string | null; everything?: boolean },
): Promise<Option[]> {
  const entries = await listEntries(list);
  const current = options?.current ?? null;
  return entries
    .filter((one) => options?.everything || one.code === current || (one.active && !one.auto))
    .map((one) => ({ value: one.code, label: t(labelKey(list, one.code) as MessageKey) }));
}

/** Is this something the list can hold: a built in value, or one of the office's own. */
export async function isAllowed(list: ListKey, code: string): Promise<boolean> {
  return (await listEntries(list)).some((one) => one.code === code);
}

/** The English word for a value, for the papers, which are always in English. */
export async function englishWord(list: ListKey, code: string): Promise<string> {
  const entry = (await listEntries(list)).find((one) => one.code === code);
  if (!entry) return code.replace(/_/g, " ").toLowerCase();
  return entry.labelEn?.trim() || entry.defaultEn;
}

/** Every list, for the Builder. */
export async function everyList() {
  return Promise.all(LISTS.map(async (def) => ({ def, entries: await listEntries(def.key) })));
}
