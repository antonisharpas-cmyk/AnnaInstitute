import { or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { baseOf, isCustom } from "./lists";

/**
 * A filter over a list with the office's own values in it.
 *
 * Picking a built in value finds every record that counts as it, the office's
 * own values under it included: "Reserved" still finds the apartments held for
 * the owner. Picking one of the office's own values finds exactly those.
 */
export function choiceFilter(
  base: AnyColumn,
  choice: AnyColumn | null,
  values: string[],
  known: readonly string[],
): SQL | null {
  const builtin = values.filter((value) => known.includes(value));
  const own = values.filter((value) => isCustom(value) && known.includes(baseOf(value)));
  const list = (items: string[]) => sql.join(items.map((item) => sql`${item}`), sql`, `);

  const parts: SQL[] = [];
  if (builtin.length > 0) parts.push(sql`${base}::text in (${list(builtin)})`);
  if (own.length > 0) parts.push(choice ? sql`${choice} in (${list(own)})` : sql`${base}::text in (${list(own)})`);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : (or(...parts) as SQL);
}
