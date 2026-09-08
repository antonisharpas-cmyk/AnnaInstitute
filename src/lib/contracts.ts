import "server-only";
import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  clients,
  contractUnits,
  contracts,
  installments,
  payments,
  projects,
  units,
  vatChanges,
} from "@/db/schema";
import { fromCents, toCents } from "./money";
import { buildSchedule, type InstallmentPlanItem, type VatSetup } from "./vat";
import { recordAudit } from "./audit";

export type ContractDetail = Awaited<ReturnType<typeof getContract>>;

export function vatSetupOf(contract: { netPrice: string; vatRate: string }): VatSetup {
  return { netCents: toCents(contract.netPrice), rate: Number(contract.vatRate) };
}

export function vatSummary(setup: VatSetup): string {
  return `${fromCents(setup.netCents)} at ${setup.rate}%`;
}

/** The apartments a contract has been put on, with the buyer and the agent. */
export async function assignmentsOf(contractId: string) {
  return db
    .select({
      assignment: contractUnits,
      unit: units,
      project: projects,
      client: clients,
      agent: agents,
    })
    .from(contractUnits)
    .innerJoin(units, eq(units.id, contractUnits.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contractUnits.clientId))
    .leftJoin(agents, eq(agents.id, contractUnits.agentId))
    .where(eq(contractUnits.contractId, contractId))
    .orderBy(asc(projects.name), asc(units.code));
}

/**
 * A contract with everything hanging off it.
 *
 * `plan` is the contract's own schedule, the shape the office reuses. Each
 * apartment on the contract then carries its own copy of that shape in
 * `assignments[].lines`, with its own dates and its own payments, so a buyer who
 * signed six months later sits at his own stage on his own months.
 */
export async function getContract(id: string) {
  const rows = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  const contract = rows[0];
  if (!contract) return null;

  const [lines, assignments, paid, history] = await Promise.all([
    db
      .select()
      .from(installments)
      .where(eq(installments.contractId, id))
      .orderBy(asc(installments.seq)),
    assignmentsOf(id),
    db.select().from(payments).where(eq(payments.contractId, id)).orderBy(desc(payments.paidOn)),
    db
      .select()
      .from(vatChanges)
      .where(eq(vatChanges.contractId, id))
      .orderBy(desc(vatChanges.createdAt)),
  ]);

  const paidByInstallment = new Map<string, number>();
  const paidByAssignment = new Map<string, number>();
  let paidTotalCents = 0;

  for (const p of paid) {
    const cents = toCents(p.amount);
    paidTotalCents += cents;
    if (p.installmentId) {
      paidByInstallment.set(p.installmentId, (paidByInstallment.get(p.installmentId) ?? 0) + cents);
    }
    if (p.assignmentId) {
      paidByAssignment.set(p.assignmentId, (paidByAssignment.get(p.assignmentId) ?? 0) + cents);
    }
  }

  const withMoney = (line: (typeof lines)[number]) => ({
    ...line,
    netCents: toCents(line.netAmount),
    vatCents: toCents(line.vatAmount),
    totalCents: toCents(line.totalAmount),
    paidCents: paidByInstallment.get(line.id) ?? 0,
  });

  const plan = lines.filter((l) => l.assignmentId === null).map(withMoney);

  const planNetCents = plan.reduce((a, l) => a + l.netCents, 0);
  const planVatCents = plan.reduce((a, l) => a + l.vatCents, 0);
  const planTotalCents = plan.reduce((a, l) => a + l.totalCents, 0);

  const withSchedules = assignments.map((a) => {
    const own = lines.filter((l) => l.assignmentId === a.assignment.id).map(withMoney);
    const scheduledCents = own.reduce((sum, l) => sum + l.totalCents, 0);
    const paidHere = paidByAssignment.get(a.assignment.id) ?? 0;
    return {
      ...a,
      lines: own,
      payments: paid.filter((p) => p.assignmentId === a.assignment.id),
      scheduledCents,
      paidCents: paidHere,
      outstandingCents: scheduledCents - paidHere,
      /** Nothing receipted yet, so this apartment's schedule can be rewritten. */
      open: own.every((l) => l.paidCents === 0 && l.lockedAt === null),
    };
  });

  const dueCents = withSchedules.reduce((a, x) => a + x.scheduledCents, 0);

  return {
    contract,
    plan,
    assignments: withSchedules,
    payments: paid,
    vatHistory: history,
    totals: {
      netCents: toCents(contract.netPrice),
      planNetCents,
      planVatCents,
      planTotalCents,
      apartments: assignments.length,
      dueCents,
      paidTotalCents,
      outstandingCents: dueCents - paidTotalCents,
    },
    vatSetup: vatSetupOf(contract),
  };
}

