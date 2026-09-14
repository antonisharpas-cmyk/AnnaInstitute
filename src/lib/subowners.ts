import "server-only";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { projectPartners, projects, subowners, units } from "@/db/schema";
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

/** The partners on one development. */
export async function partnersOfProject(projectId: string) {
  return db
    .select({ partner: projectPartners, subowner: subowners })
    .from(projectPartners)
    .innerJoin(subowners, eq(subowners.id, projectPartners.subownerId))
    .where(eq(projectPartners.projectId, projectId))
    .orderBy(desc(projectPartners.sharePercent));
}

/** Everyone who can be added as a partner, for the picker. */
export async function subownerChoices() {
  return db
    .select({ id: subowners.id, name: subowners.name, company: subowners.company })
    .from(subowners)
    .where(eq(subowners.isActive, true))
    .orderBy(asc(subowners.name));
}
