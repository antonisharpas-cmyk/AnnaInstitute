import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, projectPartners, projects, units } from "@/db/schema";

/**
 * Keeping a project record current.
 *
 * A development picks up detail as it goes: a location, a completion date, the
 * company it is built with, the partners, the price list, the floor plans, the
 * photographs. This is the check on all of it, so a record does not quietly go
 * stale while the building goes up.
 */

export type CheckItem = {
  key: string;
  done: boolean;
  /** True when this is worth chasing rather than merely nice to have. */
  important: boolean;
};

const STALE_DAYS = 90;

export async function projectChecklist(projectId: string): Promise<{
  items: CheckItem[];
  done: number;
  total: number;
  checkedAt: Date | null;
  checkedBy: string | null;
  stale: boolean;
}> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

  const [[unitStats], [partnerCount], [fileStats], [planCount]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        priced: sql<number>`count(*) filter (where ${units.netPrice} > 0)::int`,
      })
      .from(units)
      .where(eq(units.projectId, projectId)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(projectPartners)
      .where(eq(projectPartners.projectId, projectId)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        photos: sql<number>`count(*) filter (where ${documents.category} = 'PROGRESS_PHOTO')::int`,
      })
      .from(documents)
      .where(eq(documents.projectId, projectId)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(documents)
      .where(and(eq(documents.projectId, projectId), eq(documents.category, "FLOOR_PLAN"))),
  ]);

  const [unitPlans] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(documents)
    .innerJoin(units, eq(units.id, documents.unitId))
    .where(and(eq(units.projectId, projectId), eq(documents.category, "FLOOR_PLAN")));

  const items: CheckItem[] = [
    { key: "company", done: Boolean(project?.companyId), important: true },
    { key: "partners", done: (partnerCount?.total ?? 0) > 0, important: false },
    { key: "location", done: Boolean(project?.location), important: true },
    { key: "completion", done: Boolean(project?.completionBy), important: true },
    { key: "description", done: Boolean(project?.description), important: false },
    { key: "units", done: (unitStats?.total ?? 0) > 0, important: true },
    {
      key: "prices",
      done: (unitStats?.total ?? 0) > 0 && unitStats.priced === unitStats.total,
      important: true,
    },
    { key: "plans", done: (planCount?.total ?? 0) + (unitPlans?.total ?? 0) > 0, important: true },
    { key: "photos", done: (fileStats?.photos ?? 0) > 0, important: false },
    { key: "files", done: (fileStats?.total ?? 0) > 0, important: false },
  ];

  const checkedAt = project?.recordCheckedAt ?? null;
  const stale =
    !checkedAt || Date.now() - new Date(checkedAt).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;

  return {
    items,
    done: items.filter((i) => i.done).length,
    total: items.length,
    checkedAt,
    checkedBy: project?.recordCheckedBy ?? null,
    stale,
  };
}

/**
 * The same check across every development, for the list page. One query each
 * rather than one per project, so the page stays quick as the list grows.
 */
export async function checklistSummary() {
  const rows = await db
    .select({
      id: projects.id,
      companyId: projects.companyId,
      location: projects.location,
      completionBy: projects.completionBy,
      description: projects.description,
      recordCheckedAt: projects.recordCheckedAt,
      units: sql<number>`(select count(*)::int from units u where u.project_id = projects.id)`,
      unpriced: sql<number>`(
        select count(*)::int from units u where u.project_id = projects.id and u.net_price <= 0
      )`,
      partners: sql<number>`(
        select count(*)::int from project_partners pp where pp.project_id = projects.id
      )`,
      files: sql<number>`(
        select count(*)::int from documents d where d.project_id = projects.id
      )`,
      plans: sql<number>`(
        select count(*)::int from documents d
        join units u on u.id = d.unit_id
        where u.project_id = projects.id and d.category = 'FLOOR_PLAN'
      )`,
    })
    .from(projects);

  const summary = new Map<string, { missing: number; important: number }>();
  for (const row of rows) {
    const checks = [
      { done: Boolean(row.companyId), important: true },
      { done: (row.partners ?? 0) > 0, important: false },
      { done: Boolean(row.location), important: true },
      { done: Boolean(row.completionBy), important: true },
      { done: Boolean(row.description), important: false },
      { done: (row.units ?? 0) > 0, important: true },
      { done: (row.units ?? 0) > 0 && (row.unpriced ?? 0) === 0, important: true },
      { done: (row.plans ?? 0) > 0, important: true },
      { done: (row.files ?? 0) > 0, important: false },
    ];
    summary.set(row.id, {
      missing: checks.filter((c) => !c.done).length,
      important: checks.filter((c) => !c.done && c.important).length,
    });
  }
  return summary;
}

/** How many developments have something important missing. */
export async function projectsNeedingAttention() {
  const summary = await checklistSummary();
  return [...summary.values()].filter((s) => s.important > 0).length;
}

/** Projects whose record nobody has confirmed in a long time. */
export async function uncheckedProjects() {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(projects)
    .where(isNull(projects.recordCheckedAt));
  return row?.total ?? 0;
}
