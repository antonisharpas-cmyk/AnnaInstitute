import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agents, cashEntries, clients, constructors, partners, projects, subowners } from "@/db/schema";
import { toCents } from "./money";
import { many } from "./filters";

/**
 * Cash paid and received outside the invoices.
 *
 * A record of who, what for and how much, for the reports. It has no paper:
 * no invoice, no receipt, no VAT, and the accountant pack never reads it.
 */

export type CashFilter = {
  query?: string;
  /** IN for cash received, OUT for cash paid, empty for both. */
  direction?: string;
  /** Our companies, comma separated; "oneEleven" is One Eleven itself. */
  company?: string;
  /** Developments, comma separated; "NONE" is cash that belongs to no development. */
  project?: string;
  from?: Date | null;
  to?: Date | null;
};

function whereOf(filter: CashFilter): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  const words = (filter.query ?? "").trim();
  if (words) {
    const like = `%${words}%`;
    parts.push(or(ilike(cashEntries.party, like), ilike(cashEntries.description, like), ilike(cashEntries.notes, like), ilike(cashEntries.categoryOther, like)));
  }
  if (filter.direction === "IN" || filter.direction === "OUT") parts.push(eq(cashEntries.direction, filter.direction));
  const companies = many(filter.company).map((one) => (one === "oneEleven" ? "" : one));
  if (companies.length > 0) parts.push(inArray(cashEntries.ourCompanyId, companies));
  const places = many(filter.project);
  if (places.length > 0) {
    const named = places.filter((one) => one !== "NONE");
    const either: SQL[] = [];
    if (named.length > 0) either.push(inArray(cashEntries.projectId, named));
    if (places.includes("NONE")) either.push(sql`${cashEntries.projectId} is null`);
    parts.push(or(...either));
  }
  if (filter.from) parts.push(gte(cashEntries.entryDate, filter.from));
  if (filter.to) parts.push(lte(cashEntries.entryDate, filter.to));
  return and(...parts);
}

/** The cash records, newest first, a page at a time, with what came in and went out across all of them. */
export async function listCash(filter: CashFilter, limit: number, offset: number) {
  const where = whereOf(filter);
  const [rows, [sums]] = await Promise.all([
    db
      .select({ entry: cashEntries, project: { id: projects.id, name: projects.name } })
      .from(cashEntries)
      .leftJoin(projects, eq(projects.id, cashEntries.projectId))
      .where(where)
      .orderBy(desc(cashEntries.entryDate), desc(cashEntries.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        received: sql<string>`coalesce(sum(${cashEntries.amount}) filter (where ${cashEntries.direction} = 'IN'), 0)`,
        paid: sql<string>`coalesce(sum(${cashEntries.amount}) filter (where ${cashEntries.direction} = 'OUT'), 0)`,
      })
      .from(cashEntries)
      .where(where),
  ]);
  const receivedCents = toCents(sums?.received ?? "0");
  const paidCents = toCents(sums?.paid ?? "0");
  return { rows, total: Number(sums?.count ?? 0), receivedCents, paidCents, netCents: receivedCents - paidCents };
}

export async function cashEntryById(id: string) {
  const [row] = await db.select().from(cashEntries).where(eq(cashEntries.id, id)).limit(1);
  return row ?? null;
}

/**
 * The names the office already knows, offered as it types who paid or was
 * paid: clients, agents, constructors, partners, companies, and the names
 * written on earlier cash records.
 */
export async function knownNames(): Promise<string[]> {
  const [c, a, k, p, s, earlier] = await Promise.all([
    db.select({ first: clients.firstName, last: clients.lastName }).from(clients).where(sql`${clients.deletedAt} is null`),
    db.select({ name: agents.name }).from(agents),
    db.select({ name: constructors.name }).from(constructors),
    db.select({ name: partners.name, company: partners.company }).from(partners),
    db.select({ name: subowners.name }).from(subowners),
    db.selectDistinct({ name: cashEntries.party }).from(cashEntries).orderBy(asc(cashEntries.party)),
  ]);
  const names = [
    ...c.map((one) => `${one.first ?? ""} ${one.last ?? ""}`.trim()),
    ...a.map((one) => one.name),
    ...k.map((one) => one.name),
    ...p.flatMap((one) => [one.name, one.company ?? ""]),
    ...s.map((one) => one.name),
    ...earlier.map((one) => one.name),
  ];
  const seen = new Map<string, string>();
  for (const name of names) {
    const clean = name.trim();
    if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean);
  }
  return [...seen.values()].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" }));
}
