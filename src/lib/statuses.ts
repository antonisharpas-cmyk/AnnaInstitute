import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { contracts, installments, payments, projects, units } from "@/db/schema";
import { toCents } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import { recalculateCommission } from "@/lib/commissions";

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

/**
 * What one contract's money says its apartment's status should be.
 *
 * Money can say reserved and it can say sold. It cannot say delivered: a
 * building finishing in 2027 has apartments that are paid for and handed over
 * to nobody, so delivered is the office's word about the keys and is set by
 * hand. What the money does instead, once a contract is paid off, is say so in
 * plain words wherever the figures are shown.
 */
function deserved(
  dueCents: number,
  paidCents: number,
  current: "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED",
): "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED" {
  void dueCents;
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
    .select({
      id: contracts.id,
      unitId: contracts.unitId,
      reference: contracts.reference,
      status: contracts.status,
    })
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1);

  if (!contract?.unitId) return;

  /*
   * A cancelled contract no longer speaks for its apartment.
   *
   * The money on it stays on the record, because it was received, but a buyer
   * who walked away does not hold the apartment any more. Without this, the
   * reservation they paid would push the apartment straight back to reserved
   * the next time anything was recalculated, after the office had just put it
   * back on the market.
   */
  if (contract.status === "CANCELLED") return;

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

  {
    const should = deserved(toCents(owed?.due ?? "0"), toCents(received?.paid ?? "0"), unit.status);

    /*
      A status set by hand is a floor, not a freeze.

      It used to be a freeze, and that was wrong in the one case that matters
      most: an apartment brought in as reserved, or marked reserved by the
      office months ago, stayed reserved however much the buyer paid. The money
      had said sold and then said paid in full, and the list still said
      reserved, which is the CRM contradicting its own receipts.

      So a hand-set status still holds the apartment where it is against the
      money pulling it back, which is the reason it exists: the office records a
      handover before the last euro arrives and does not want the schedule
      undoing it. But when the money has gone further than the hand did, the
      money wins and the apartment moves forward.
    */
    const rank = { AVAILABLE: 0, RESERVED: 1, SOLD: 2, DELIVERED: 3 } as const;
    const forwards = rank[should] > rank[unit.status];
    const mayMove = unit.byHand === null || forwards;

    if (should !== unit.status && mayMove) {
      await db
        .update(units)
        .set({
          status: should,
          /*
            Once the money has carried an apartment past what somebody typed,
            that hand-set status has had its say. Clearing it hands the
            apartment back to the payments, which is also what the office would
            have to do by hand otherwise.
          */
          ...(unit.byHand === null ? {} : { statusByHandAt: null, statusByHandById: null }),
          updatedAt: new Date(),
        })
        .where(eq(units.id, unit.id));

      await recordAudit({
        action: "unit.status.money",
        entity: "unit",
        entityId: unit.id,
        detail: `${unit.code}: ${unit.status} to ${should} on contract ${contract.reference}${
          unit.byHand === null ? "" : ", past a status set by hand"
        }`,
        userId: who?.id,
        userEmail: who?.email ?? "the payment schedule",
      });
    }
  }

  /**
   * The agent's commission follows the money, not the apartment.
   *
   * It is asked to look again on every money change rather than only when the
   * apartment's status moved, because a status the office set by hand never
   * moves and an agent would then never be paid. The rule itself lives with the
   * commissions, which know the rate and the extras.
   */
  await recalculateCommission(contract.id);

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
    .leftJoin(contracts, and(eq(contracts.unitId, units.id), ne(contracts.status, "CANCELLED")))
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
