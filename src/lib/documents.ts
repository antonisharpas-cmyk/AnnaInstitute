import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
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
  // Invoices and receipts filed against a payment are shown with that payment,
  // so they are left out of the contract's own file list.
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.contractId, contractId), isNull(documents.paymentId)))
    .orderBy(desc(documents.createdAt));
}

/**
 * The invoices and receipts filed against the payments of one contract, grouped
 * by the payment they belong to.
 */
export async function documentsByPayment(contractId: string) {
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.contractId, contractId), isNotNull(documents.paymentId)))
    .orderBy(desc(documents.createdAt));

  const byPayment = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.paymentId) continue;
    const list = byPayment.get(row.paymentId);
    if (list) list.push(row);
    else byPayment.set(row.paymentId, [row]);
  }
  return byPayment;
}

export async function documentsForClient(clientId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.clientId, clientId))
    .orderBy(desc(documents.createdAt));
}

export async function documentsForUnit(unitId: string) {
  // Only what belongs to the apartment itself. A client's own paperwork can name
  // the apartment it concerns, but it stays in the client's file.
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.unitId, unitId), isNull(documents.clientId)))
    .orderBy(desc(documents.createdAt));
}

/**
 * Everything in a client's file, wherever it was filed from.
 *
 * This is the whole point of the client profile being the place the office
 * works: a receipt attached to a payment on their contract, the signed contract
 * filed from the contract page, a drawing attached to one of their change
 * requests and an identity card uploaded here are all that client's paperwork,
 * and asking somebody to remember which page they filed it from is not a
 * filing system.
 *
 * So the file is gathered by relationship rather than by which column happens
 * to be filled in: theirs, or their contracts', or their apartments'. The
 * apartment code comes along so a buyer of two can tell them apart.
 */
export async function documentsForClientWithUnits(clientId: string) {
  return db
    .select({ document: documents, unitCode: units.code })
    .from(documents)
    .leftJoin(units, eq(units.id, documents.unitId))
    .where(
      or(
        eq(documents.clientId, clientId),
        sql`${documents.contractId} in (select c.id from contracts c where c.client_id = ${clientId})`,
        sql`${documents.unitId} in (select u.id from units u where u.client_id = ${clientId})`,
      ),
    )
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
    .where(and(eq(documents.projectId, projectId), eq(documents.category, "FLOOR_PLAN" as const)))
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
      and(
        inArray(documents.projectId, projectIds),
        eq(documents.category, "PROGRESS_PHOTO" as const),
      ),
    )
    .orderBy(desc(documents.createdAt));
}
