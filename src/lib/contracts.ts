import "server-only";
import { choiceFilter } from "@/lib/choices/filter";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { many } from "@/lib/filters";
import {
  agents,
  clients,
  contracts,
  contractUnits,
  installments,
  payments,
  projects,
  units,
  vatChanges,
} from "@/db/schema";
import { fromCents, toCents } from "./money";
import { buildSchedule, type InstallmentPlanItem, type VatSetup } from "./vat";
import { isSplit, modelOf, vatForNet } from "./vatModel";
import { recordAudit } from "./audit";

export type ContractDetail = Awaited<ReturnType<typeof getContract>>;

export function vatSetupOf(contract: { netPrice: string; vatRate: string }): VatSetup {
  return { netCents: toCents(contract.netPrice), rate: Number(contract.vatRate) };
}

export function vatSummary(setup: VatSetup): string {
  return `${fromCents(setup.netCents)} at ${setup.rate}%`;
}

/**
 * A contract with everything that hangs off it.
 *
 * One contract is one sale: this apartment, this buyer, these installments with
 * their own dates and their own money. Two sales on the same terms are two
 * contracts, which is what copying is for.
 */
async function readContract(id: string) {
  const rows = await db
    .select({
      contract: contracts,
      unit: units,
      project: projects,
      client: clients,
      agent: agents,
    })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(agents, eq(agents.id, contracts.agentId))
    .where(eq(contracts.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [lines, paid, history] = await Promise.all([
    db
      .select()
      .from(installments)
      .where(eq(installments.contractId, id))
      .orderBy(asc(installments.seq)),
    db.select().from(payments).where(eq(payments.contractId, id)).orderBy(desc(payments.paidOn)),
    db
      .select()
      .from(vatChanges)
      .where(eq(vatChanges.contractId, id))
      .orderBy(desc(vatChanges.createdAt)),
  ]);

  const paidByInstallment = new Map<string, number>();
  let paidTotalCents = 0;
  for (const p of paid) {
    const cents = toCents(p.amount);
    paidTotalCents += cents;
    if (p.installmentId) {
      paidByInstallment.set(p.installmentId, (paidByInstallment.get(p.installmentId) ?? 0) + cents);
    }
  }

  const schedule = lines.map((line) => ({
    ...line,
    netCents: toCents(line.netAmount),
    vatCents: toCents(line.vatAmount),
    totalCents: toCents(line.totalAmount),
    paidCents: paidByInstallment.get(line.id) ?? 0,
  }));

  const scheduleNetCents = schedule.reduce((a, l) => a + l.netCents, 0);
  const scheduleVatCents = schedule.reduce((a, l) => a + l.vatCents, 0);
  const scheduleTotalCents = schedule.reduce((a, l) => a + l.totalCents, 0);

  return {
    ...row,
    installments: schedule,
    payments: paid,
    vatHistory: history,
    /** Nothing receipted yet, so the schedule can still be rewritten outright. */
    open: schedule.every((l) => l.paidCents === 0 && l.lockedAt === null),
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

export async function getContract(id: string) {
  const detail = await readContract(id);
  /*
   * After a reduced VAT approval, money paid over on a stage belongs to the
   * next ones. If that step did not happen (it was stopped part way, or the
   * approval ran on an earlier version) it is finished now, once, before the
   * page or the payment form reads what is owed.
   */
  if (detail?.contract.reducedVatApprovedOn) {
    const { creditLeftOver, finishReducedVat } = await import("./reducedVat");
    if (creditLeftOver(detail.contract, detail.installments)) {
      await finishReducedVat(id, null);
      return readContract(id);
    }
  }
  return detail;
}

/**
 * Move a new price or VAT rate onto the schedule. Lines with a receipt against
 * them keep the figures they were invoiced at, for ever.
 */
export async function recalculateSchedule(
  contractId: string,
  actor: { id?: string; email: string },
  reason: string,
) {
  const detail = await getContract(contractId);
  if (!detail) throw new Error("Contract not found");

  /*
   * The open lines share what is left of the price in the proportions they
   * have now, taken from their amounts rather than from the stored
   * percentage. The percentage is kept to four places, which on a price of a
   * few hundred thousand is euros, so saving a contract without touching a
   * figure used to move every open installment a little. Weighed by their own
   * amounts, an unchanged price gives back exactly the amounts that were there.
   */
  const anyOpenAmount = detail.installments.some(
    (l) => !(l.paidCents > 0 || l.lockedAt !== null) && l.netCents > 0,
  );
  const plan: InstallmentPlanItem[] = detail.installments.map((l) => {
    const locked = l.paidCents > 0 || l.lockedAt !== null;
    return {
      seq: l.seq,
      label: l.label,
      labelEl: l.labelEl,
      percentage: anyOpenAmount ? l.netCents : Number(l.percentage),
      dueDate: l.dueDate,
      locked,
      lockedNetCents: locked ? l.netCents : undefined,
      lockedVatCents: locked ? l.vatCents : undefined,
      lockedRate: locked ? Number(l.vatRateApplied) : undefined,
    };
  });

  const built = buildSchedule(detail.vatSetup, plan);

  /* After a reduced VAT approval the open stages carry the two rates, in the
     same split as the rest of the contract, rather than one rate. */
  const model = modelOf(detail.contract);
  if (isSplit(model)) {
    for (const line of built) {
      if (line.locked) continue;
      const { vatCents } = vatForNet(line.netCents, model);
      line.vatCents = vatCents;
      line.totalCents = line.netCents + vatCents;
      line.rateApplied = line.netCents > 0 ? Math.round((vatCents / line.netCents) * 100 * 1000) / 1000 : model.rate;
    }
  }
  const openSeqs: number[] = [];

  for (const line of built) {
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

/**
 * How the contracts list can be ordered.
 *
 * The money columns are worked out from the schedule and the payments rather
 * than stored, so they are ordered by the same subqueries the columns are built
 * from. Outstanding is the one the office actually sorts by: largest first is
 * the list of who to telephone.
 */
export const CONTRACT_ORDER: Record<string, SQL> = {
  reference: sql`${contracts.reference}`,
  client: sql`concat(coalesce(${clients.lastName}, ''), ' ', coalesce(${clients.firstName}, ''))`,
  unit: sql`concat(coalesce((select p.name from projects p where p.id = ${units.projectId}), ''), ' ', coalesce(${units.code}, ''))`,
  price: sql`${contracts.netPrice}`,
  vat: sql`${contracts.vatRate}`,
  plan: sql`(select count(*) from installments i where i.contract_id = ${contracts.id})`,
  total: sql`coalesce((select sum(i.total_amount) from installments i where i.contract_id = ${contracts.id}), 0)`,
  paid: sql`coalesce((select sum(p.amount) from payments p where p.contract_id = ${contracts.id}), 0)`,
  outstanding: sql`coalesce((select sum(i.total_amount) from installments i where i.contract_id = ${contracts.id}), 0) - coalesce((select sum(p.amount) from payments p where p.contract_id = ${contracts.id}), 0)`,
  status: sql`${contracts.status}::text`,
  date: sql`${contracts.contractDate}`,
};

export async function listContracts(options?: {
  query?: string;
  status?: string;
  sort?: string;
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const filters: SQL[] = [];
  const query = options?.query?.trim();
  if (query) {
    filters.push(
      or(
        ilike(contracts.reference, `%${query}%`),
        ilike(clients.firstName, `%${query}%`),
        ilike(clients.lastName, `%${query}%`),
        ilike(units.code, `%${query}%`),
        ilike(projects.name, `%${query}%`),
      ) as SQL,
    );
  }
  const wanted = choiceFilter(contracts.status, contracts.statusChoice, many(options?.status), [
    "DRAFT",
    "ACTIVE",
    "COMPLETED",
    "CANCELLED",
  ]);
  if (wanted) filters.push(wanted);
  const where = filters.length > 0 ? and(...filters) : undefined;

  const chosen = CONTRACT_ORDER[options?.sort ?? ""] ?? null;
  const orderBy = chosen
    ? options?.dir === "desc"
      ? desc(chosen)
      : asc(chosen)
    : desc(contracts.createdAt);

  const selection = {
    contract: contracts,
    unit: units,
    project: projects,
    client: clients,
    installmentCount: sql<number>`(select count(*) from installments i where i.contract_id = ${contracts.id})::int`,
    scheduledCents: sql<string>`coalesce((select sum(i.total_amount) from installments i where i.contract_id = ${contracts.id}), 0)`,
    paid: sql<string>`coalesce((select sum(p.amount) from payments p where p.contract_id = ${contracts.id}), 0)`,
    nextDue: sql<Date | null>`(select min(i.due_date) from installments i where i.contract_id = ${contracts.id} and coalesce((select sum(p.amount) from payments p where p.installment_id = i.id), 0) < i.total_amount)`,
  };

  const rows = await db
    .select(selection)
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(where)
    .orderBy(orderBy)
    .limit(options?.limit ?? 1000)
    .offset(options?.offset ?? 0);

  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(where);

  return {
    total: counted?.total ?? 0,
    rows: rows.map((r) => {
      const scheduled = toCents(r.scheduledCents);
      const paid = toCents(r.paid);
      return {
        ...r,
        scheduledCents: scheduled,
        paidCents: paid,
        outstandingCents: scheduled - paid,
      };
    }),
  };
}

/**
 * Apartments a contract can be written for: anything without one.
 * `keepUnitId` keeps one apartment in the list even though it is taken, for the
 * form that is editing that very contract.
 */
export async function unitsWithoutContract(keepUnitId?: string) {
  const rows = await db
    .select({
      unit: units,
      project: projects,
      holder: clients,
      contractId: contracts.id,
    })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    /* A client in the bin, or one who walked away, holds nothing. */
    .leftJoin(
      clients,
      and(eq(clients.id, units.clientId), isNull(clients.deletedAt), isNull(clients.closedAt)),
    )
    /* A cancelled contract no longer holds its apartment. */
    .leftJoin(contracts, and(eq(contracts.unitId, units.id), ne(contracts.status, "CANCELLED")))
    .orderBy(asc(projects.name), asc(units.code));

  return rows.filter((r) => r.contractId === null || r.unit.id === keepUnitId);
}

/** Every contract, shortest possible form, for a copy list. */
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

export function contractStatusTone(status: string) {
  return status === "COMPLETED"
    ? "good"
    : status === "CANCELLED"
      ? "bad"
      : status === "DRAFT"
        ? "warn"
        : "teal";
}

/**
 * The ids of every contract the current filters match, in the order they show.
 *
 * The side panel walks this, so previous and next move through the filtered set
 * rather than only the page on screen.
 */
export async function contractIdsFor(options?: { query?: string; status?: string }) {
  const { rows } = await listContracts({ ...options, limit: 2000, offset: 0 });
  return rows.map((row) => row.contract.id);
}

/**
 * The apartments allotted to a landowner under a land exchange.
 *
 * Their own lines rather than the contract's single apartment column, because a
 * land exchange is rarely one apartment and they are agreed one at a time.
 */
export async function landExchangeUnits(contractId: string) {
  return db
    .select({ unit: units, project: projects })
    .from(contractUnits)
    .innerJoin(units, eq(units.id, contractUnits.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(contractUnits.contractId, contractId))
    .orderBy(asc(projects.name), asc(units.code));
}

/**
 * Every land exchange this client is the landowner of, with its apartments.
 *
 * The client page reads a buyer's contracts through the apartment on them, so
 * an antiparochi, which names no single apartment, never appeared there at all.
 * The office asked for the opposite: the agreement has to be visible on the
 * owner's own card, as one record, from the day it is signed until the whole
 * thing is finished. So it is fetched on its own terms here.
 */
export async function landExchangesForClient(clientId: string) {
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.clientId, clientId), eq(contracts.kind, "LAND_EXCHANGE")))
    .orderBy(desc(contracts.createdAt));

  return Promise.all(
    rows.map(async (contract) => ({
      contract,
      apartments: await landExchangeUnits(contract.id),
    })),
  );
}

/**
 * Who has this apartment, read from the apartment's own side.
 *
 * The office goes at this from the building: projects, then the apartment, and
 * then they want to know who bought it and on what terms. That is the same
 * information the contract page has, turned around, and it was missing here:
 * the apartment knew only that a contract existed, and named it by its
 * reference, which tells nobody anything.
 *
 * Both routes are followed. A sale names its one apartment on the contract. An
 * antiparochi names its apartments in their own lines, and the owner receiving
 * one of them belongs on that apartment's page just as much as a buyer does.
 */
export async function whoHasThisApartment(unitId: string) {
  const direct = await db
    .select({ contract: contracts, client: clients, agent: agents })
    .from(contracts)
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(agents, eq(agents.id, contracts.agentId))
    .where(eq(contracts.unitId, unitId));

  const shared = await db
    .select({ contract: contracts, client: clients, agent: agents })
    .from(contractUnits)
    .innerJoin(contracts, eq(contracts.id, contractUnits.contractId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(agents, eq(agents.id, contracts.agentId))
    .where(eq(contractUnits.unitId, unitId));

  const seen = new Set<string>();
  const rows = [...direct, ...shared].filter((row) => {
    if (seen.has(row.contract.id)) return false;
    seen.add(row.contract.id);
    return true;
  });

  /* What each one owes and what has come in, so the apartment can say where
     the money stands without anybody opening the contract. */
  return Promise.all(
    rows.map(async (row) => {
      const [owed] = await db
        .select({ due: sql<string>`coalesce(sum(${installments.totalAmount}), 0)` })
        .from(installments)
        .where(eq(installments.contractId, row.contract.id));

      const [got] = await db
        .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(eq(payments.contractId, row.contract.id));

      const dueCents = toCents(owed?.due ?? "0");
      const paidCents = toCents(got?.paid ?? "0");

      return {
        ...row,
        dueCents,
        paidCents,
        outstandingCents: dueCents - paidCents,
        paidInFull: dueCents > 0 && paidCents >= dueCents,
      };
    }),
  );
}

/**
 * The buyer against each apartment, for the development's own list.
 *
 * The apartment list said sold and said nothing about to whom, so the office
 * had to open each one to find out. One query for the page of apartments being
 * drawn, by either route a contract reaches an apartment, and the assigned
 * client as a fallback for an apartment somebody holds without a contract yet.
 */
export async function buyersByUnit(unitIds: string[]) {
  const answer = new Map<
    string,
    { clientId: string; name: string; contractId: string | null; reference: string | null }
  >();
  if (unitIds.length === 0) return answer;

  const direct = await db
    .select({
      unitId: contracts.unitId,
      contractId: contracts.id,
      reference: contracts.reference,
      clientId: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
    })
    .from(contracts)
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    /* A cancelled sale names nobody: the apartment is back on the market. */
    .where(and(inArray(contracts.unitId, unitIds), ne(contracts.status, "CANCELLED")));

  const shared = await db
    .select({
      unitId: contractUnits.unitId,
      contractId: contracts.id,
      reference: contracts.reference,
      clientId: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
    })
    .from(contractUnits)
    .innerJoin(contracts, eq(contracts.id, contractUnits.contractId))
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .where(inArray(contractUnits.unitId, unitIds));

  /* Held without a contract: still the person the office would name. */
  const assigned = await db
    .select({
      unitId: units.id,
      clientId: clients.id,
      firstName: clients.firstName,
      lastName: clients.lastName,
    })
    .from(units)
    .innerJoin(clients, eq(clients.id, units.clientId))
    .where(inArray(units.id, unitIds));

  for (const row of assigned) {
    answer.set(row.unitId, {
      clientId: row.clientId,
      name: `${row.firstName} ${row.lastName}`.trim(),
      contractId: null,
      reference: null,
    });
  }

  /* A contract is better evidence than an assignment, so it writes last. */
  for (const row of [...shared, ...direct]) {
    if (!row.unitId) continue;
    answer.set(row.unitId, {
      clientId: row.clientId,
      name: `${row.firstName} ${row.lastName}`.trim(),
      contractId: row.contractId,
      reference: row.reference,
    });
  }

  return answer;
}
