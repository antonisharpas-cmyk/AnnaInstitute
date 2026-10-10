import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { partners } from "@/db/schema";
import { listEntries } from "@/lib/choices";

/**
 * The partners directory: the office's outside partners and collaborators, by
 * category, with how to reach them.
 */

export type PartnerRow = typeof partners.$inferSelect;

const fold = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Every partner, in the order of the categories as the Builder has them, then
 * by name. The search looks at the name, the email, the mobile and the notes;
 * a mobile is matched on its digits, so "99 123" finds "+357 99123456".
 */
export async function listPartners(search = ""): Promise<PartnerRow[]> {
  const [rows, entries] = await Promise.all([
    db.select().from(partners).orderBy(asc(partners.name)),
    listEntries("partnerCategory"),
  ]);
  const order = new Map(entries.map((one, index) => [one.code, index]));
  const words = fold(search).trim().split(/\s+/).filter(Boolean);
  const digits = search.replace(/\D/g, "");

  return rows
    .filter((row) => {
      if (words.length === 0) return true;
      const hay = fold([row.name, row.email, row.mobile, row.notes].join(" "));
      if (words.every((word) => hay.includes(word))) return true;
      return digits.length >= 3 && (row.mobile ?? "").replace(/\D/g, "").includes(digits);
    })
    .sort(
      (a, b) =>
        (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export async function partnerById(id: string): Promise<PartnerRow | null> {
  const [row] = await db.select().from(partners).where(eq(partners.id, id)).limit(1);
  return row ?? null;
}

/** A mobile as a link the phone can dial: digits and a leading plus only. */
export function telHref(mobile: string): string {
  const trimmed = mobile.trim();
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${trimmed.replace(/\D/g, "")}`;
}
