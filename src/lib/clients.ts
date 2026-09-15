import "server-only";
import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, projects, units } from "@/db/schema";

export type AssignedApartment = {
  unitId: string;
  code: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED";
  netPrice: string;
  projectId: string;
  projectName: string;
  contractId: string | null;
  contractReference: string | null;
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
      contractId: contracts.id,
      contractReference: contracts.reference,
    })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(contracts, eq(contracts.unitId, units.id))
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

/* ---------------------------------------------------------------------------
   The clients list, in one place
   --------------------------------------------------------------------------- */

/** The filters the list understands, written once so the page and the bulk
 * actions cannot drift apart: "all matching" has to mean the same set that is
 * on screen, and the only way to be sure of that is to build it here. */
export function clientFilters({ query = "", held = "" }: { query?: string; held?: string }) {
  const parts: SQL[] = [isNull(clients.deletedAt) as SQL];

  if (query) {
    parts.push(
      or(
        ilike(clients.firstName, `%${query}%`),
        ilike(clients.lastName, `%${query}%`),
        ilike(clients.email, `%${query}%`),
        ilike(clients.phone, `%${query}%`),
        sql`concat(${clients.firstName}, ' ', ${clients.lastName}) ilike ${`%${query}%`}`,
      ) as SQL,
    );
  }
  if (held === "yes") {
    parts.push(sql`exists (select 1 from units u where u.client_id = ${clients.id})`);
  }
  if (held === "no") {
    parts.push(sql`not exists (select 1 from units u where u.client_id = ${clients.id})`);
  }

  return and(...parts);
}

export async function matchingClientIds(input: { query?: string; held?: string }) {
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(clientFilters(input))
    .orderBy(asc(clients.lastName), asc(clients.firstName))
    .limit(5000);
  return rows.map((row) => row.id);
}
