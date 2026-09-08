import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { documents, units } from "@/db/schema";
import type { SessionUser } from "./auth";

export type DocumentRow = typeof documents.$inferSelect;

/**
 * This is an internal tool, so every file is internal. Anybody who can sign in
 * can read the documents, and nobody outside the office has a login at all.
 * The check stays in one place so that adding an outside role later means
 * changing this function and nothing else.
 */
export async function canReadDocument(user: SessionUser): Promise<boolean> {
  return user.role === "ADMIN";
}

export async function documentsForContract(contractId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.contractId, contractId))
    .orderBy(desc(documents.createdAt));
}

export async function documentsForClient(clientId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.clientId, clientId))
    .orderBy(desc(documents.createdAt));
}

export async function documentsForUnit(unitId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.unitId, unitId))
    .orderBy(desc(documents.createdAt));
}

export async function documentsForProject(projectId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.createdAt));
}

/**
 * Everything kept against a project, including the files that belong to one of
 * its apartments, with that apartment's code so each row can say where it
 * belongs.
 */
export async function documentsForProjectWithUnits(projectId: string) {
  return db
    .select({ document: documents, unitCode: units.code })
    .from(documents)
    .leftJoin(units, eq(units.id, documents.unitId))
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.createdAt));
}

/** Floor plans for every apartment in a project, ready to group by apartment. */
export async function floorPlansByUnit(projectId: string) {
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.projectId, projectId),
        eq(documents.category, "FLOOR_PLAN" as const),
      ),
    )
    .orderBy(asc(documents.createdAt));

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.unitId) continue;
    const list = grouped.get(row.unitId);
    if (list) list.push(row);
    else grouped.set(row.unitId, [row]);
  }
  return grouped;
}

/** Files kept against the project itself rather than one of its apartments. */
export async function projectOnlyDocuments(projectId: string) {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, projectId), isNull(documents.unitId)))
    .orderBy(desc(documents.createdAt));
}

export async function photosForProjects(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db
    .select()
    .from(documents)
    .where(
      and(inArray(documents.projectId, projectIds), eq(documents.category, "PROGRESS_PHOTO" as const)),
    )
    .orderBy(desc(documents.createdAt));
}
