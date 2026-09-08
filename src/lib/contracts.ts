import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  clients,
  contracts,
  installments,
  payments,
  projects,
  units,
  vatChanges,
} from "@/db/schema";
import { fromCents, toCents } from "./money";
import {
  buildSchedule,
  effectiveVatRate,
  type InstallmentPlanItem,
  type VatSetup,
} from "./vat";
import { recordAudit } from "./audit";

export type ContractDetail = Awaited<ReturnType<typeof getContract>>;

export async function getContract(id: string) {
  const rows = await db
    .select({
      contract: contracts,
      unit: units,
      project: projects,
      client: clients,
      agent: agents,
    })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(agents, eq(agents.id, contracts.agentId))
    .where(eq(contracts.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const lines = await db
    .select()
    .from(installments)
    .where(eq(installments.contractId, id))
    .orderBy(asc(installments.seq));

  const paid = await db
    .select()
    .from(payments)
    .where(eq(payments.contractId, id))
    .orderBy(desc(payments.paidOn));

  const history = await db
    .select()
    .from(vatChanges)
    .where(eq(vatChanges.contractId, id))
    .orderBy(desc(vatChanges.createdAt));

  const paidByInstallment = new Map<string, number>();
  let paidTotalCents = 0;
  for (const p of paid) {
    const cents = toCents(p.amount);
    paidTotalCents += cents;
    if (p.installmentId) {
      paidByInstallment.set(p.installmentId, (paidByInstallment.get(p.installmentId) ?? 0) + cents);
    }
  }

  const scheduleTotalCents = lines.reduce((a, l) => a + toCents(l.totalAmount), 0);
  const scheduleNetCents = lines.reduce((a, l) => a + toCents(l.netAmount), 0);
  const scheduleVatCents = lines.reduce((a, l) => a + toCents(l.vatAmount), 0);

  return {
    ...row,
    installments: lines.map((l) => ({
      ...l,
      paidCents: paidByInstallment.get(l.id) ?? 0,
      netCents: toCents(l.netAmount),
      vatCents: toCents(l.vatAmount),
      totalCents: toCents(l.totalAmount),
    })),
    payments: paid,
    vatHistory: history,
    totals: {
      netCents: toCents(row.contract.netPrice),
      scheduleNetCents,
      scheduleVatCents,
      scheduleTotalCents,
      paidTotalCents,
      outstandingCents: scheduleTotalCents - paidTotalCents,
    },
    vatSetup: vatSetupOf(row.contract),
  };
}

export function vatSetupOf(contract: {
  netPrice: string;
  vatBaseReduced: string;
  vatRateReduced: string;
  vatBaseStandard: string;
  vatRateStandard: string;
}): VatSetup {
  return {
    netCents: toCents(contract.netPrice),
    reducedBaseCents: toCents(contract.vatBaseReduced),
    reducedRate: Number(contract.vatRateReduced),
    standardBaseCents: toCents(contract.vatBaseStandard),
    standardRate: Number(contract.vatRateStandard),
  };
}

export function vatSummary(setup: VatSetup): string {
  const parts: string[] = [];
  if (setup.reducedBaseCents > 0) parts.push(`${fromCents(setup.reducedBaseCents)} at ${setup.reducedRate}%`);
  if (setup.standardBaseCents > 0) parts.push(`${fromCents(setup.standardBaseCents)} at ${setup.standardRate}%`);
  if (parts.length === 0) parts.push("no VAT");
  return `${parts.join(" plus ")} (blended ${effectiveVatRate(setup).toFixed(3)}%)`;
}

/**
 * Recalculate the schedule of a contract.
 * Installments with a payment recorded against them are locked and untouched.
 */
export async function recalculateSchedule(
  contractId: string,
  actor: { id?: string; email: string },
  reason: string,
) {
  const detail = await getContract(contractId);
  if (!detail) throw new Error("Contract not found");

  const plan: InstallmentPlanItem[] = detail.installments.map((l) => {
    const locked = l.paidCents > 0 || l.status === "PAID" || l.lockedAt !== null;
    return {
      seq: l.seq,
      label: l.label,
      percentage: Number(l.percentage),
      locked,
      lockedNetCents: locked ? l.netCents : undefined,
      lockedVatCents: locked ? l.vatCents : undefined,
      lockedRate: locked ? Number(l.vatRateApplied) : undefined,
    };
  });

  const lines = buildSchedule(detail.vatSetup, plan);
  const openSeqs: number[] = [];

  for (const line of lines) {
    const existing = detail.installments.find((l) => l.seq === line.seq);
    if (!existing || line.locked) continue;
    openSeqs.push(line.seq);
    await db
      .update(installments)
      .set({
        netAmount: fromCents(line.netCents),
        vatAmount: fromCents(line.vatCents),
        totalAmount: fromCents(line.totalCents),
        vatRateApplied: line.rateApplied.toFixed(3),
        updatedAt: new Date(),
      })
      .where(eq(installments.id, existing.id));
  }

  await recordAudit({
    action: reason,
    entity: "contract",
    entityId: contractId,
    detail: `Recalculated installments ${openSeqs.join(", ") || "none"}`,
    userId: actor.id ?? null,
    userEmail: actor.email,
  });

  return { openSeqs, lines };
}

export async function refreshInstallmentStatuses(contractId: string) {
  const rows = await db
    .select({
      id: installments.id,
      total: installments.totalAmount,
      status: installments.status,
      lockedAt: installments.lockedAt,
      paid: sql<string>`coalesce(sum(${payments.amount}), 0)`,
    })
    .from(installments)
    .leftJoin(payments, eq(payments.installmentId, installments.id))
    .where(eq(installments.contractId, contractId))
    .groupBy(installments.id, installments.totalAmount, installments.status, installments.lockedAt);

  for (const row of rows) {
    const paid = toCents(row.paid);
    const total = toCents(row.total);
    const status = paid <= 0 ? "PENDING" : paid >= total ? "PAID" : "PARTIAL";
    const lockedAt = paid > 0 ? (row.lockedAt ?? new Date()) : null;
    if (status !== row.status || (paid > 0) !== (row.lockedAt !== null)) {
      await db.update(installments).set({ status, lockedAt }).where(eq(installments.id, row.id));
    }
  }
}

export async function listContracts() {
  const rows = await db
    .select({
      contract: contracts,
      unit: units,
      project: projects,
      client: clients,
      scheduled: sql<string>`coalesce((select sum(i.total_amount) from installments i where i.contract_id = ${contracts.id}), 0)`,
      paid: sql<string>`coalesce((select sum(p.amount) from payments p where p.contract_id = ${contracts.id}), 0)`,
      nextDue: sql<Date | null>`(select min(i.due_date) from installments i where i.contract_id = ${contracts.id} and i.status <> 'PAID')`,
    })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .orderBy(desc(contracts.createdAt));

  return rows.map((r) => ({
    ...r,
    scheduledCents: toCents(r.scheduled),
    paidCents: toCents(r.paid),
    outstandingCents: toCents(r.scheduled) - toCents(r.paid),
  }));
}

/**
 * Apartments a contract can be written for: anything that does not have one yet.
 *
 * An apartment assigned to a client from the client record is included, with
 * that client's name on it, because assigning comes first and the contract
 * follows. Sold apartments that already have a contract are left out.
 */
export async function unitsWithoutContract() {
  const rows = await db
    .select({
      unit: units,
      project: projects,
      holder: clients,
      contractId: contracts.id,
    })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, units.clientId))
    .leftJoin(contracts, eq(contracts.unitId, units.id))
    .orderBy(asc(projects.name), asc(units.code));

  return rows.filter((r) => r.contractId === null);
}
