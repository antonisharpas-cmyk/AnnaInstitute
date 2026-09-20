import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  commissionPayments,
  commissions,
  contracts,
  contractUnits,
  projectPartners,
  subownerDirectors,
  subownerShares,
  units,
} from "@/db/schema";

/*
 * What goes with a record, asked before anybody presses anything.
 *
 * Every page that offers a delete asks these first, so it can say what else
 * will go and, where something is in the way, what to deal with first. A
 * refusal that names the obstacle is worth more than a button that fails.
 *
 * The rule throughout is the same: a contract is never taken away as a side
 * effect. It carries a buyer, a schedule and payments that have been receipted,
 * so anything holding one refuses and says which.
 */

/** Contracts attached to a set of apartments, by either route. */
export async function contractsOnUnits(unitIds: string[]): Promise<string[]> {
  if (unitIds.length === 0) return [];

  const direct = await db
    .select({ reference: contracts.reference })
    .from(contracts)
    .where(inArray(contracts.unitId, unitIds));

  const shared = await db
    .select({ reference: contracts.reference })
    .from(contractUnits)
    .innerJoin(contracts, eq(contracts.id, contractUnits.contractId))
    .where(inArray(contractUnits.unitId, unitIds));

  return [...new Set([...direct, ...shared].map((row) => row.reference))];
}

export async function whatGoesWithProject(projectId: string) {
  const rows = await db.select({ id: units.id }).from(units).where(eq(units.projectId, projectId));
  const partners = await db
    .select({ id: projectPartners.id })
    .from(projectPartners)
    .where(eq(projectPartners.projectId, projectId));

  return {
    apartments: rows.length,
    partners: partners.length,
    contracts: await contractsOnUnits(rows.map((row) => row.id)),
  };
}

export async function whatGoesWithUnit(unitId: string) {
  return { contracts: await contractsOnUnits([unitId]) };
}

/**
 * An agent holding commissions is not deleted.
 *
 * The commission lines are the office's own record of what was earned and what
 * was paid, with the invoice and the receipt filed against them. Taking the
 * agent away would take all of that with them, so the refusal asks for the
 * lines to be dealt with first, or for the agent to be made inactive instead,
 * which is what that switch is for.
 */
export async function whatGoesWithAgent(agentId: string) {
  const lines = await db
    .select({ id: commissions.id })
    .from(commissions)
    .where(eq(commissions.agentId, agentId));

  const paid = await db
    .select({ id: commissionPayments.id })
    .from(commissionPayments)
    .where(eq(commissionPayments.agentId, agentId));

  const sales = await db
    .select({ reference: contracts.reference })
    .from(contracts)
    .where(eq(contracts.agentId, agentId));

  return {
    commissions: lines.length,
    payments: paid.length,
    sales: sales.map((row) => row.reference),
  };
}

/**
 * A partner company can always go.
 *
 * What it holds of a development is an agreement between us and them, so it
 * goes with them, and the development reads as ours outright afterwards. The
 * page says that plainly before anybody presses it, because it changes who a
 * building belongs to.
 */
export async function whatGoesWithPartner(subownerId: string) {
  const held = await db
    .select({ id: projectPartners.id })
    .from(projectPartners)
    .where(eq(projectPartners.subownerId, subownerId));

  const people = await db
    .select({ id: subownerDirectors.id })
    .from(subownerDirectors)
    .where(eq(subownerDirectors.subownerId, subownerId));

  const owners = await db
    .select({ id: subownerShares.id })
    .from(subownerShares)
    .where(eq(subownerShares.subownerId, subownerId));

  return { developments: held.length, directors: people.length, shareholders: owners.length };
}

/**
 * Which of these developments have a contract somewhere in them.
 *
 * The list offers a delete in the row, and a button that can only fail is
 * worse than no button, so the page asks this once for the page of rows it is
 * about to draw and leaves the delete off the ones that are held.
 */
export async function projectsWithContracts(projectIds: string[]): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();

  const direct = await db
    .select({ projectId: units.projectId })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .where(inArray(units.projectId, projectIds));

  const shared = await db
    .select({ projectId: units.projectId })
    .from(contractUnits)
    .innerJoin(units, eq(units.id, contractUnits.unitId))
    .where(inArray(units.projectId, projectIds));

  return new Set([...direct, ...shared].map((row) => row.projectId));
}
