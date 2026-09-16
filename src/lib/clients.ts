import "server-only";
import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { many } from "@/lib/filters";
import { clients, contracts, projects, units } from "@/db/schema";
import { partnersByProject } from "@/lib/subowners";

export type AssignedApartment = {
  unitId: string;
  code: string;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED";
  netPrice: string;
  projectId: string;
  projectName: string;
  /** The partner companies holding that development. Empty means it is ours. */
  partners: string[];
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

  const held = await partnersByProject();

  for (const row of rows) {
    if (!row.unit.clientId) continue;
    const entry: AssignedApartment = {
      unitId: row.unit.id,
      code: row.unit.code,
      status: row.unit.status,
      netPrice: row.unit.netPrice,
      projectId: row.project.id,
      projectName: row.project.name,
      partners: (held.get(row.project.id) ?? []).map((p) => p.name),
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
export function clientFilters({
  query = "",
  held = "",
  project = "",
  partner = "",
  source = "",
}: {
  query?: string;
  held?: string;
  /** A development: the client holds an apartment in it. */
  project?: string;
  /** A partner company, or "ours" for the developments held by us alone. */
  partner?: string;
  /** Where they came from: "lead:WEBSITE" or "own:BUYER". */
  source?: string;
}) {
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
  /**
   * Every filter here takes a list, and a list of two opposites means both,
   * which is the same as neither: with and without an apartment ticked
   * together is every client, so nothing is added.
   */
  const holding = many(held);
  if (holding.length === 1 && holding[0] === "yes") {
    parts.push(sql`exists (select 1 from units u where u.client_id = ${clients.id})`);
  }
  if (holding.length === 1 && holding[0] === "no") {
    parts.push(sql`not exists (select 1 from units u where u.client_id = ${clients.id})`);
  }

  const buildings = many(project);
  if (buildings.length > 0) {
    parts.push(
      sql`exists (select 1 from units u where u.client_id = ${clients.id} and u.project_id in ${buildings})`,
    );
  }
  /**
   * Where the client came from.
   *
   * Two things can answer that, so the filter says which it means. A client
   * converted from an enquiry carries the enquiry's own source, which is the
   * truthful answer and the one the enquiries list shows; a client typed in by
   * the office carries the source on their own record. The prefix keeps the two
   * enumerations apart, since both of them have a value called OTHER.
   */
  const sources = many(source);
  const fromEnquiry = sources.filter((one) => one.startsWith("lead:")).map((one) => one.slice(5));
  const ourOwn = sources.filter((one) => one.startsWith("own:")).map((one) => one.slice(4));

  if (fromEnquiry.length > 0 || ourOwn.length > 0) {
    const reasons: SQL[] = [];
    if (fromEnquiry.length > 0) {
      reasons.push(
        sql`exists (select 1 from leads l where l.client_id = ${clients.id} and l.source_kind::text in ${fromEnquiry})`,
      );
    }
    if (ourOwn.length > 0) {
      reasons.push(sql`${clients.source}::text in ${ourOwn}`);
    }
    parts.push(or(...reasons) as SQL);
  }

  const partners = many(partner);
  const namedPartners = partners.filter((one) => one !== "ours");

  if (partners.length > 0) {
    const reasons: SQL[] = [];
    if (partners.includes("ours")) {
      reasons.push(
        sql`exists (
          select 1 from units u
          where u.client_id = ${clients.id}
            and not exists (select 1 from project_partners pp where pp.project_id = u.project_id)
        )`,
      );
    }
    if (namedPartners.length > 0) {
      reasons.push(
        sql`exists (
          select 1 from units u
          join project_partners pp on pp.project_id = u.project_id
          where u.client_id = ${clients.id} and pp.subowner_id in ${namedPartners}
        )`,
      );
    }
    parts.push(or(...reasons) as SQL);
  }

  return and(...parts);
}

/**
 * How the clients list can be ordered, as SQL for each column.
 *
 * The derived columns matter as much as the plain ones: somebody who wants the
 * clients of one development next to each other sorts by building, and that
 * lives in another table, so it is a subquery rather than a column. Each of
 * these returns one value per client, which is what makes them safe to order a
 * grouped query by.
 */
export const CLIENT_ORDER: Record<string, SQL> = {
  /**
   * By the name the way the column prints it, first name first.
   *
   * Sorting by surname while showing "Andreas Georgiou" makes a sorted list
   * look unsorted, and a list that looks wrong is worse than one ordered in a
   * way somebody would not have chosen.
   */
  name: sql`concat(${clients.firstName}, ' ', ${clients.lastName})`,
  email: sql`coalesce(${clients.email}, '')`,
  phone: sql`coalesce(${clients.phone}, '')`,
  country: sql`coalesce(${clients.country}, '')`,
  apartments: sql`(select min(concat(p.name, ' ', u.code)) from units u join projects p on p.id = u.project_id where u.client_id = ${clients.id})`,
  building: sql`(select min(p.name) from units u join projects p on p.id = u.project_id where u.client_id = ${clients.id})`,
  partner: sql`(select min(s.name) from units u join project_partners pp on pp.project_id = u.project_id join subowners s on s.id = pp.subowner_id where u.client_id = ${clients.id})`,
  source: sql`coalesce((select l.source_kind::text from leads l where l.client_id = ${clients.id} order by l.created_at desc limit 1), ${clients.source}::text)`,
  status: sql`(select min(u.status::text) from units u where u.client_id = ${clients.id})`,
  contracts: sql`(select count(*) from contracts c where c.client_id = ${clients.id})`,
  marketing: sql`${clients.marketingOptIn}`,
};

export async function matchingClientIds(input: {
  query?: string;
  held?: string;
  project?: string;
  partner?: string;
  source?: string;
}) {
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(clientFilters(input))
    .orderBy(asc(clients.lastName), asc(clients.firstName))
    .limit(5000);
  return rows.map((row) => row.id);
}
