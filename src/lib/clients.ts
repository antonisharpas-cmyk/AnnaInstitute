import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contractUnits, contracts, projects, units } from "@/db/schema";

export type AssignedApartment = {
  unitId: string;
  code: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED";
  netPrice: string;
  projectId: string;
  projectName: string;
  contractId: string | null;
  contractReference: string | null;
  assignmentId: string | null;
};

/** The apartments assigned to each of these clients, keyed by client. */
export async function apartmentsByClient(
  clientIds: string[],
): Promise<Map<string, AssignedApartment[]>> {
  const grouped = new Map<string, AssignedApartment[]>();
  if (clientIds.length === 0) return grouped;

  const rows = await db
    .select({
      unit: units,
      project: projects,
      assignmentId: contractUnits.id,
      contractId: contracts.id,
      contractReference: contracts.reference,
    })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(contractUnits, eq(contractUnits.unitId, units.id))
    .leftJoin(contracts, eq(contracts.id, contractUnits.contractId))
    .where(inArray(units.clientId, clientIds))
    .orderBy(asc(projects.name), asc(units.code));

  for (const row of rows) {
    if (!row.unit.clientId) continue;
    const entry: AssignedApartment = {
      unitId: row.unit.id,
      code: row.unit.code,
      status: row.unit.status,
      netPrice: row.unit.netPrice,
      projectId: row.project.id,
      projectName: row.project.name,
      contractId: row.contractId,
      contractReference: row.contractReference,
      assignmentId: row.assignmentId,
    };
    const list = grouped.get(row.unit.clientId);
    if (list) list.push(entry);
    else grouped.set(row.unit.clientId, [entry]);
  }

  return grouped;
}

/**
 * Apartments that can be assigned: anything not already held by another client.
 * Grouped by project so one dropdown covers the project and the apartment.
 */
export async function assignableUnits(currentClientId?: string) {
  const rows = await db
    .select({ unit: units, project: projects })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .orderBy(asc(projects.name), asc(units.code));

  const usable = rows.filter((r) => !r.unit.clientId || r.unit.clientId === currentClientId);

  const grouped = new Map<string, { projectName: string; units: typeof usable }>();
  for (const row of usable) {
    const entry = grouped.get(row.project.id);
    if (entry) entry.units.push(row);
    else
      grouped.set(row.project.id, {
        projectName: row.project.name,
        units: [row],
      });
  }
  return grouped;
}
