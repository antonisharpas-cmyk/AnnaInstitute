/*
 * No server-only marker here: the commission rule below is also reached from
 * the payments path, which a command line script walks when it brings older
 * records into line. Nothing in this file is safe for a browser anyway, since
 * it talks to the database directly.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  clients,
  commissionPayments,
  commissions,
  contracts,
  projects,
  units,
} from "@/db/schema";
import { fromCents, toCents } from "./money";

export type CommissionLine = {
  id: string;
  kind: "RATE" | "EXTRA";
  label: string | null;
  baseCents: number;
  rate: number;
  amountCents: number;
  paidCents: number;
  outstandingCents: number;
  status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
};

/**
 * What an agent has earned, sale by sale.
 *
 * A sale is one contract: one apartment, one buyer. It carries the rate line and
 * any extras, and each line knows what has been paid against it, so the office
 * can settle one and leave another.
 */
export async function salesOfAgent(agentId: string) {
  const rows = await db
    .select({
      contract: contracts,
      unit: units,
      project: projects,
      client: clients,
    })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(eq(contracts.agentId, agentId))
    .orderBy(desc(contracts.createdAt));

  const contractIds = rows.map((r) => r.contract.id);

  const lines = contractIds.length
    ? await db
        .select({
          line: commissions,
          // The table name is written out rather than interpolated: on a select
          // from one table drizzle emits a bare "id", which inside this
          // subquery would bind to commission_payments and never match.
          paid: sql<string>`coalesce((select sum(cp.amount) from commission_payments cp where cp.commission_id = commissions.id), 0)`,
        })
        .from(commissions)
        .where(inArray(commissions.contractId, contractIds))
        .orderBy(asc(commissions.kind), asc(commissions.createdAt))
    : [];

  const byContract = new Map<string, CommissionLine[]>();
  for (const { line, paid } of lines) {
    const amountCents = toCents(line.amount);
    const paidCents = toCents(paid);
    const entry: CommissionLine = {
      id: line.id,
      kind: line.kind,
      label: line.label,
      baseCents: toCents(line.baseAmount),
      rate: Number(line.rate),
      amountCents,
      paidCents,
      outstandingCents: amountCents - paidCents,
      status: line.status,
    };
    const list = byContract.get(line.contractId);
    if (list) list.push(entry);
    else byContract.set(line.contractId, [entry]);
  }

  return rows.map((r) => {
    const own = byContract.get(r.contract.id) ?? [];
    const generatedCents = own.reduce((a, l) => a + l.amountCents, 0);
    const paidCents = own.reduce((a, l) => a + l.paidCents, 0);

    // What the apartment was priced at against what it actually went for. A
    // positive difference is the usual reason for an extra line.
    const listPriceCents = r.unit ? toCents(r.unit.netPrice) : 0;
    const soldCents = toCents(r.contract.netPrice);

    return {
      ...r,
      lines: own,
      generatedCents,
      paidCents,
      outstandingCents: generatedCents - paidCents,
      listPriceCents,
      soldCents,
      differenceCents: soldCents - listPriceCents,
    };
  });
}

