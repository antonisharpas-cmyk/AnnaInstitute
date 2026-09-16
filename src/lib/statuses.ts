import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contracts, installments, payments, projects, units } from "@/db/schema";
import { toCents } from "@/lib/money";
import { recordAudit } from "@/lib/audit";

/*
 * This module is deliberately free of the server-only marker the other
 * libraries carry: the same rule has to be runnable from the command line by
 * npm run db:statuses, which walks every contract once for records that were
 * entered before the rule existed. Nothing here is safe for a browser anyway,
 * since it talks to the database directly.
 */

/**
 * The money decides the status, unless a person has.
 *
 * The office told us the rule in their own words: an apartment is sold once a
 * contract exists and the first installment has come in, and it is delivered
 * once the contract is paid in full. A development is delivered once every
 * apartment in it is. Keeping that in code rather than in people's heads is the
 * difference between a list that can be trusted on a Monday morning and a list
 * somebody has to go through with a pen.
 *
 * Two things make this safe to run often. It is idempotent: it works out what
 * the status should be and writes only when that differs from what is there, so
 * calling it after every payment costs nothing and never loops. And it yields
 * to a person: an apartment or a development whose status was set by hand keeps
 * that status until somebody hands it back, because the office knows things the
 * schedule does not, such as a handover that happened before the last euro
 * arrived.
 *
 * It also works backwards. A payment recorded by mistake and then deleted takes
 * the apartment back from delivered to sold, and from sold to reserved, for the
 * same reason it moved it forward: the money is the evidence.
 */

type Who = { id: string; email: string } | null;

/** What one contract's money says its apartment's status should be. */
function deserved(
  dueCents: number,
  paidCents: number,
  current: "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED",
): "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED" {
  if (dueCents > 0 && paidCents >= dueCents) return "DELIVERED";
  if (paidCents > 0) return "SOLD";
  /**
   * A contract exists but nothing has come in against it yet, which is exactly
   * what the office calls reserved: the apartment is somebody's, the sale is
   * not. It goes back to reserved even from sold, because a payment that turns
   * out to have been recorded in error has to be able to be taken off. Anybody
   * who knows better sets the status by hand, and then none of this applies.
   */
  void current;
  return "RESERVED";
}

/**
 * Bring one contract's apartment, and then its development, up to date.
 *
 * Call it after anything that changes what has been paid or what is owed: a
 * payment recorded or deleted, a schedule recalculated, a contract created or
 * removed.
 */
export async function followTheMoney(contractId: string, who: Who = null): Promise<void> {
  const [contract] = await db
    .select({ id: contracts.id, unitId: contracts.unitId, reference: contracts.reference })
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1);

  if (!contract?.unitId) return;

  const [owed] = await db
    .select({ due: sql<string>`coalesce(sum(${installments.totalAmount}), 0)` })
    .from(installments)
    .where(eq(installments.contractId, contractId));

  const [received] = await db
    .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.contractId, contractId));

  const [unit] = await db
    .select({
      id: units.id,
      code: units.code,
      status: units.status,
      projectId: units.projectId,
      byHand: units.statusByHandAt,
    })
    .from(units)
    .where(eq(units.id, contract.unitId))
    .limit(1);

  if (!unit) return;

  if (unit.byHand === null) {
    const should = deserved(toCents(owed?.due ?? "0"), toCents(received?.paid ?? "0"), unit.status);

    if (should !== unit.status) {
      await db
        .update(units)
        .set({ status: should, updatedAt: new Date() })
        .where(eq(units.id, unit.id));

      await recordAudit({
        action: "unit.status.money",
        entity: "unit",
        entityId: unit.id,
        detail: `${unit.code}: ${unit.status} to ${should} on contract ${contract.reference}`,
        userId: who?.id,
        userEmail: who?.email ?? "the payment schedule",
      });
    }
  }

  await followTheApartments(unit.projectId, who);
}

/**
 * Bring one development's status up to date from its apartments.
 *
 * Delivered once every apartment in it is delivered, and back to completed if
 * that stops being true, since a building whose apartments were all handed over
 * is certainly finished even when one handover is later undone.
 */
export async function followTheApartments(projectId: string, who: Who = null): Promise<void> {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      byHand: projects.statusByHandAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project || project.byHand !== null) return;

  const [counted] = await db
    .select({
      total: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) filter (where ${units.status} = 'DELIVERED')::int`,
    })
    .from(units)
    .where(eq(units.projectId, projectId));

  const total = counted?.total ?? 0;
  const delivered = counted?.delivered ?? 0;
  const everyOne = total > 0 && delivered === total;

  const should = everyOne
    ? "DELIVERED"
    : project.status === "DELIVERED"
      ? "COMPLETED"
      : project.status;

  if (should === project.status) return;

  await db
    .update(projects)
    .set({ status: should, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await recordAudit({
    action: "project.status.apartments",
    entity: "project",
    entityId: projectId,
    detail: `${project.name}: ${project.status} to ${should} with ${delivered} of ${total} delivered`,
    userId: who?.id,
    userEmail: who?.email ?? "the apartments",
  });
}

/**
 * Somebody chose this status themselves.
 *
 * Recorded on the record so the rule above leaves it alone, and so the page can
 * say plainly that the status is a person's choice rather than the money's.
 */
export async function markUnitByHand(unitId: string, who: Who): Promise<void> {
  await db
    .update(units)
    .set({
      statusByHandAt: new Date(),
      statusByHandById: who?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(units.id, unitId));
}

export async function markProjectByHand(projectId: string, who: Who): Promise<void> {
  await db
    .update(projects)
    .set({
      statusByHandAt: new Date(),
      statusByHandById: who?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
}

/** Hand an apartment's status back to the money, and apply it at once. */
export async function handUnitBackToMoney(unitId: string, who: Who): Promise<void> {
  await db
    .update(units)
    .set({ statusByHandAt: null, statusByHandById: null, updatedAt: new Date() })
    .where(eq(units.id, unitId));

  const [found] = await db
    .select({ contractId: contracts.id, projectId: units.projectId })
    .from(units)
    .leftJoin(contracts, eq(contracts.unitId, units.id))
    .where(eq(units.id, unitId))
    .limit(1);

  if (found?.contractId) await followTheMoney(found.contractId, who);
  else if (found?.projectId) await followTheApartments(found.projectId, who);
}

/** Hand a development's status back to its apartments, and apply it at once. */
export async function handProjectBackToApartments(projectId: string, who: Who): Promise<void> {
  await db
    .update(projects)
    .set({ statusByHandAt: null, statusByHandById: null, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await followTheApartments(projectId, who);
}

/**
 * Go over every contract at once.
 *
 * Used the first time the rule arrives, so a database filled in before it
 * existed starts out agreeing with it, and available afterwards from the
 * command line when somebody wants to be sure.
 */
export async function followTheMoneyEverywhere(who: Who = null): Promise<number> {
  const rows = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      and(inArray(contracts.status, ["DRAFT", "ACTIVE", "COMPLETED"]), isNotNull(contracts.unitId)),
    );

  for (const row of rows) await followTheMoney(row.id, who);
  return rows.length;
}
