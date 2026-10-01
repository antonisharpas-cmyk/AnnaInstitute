import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  projectPartners,
  projects,
  subownerDirectors,
  subownerShares,
  subowners,
  units,
} from "@/db/schema";
import { toCents } from "./money";

/**
 * Partners on a development.
 *
 * One Eleven does not own every building outright. A subowner holds a share of
 * a development with us, so the office needs their card, what they hold, and how
 * that development is selling.
 */

export async function listSubowners({
  query = "",
  active = "",
  limit = 20,
  offset = 0,
}: {
  query?: string;
  active?: string;
  limit?: number;
  offset?: number;
}) {
  const filters: SQL[] = [];
  if (query) {
    filters.push(
      or(
        ilike(subowners.name, `%${query}%`),
        ilike(subowners.company, `%${query}%`),
        ilike(subowners.contactName, `%${query}%`),
        ilike(subowners.email, `%${query}%`),
        ilike(subowners.phone, `%${query}%`),
      ) as SQL,
    );
  }
  if (active === "yes") filters.push(eq(subowners.isActive, true));
  if (active === "no") filters.push(eq(subowners.isActive, false));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        subowner: subowners,
        projectCount: sql<number>`(
          select count(*)::int from project_partners pp where pp.subowner_id = subowners.id
        )`,
      })
      .from(subowners)
      .where(where)
      .orderBy(asc(subowners.name))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(subowners)
      .where(where),
  ]);

  return { rows, total: counted?.total ?? 0 };
}

/** The developments one partner holds a share of, with how each is selling. */
export async function projectsOfSubowner(subownerId: string) {
  const rows = await db
    .select({ partner: projectPartners, project: projects })
    .from(projectPartners)
    .innerJoin(projects, eq(projects.id, projectPartners.projectId))
    .where(eq(projectPartners.subownerId, subownerId))
    .orderBy(asc(projects.name));

  if (rows.length === 0) return [];

  const counts = await db
    .select({
      projectId: units.projectId,
      total: sql<number>`count(*)::int`,
      sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
      value: sql<string>`coalesce(sum(${units.netPrice}), 0)`,
      soldValue: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} in ('SOLD','DELIVERED')), 0)`,
    })
    .from(units)
    .groupBy(units.projectId);

  const byProject = new Map(counts.map((c) => [c.projectId, c]));

  return rows.map((row) => {
    const found = byProject.get(row.project.id);
    return {
      ...row,
      unitCount: found?.total ?? 0,
      soldCount: found?.sold ?? 0,
      valueCents: toCents(found?.value ?? "0"),
      soldValueCents: toCents(found?.soldValue ?? "0"),
    };
  });
}

/**
 * Who holds each development, and for how much of it.
 *
 * A development with no partner line is held by One Eleven alone, which is why
 * an empty list is meaningful here rather than missing data. One Eleven is
 * never a line of its own: our share is whatever the partners do not hold, so
 * the caller works it out and decides what to print for it.
 */
export async function partnersByProject(): Promise<
  Map<string, { name: string; share: number | null }[]>
> {
  const rows = await db
    .select({
      projectId: projectPartners.projectId,
      name: subowners.name,
      share: projectPartners.sharePercent,
    })
    .from(projectPartners)
    .innerJoin(subowners, eq(subowners.id, projectPartners.subownerId))
    .orderBy(asc(subowners.name));

  const held = new Map<string, { name: string; share: number | null }[]>();
  for (const row of rows) {
    const entry = { name: row.name, share: row.share === null ? null : Number(row.share) };
    const list = held.get(row.projectId);
    if (list) list.push(entry);
    else held.set(row.projectId, [entry]);
  }
  return held;
}

/** The partners on one development. */
export async function partnersOfProject(projectId: string) {
  return db
    .select({ partner: projectPartners, subowner: subowners })
    .from(projectPartners)
    .innerJoin(subowners, eq(subowners.id, projectPartners.subownerId))
    .where(eq(projectPartners.projectId, projectId))
    .orderBy(asc(subowners.name));
}

/** Everyone who can be added as a partner, for the picker. */
export async function subownerChoices() {
  return db
    .select({ id: subowners.id, name: subowners.name, company: subowners.company })
    .from(subowners)
    .where(eq(subowners.isActive, true))
    .orderBy(asc(subowners.name));
}

/**
 * The people a partner company is dealt with through.
 *
 * Ordered as they were added rather than by name, because the first one put in
 * is usually the one the office actually rings.
 */
export async function directorsOf(subownerId: string) {
  return db
    .select()
    .from(subownerDirectors)
    .where(eq(subownerDirectors.subownerId, subownerId))
    .orderBy(asc(subownerDirectors.createdAt));
}

/**
 * Who owns the partner company, largest holding first, with what is unaccounted
 * for worked out rather than assumed.
 *
 * A company whose shares add up to less than a hundred is not an error: the
 * office may only have recorded the holders it deals with. Saying what is left
 * over is more honest than quietly showing a total of sixty.
 */
export const ONE_ELEVEN = "One Eleven";

/**
 * Every company has One Eleven among its shareholders.
 *
 * The line is made the first time the company is opened, or found among the
 * lines already typed ("One Eleven", "ONE ELEVEN INVESTMENT...") and marked as
 * ours, so it is never there twice and can never be taken off.
 */
export async function ensureOneEleven(subownerId: string): Promise<void> {
  const rows = await db.select().from(subownerShares).where(eq(subownerShares.subownerId, subownerId));
  if (rows.some((row) => row.isOneEleven)) return;
  const typed = rows.find((row) => /^\s*one\s*eleven\b/i.test(row.holder));
  if (typed) {
    await db.update(subownerShares).set({ isOneEleven: true, holderKind: typed.holderKind ?? "COMPANY" }).where(eq(subownerShares.id, typed.id));
    return;
  }
  await db.insert(subownerShares).values({ subownerId, holder: ONE_ELEVEN, isOneEleven: true, holderKind: "COMPANY" });
}

export async function sharesOf(subownerId: string) {
  await ensureOneEleven(subownerId);
  const rows = await db
    .select()
    .from(subownerShares)
    .where(eq(subownerShares.subownerId, subownerId))
    .orderBy(desc(subownerShares.isOneEleven), desc(subownerShares.sharePercent), asc(subownerShares.holder));

  const accounted = rows.reduce((total, row) => total + Number(row.sharePercent ?? 0), 0);

  return { rows, accounted, unaccounted: Math.max(0, 100 - accounted) };
}