/** Every commission line in the system, for the commissions section. */
export async function allCommissionLines() {
  return db
    .select({
      line: commissions,
      agent: agents,
      contract: contracts,
      unit: units,
      project: projects,
      client: clients,
      paid: sql<string>`coalesce((select sum(cp.amount) from commission_payments cp where cp.commission_id = ${commissions.id}), 0)`,
    })
    .from(commissions)
    .innerJoin(agents, eq(agents.id, commissions.agentId))
    .leftJoin(contracts, eq(contracts.id, commissions.contractId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .orderBy(desc(commissions.createdAt));
}

/** What an agent is owed in total, without listing the sales. */
export async function commissionTotals(agentId: string) {
  const [generated] = await db
    .select({ total: sql<string>`coalesce(sum(${commissions.amount}), 0)` })
    .from(commissions)
    .where(eq(commissions.agentId, agentId));

  const [paid] = await db
    .select({ total: sql<string>`coalesce(sum(${commissionPayments.amount}), 0)` })
    .from(commissionPayments)
    .where(eq(commissionPayments.agentId, agentId));

  const generatedCents = toCents(generated?.total ?? "0");
  const paidCents = toCents(paid?.total ?? "0");
  return { generatedCents, paidCents, outstandingCents: generatedCents - paidCents };
}

/* ---------------------------------------------------------------------------
   Keeping a commission in step with its sale
   --------------------------------------------------------------------------- */

export async function recalculateCommission(contractId: string) {
  const rows = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const contract = rows[0];
  if (!contract) return;

  /**
   * A commission exists once the apartment is sold, and not before.
   *
   * The office was clear about when an agent has earned something: the
   * apartment is sold when the first installment has been received, and that is
   * the moment the commission becomes real. A contract signed last week with
   * nothing paid against it is not a commission yet, and showing one would put
   * money on the commissions page that nobody owes.
   *
   * So the line follows the apartment's status, which the payments themselves
   * move. When the status goes back, because a payment was recorded in error
   * and removed, the line goes with it, and an extra the office granted by hand
   * is left alone either way.
   */
  const sold = contract.unitId
    ? (
        await db
          .select({ status: units.status })
          .from(units)
          .where(eq(units.id, contract.unitId))
          .limit(1)
      )[0]?.status
    : undefined;

  const earned = sold === "SOLD" || sold === "DELIVERED";

  if (!earned) {
    await db
      .delete(commissions)
      .where(and(eq(commissions.contractId, contractId), eq(commissions.kind, "RATE")));
    return;
  }

  // Only the rate line is maintained here. Extras are the office's own decision
  // and are never touched by a change of price or rate.
  const existing = await db
    .select()
    .from(commissions)
    .where(and(eq(commissions.contractId, contractId), eq(commissions.kind, "RATE")))
    .limit(1);

  if (!contract.agentId) {
    await db
      .delete(commissions)
      .where(and(eq(commissions.contractId, contractId), eq(commissions.kind, "RATE")));
    return;
  }

  const agentRows = await db.select().from(agents).where(eq(agents.id, contract.agentId)).limit(1);

  const rate = Number(contract.commissionRate ?? agentRows[0]?.commissionRate ?? 0);
  const baseCents = toCents(contract.netPrice);
  const amountCents = Math.round((baseCents * rate) / 100);

  await db
    .update(commissions)
    .set({ agentId: contract.agentId })
    .where(and(eq(commissions.contractId, contractId), eq(commissions.kind, "EXTRA")));

  if (existing[0]) {
    await db
      .update(commissions)
      .set({
        agentId: contract.agentId,
        baseAmount: fromCents(baseCents),
        rate: rate.toFixed(3),
        amount: fromCents(amountCents),
        updatedAt: new Date(),
      })
      .where(eq(commissions.id, existing[0].id));
    return;
  }

  await db.insert(commissions).values({
    contractId,
    agentId: contract.agentId,
    kind: "RATE",
    baseAmount: fromCents(baseCents),
    rate: rate.toFixed(3),
    amount: fromCents(amountCents),
  });
}

/**
 * Every contract that names no agent, for the sale recorded by hand.
 *
 * Only the ones nobody has claimed: a sale already credited to somebody is
 * changed on that sale's own line rather than by claiming it again from another
 * agent's page, which would be a quiet way of moving a commission.
 */
export async function salesWithoutAnAgent() {
  const rows = await db
    .select({
      contractId: contracts.id,
      reference: contracts.reference,
      price: contracts.netPrice,
      unitCode: units.code,
      projectName: projects.name,
      clientFirst: clients.firstName,
      clientLast: clients.lastName,
    })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(isNull(contracts.agentId))
    .orderBy(asc(projects.name), asc(units.code))
    .limit(500);

  return rows.map((row) => ({
    contractId: row.contractId,
    label: [
      [row.projectName, row.unitCode].filter(Boolean).join(" "),
      [row.clientFirst, row.clientLast].filter(Boolean).join(" "),
      row.reference,
    ]
      .filter(Boolean)
      .join(" . "),
  }));
}