/**
 * Move a new price or VAT rate onto a schedule, whether that is the contract's
 * own plan or one apartment's copy of it. Lines with a receipt against them keep
 * the figures they were invoiced at, for ever.
 */
export async function recalculateOne(
  contractId: string,
  assignmentId: string | null,
  setup: VatSetup,
) {
  const rows = await db
    .select()
    .from(installments)
    .where(
      assignmentId === null
        ? and(eq(installments.contractId, contractId), isNull(installments.assignmentId))
        : eq(installments.assignmentId, assignmentId),
    )
    .orderBy(asc(installments.seq));

  if (rows.length === 0) return { openSeqs: [] as number[] };

  const paidRows = await db
    .select({ installmentId: payments.installmentId, amount: payments.amount })
    .from(payments)
    .where(eq(payments.contractId, contractId));

  const paidByInstallment = new Map<string, number>();
  for (const p of paidRows) {
    if (!p.installmentId) continue;
    paidByInstallment.set(
      p.installmentId,
      (paidByInstallment.get(p.installmentId) ?? 0) + toCents(p.amount),
    );
  }

  const plan: InstallmentPlanItem[] = rows.map((l) => {
    const locked = (paidByInstallment.get(l.id) ?? 0) > 0 || l.lockedAt !== null;
    return {
      seq: l.seq,
      label: l.label,
      labelEl: l.labelEl,
      percentage: Number(l.percentage),
      dueDate: l.dueDate,
      locked,
      lockedNetCents: locked ? toCents(l.netAmount) : undefined,
      lockedVatCents: locked ? toCents(l.vatAmount) : undefined,
      lockedRate: locked ? Number(l.vatRateApplied) : undefined,
    };
  });

  const built = buildSchedule(setup, plan);
  const openSeqs: number[] = [];

  for (const line of built) {
    const existing = rows.find((l) => l.seq === line.seq);
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

  return { openSeqs };
}

/** The plan and every apartment on the contract, after a change of price or VAT. */
export async function recalculateSchedule(
  contractId: string,
  actor: { id?: string; email: string },
  reason: string,
) {
  const rows = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const contract = rows[0];
  if (!contract) throw new Error("Contract not found");
  const setup = vatSetupOf(contract);

  const { openSeqs } = await recalculateOne(contractId, null, setup);

  const assignments = await db
    .select({ id: contractUnits.id })
    .from(contractUnits)
    .where(eq(contractUnits.contractId, contractId));

  for (const assignment of assignments) {
    await recalculateOne(contractId, assignment.id, setup);
  }

  await recordAudit({
    action: reason,
    entity: "contract",
    entityId: contractId,
    detail: `Recalculated the plan and ${assignments.length} apartment schedule(s)`,
    userId: actor.id ?? null,
    userEmail: actor.email,
  });

  return { openSeqs };
}

/** Mark the lines that have a receipt against them, so they stay put. */
export async function lockPaidInstallments(contractId: string) {
  const rows = await db
    .select({
      id: installments.id,
      lockedAt: installments.lockedAt,
      paid: sql<string>`coalesce(sum(${payments.amount}), 0)`,
    })
    .from(installments)
    .leftJoin(payments, eq(payments.installmentId, installments.id))
    .where(eq(installments.contractId, contractId))
    .groupBy(installments.id, installments.lockedAt);

  for (const row of rows) {
    const paid = toCents(row.paid);
    if (paid > 0 && row.lockedAt === null) {
      await db
        .update(installments)
        .set({ lockedAt: new Date() })
        .where(eq(installments.id, row.id));
    }
    if (paid <= 0 && row.lockedAt !== null) {
      await db.update(installments).set({ lockedAt: null }).where(eq(installments.id, row.id));
    }
  }
}

export async function listContracts(options?: {
  query?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const filters: SQL[] = [];
  const query = options?.query?.trim();
  if (query) {
    filters.push(ilike(contracts.reference, `%${query}%`) as SQL);
  }
  const status = options?.status;
  if (
    status === "DRAFT" ||
    status === "ACTIVE" ||
    status === "COMPLETED" ||
    status === "CANCELLED"
  ) {
    filters.push(eq(contracts.status, status));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  // The counts and sums are correlated subqueries. The table is named in full
  // rather than interpolated, because this select has no join for the query
  // builder to qualify the column against.
  const selection = {
    contract: contracts,
    installmentCount: sql<number>`(select count(*) from installments i where i.contract_id = contracts.id)::int`,
    apartments: sql<number>`(select count(*) from contract_units cu where cu.contract_id = contracts.id)::int`,
    // What the apartments on it actually owe: each one has its own schedule.
    dueCents: sql<string>`coalesce((select sum(i.total_amount) from installments i where i.contract_id = contracts.id and i.assignment_id is not null), 0)`,
    paid: sql<string>`coalesce((select sum(p.amount) from payments p where p.contract_id = contracts.id), 0)`,
    // Whose apartments they are, for the list. A contract on several apartments
    // can carry several buyers, so the names are gathered rather than joined.
    buyers: sql<string>`coalesce((
      select string_agg(distinct (c.first_name || ' ' || c.last_name), ', ')
      from contract_units cu
      left join clients c on c.id = cu.client_id
      where cu.contract_id = contracts.id
    ), '')`,
    places: sql<string>`coalesce((
      select string_agg(distinct (pr.name || ' ' || u.code), ', ')
      from contract_units cu
      join units u on u.id = cu.unit_id
      join projects pr on pr.id = u.project_id
      where cu.contract_id = contracts.id
    ), '')`,
  };

  const base = db.select(selection).from(contracts).where(where).orderBy(desc(contracts.createdAt));

  const rows =
    options?.limit != null
      ? await base.limit(options.limit).offset(options.offset ?? 0)
      : await base;

  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contracts)
    .where(where);

  return {
    total: counted?.total ?? 0,
    rows: rows
      .map((r) => {
        const due = toCents(r.dueCents);
        const paid = toCents(r.paid);
        return { ...r, dueCents: due, paidCents: paid, outstandingCents: due - paid };
      })
      // Searching by buyer or apartment as well as by reference, without a
      // second query: the names come back with the row.
      .filter((r) => {
        if (!query) return true;
        const haystack = `${r.contract.reference} ${r.buyers} ${r.places}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      }),
  };
}

/**
 * Apartments a contract can be put on: anything not already on one.
 * `keepUnitId` keeps one apartment in the list even though it is taken, for the
 * form that is editing that very assignment.
 */
export async function unitsWithoutContract(keepUnitId?: string) {
  const rows = await db
    .select({
      unit: units,
      project: projects,
      holder: clients,
      assignmentId: contractUnits.id,
    })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, units.clientId))
    .leftJoin(contractUnits, eq(contractUnits.unitId, units.id))
    .orderBy(asc(projects.name), asc(units.code));

  return rows.filter((r) => r.assignmentId === null || r.unit.id === keepUnitId);
}

/** Every contract, shortest possible form, for the pick lists. */
export async function contractChoices() {
  return db
    .select({
      id: contracts.id,
      reference: contracts.reference,
      netPrice: contracts.netPrice,
      vatRate: contracts.vatRate,
      installmentCount: sql<number>`(select count(*) from installments i where i.contract_id = contracts.id)::int`,
    })
    .from(contracts)
    .orderBy(asc(contracts.reference));
}

/** The assignments of one client, with their contract and apartment. */
export async function assignmentsForClient(clientId: string) {
  return db
    .select({
      assignment: contractUnits,
      contract: contracts,
      unit: units,
      project: projects,
      agent: agents,
    })
    .from(contractUnits)
    .innerJoin(contracts, eq(contracts.id, contractUnits.contractId))
    .innerJoin(units, eq(units.id, contractUnits.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(agents, eq(agents.id, contractUnits.agentId))
    .where(eq(contractUnits.clientId, clientId))
    .orderBy(desc(contractUnits.createdAt));
}

/** Assignments with no buyer recorded, which the office should tidy up. */
export async function assignmentsWithoutClient() {
  return db
    .select({ id: contractUnits.id })
    .from(contractUnits)
    .where(isNull(contractUnits.clientId));
}

export function contractStatusTone(status: string) {
  return status === "COMPLETED"
    ? "good"
    : status === "CANCELLED"
      ? "bad"
      : status === "DRAFT"
        ? "warn"
        : "teal";
}
