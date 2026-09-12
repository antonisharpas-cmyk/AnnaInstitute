import "server-only";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
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
import { toCents } from "./money";

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
