import { and, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * A search box, read the way people type into it.
 *
 * "Michalis Athanasiades" is two words that live in two columns, the first
 * name and the surname, so matching the whole phrase against each column
 * finds nobody. Here every word typed has to be found somewhere among the
 * fields, in any order: "Athanasiades Michalis", "michalis 99" and an email
 * all find the same person, and one word still works as it always did.
 */
export function wordsMatch(query: string | null | undefined, fields: (AnyPgColumn | SQL)[]): SQL | undefined {
  const words = (query ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0 || fields.length === 0) return undefined;
  return and(
    ...words.map((word) => {
      /* A % or _ typed is looked for as itself, not as a wildcard. */
      const like = `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return or(...fields.map((field) => sql`${field} ilike ${like}`)) as SQL;
    }),
  ) as SQL;
}

/** The same rule for a list already in hand: every word somewhere in the text, in any order. */
export function textMatches(query: string | null | undefined, text: string): boolean {
  const words = (query ?? "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const hay = text.toLowerCase();
  return words.every((word) => hay.includes(word));
}
