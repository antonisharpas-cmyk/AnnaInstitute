import "server-only";
import { and, asc, desc, eq, gte, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  campaigns,
  clients,
  contracts,
  expenseLines,
  expenses,
  installments,
  leads,
  messages,
  payments,
  projectPartners,
  projects,
  subowners,
  units,
} from "@/db/schema";
import { toCents } from "./money";
import { many } from "./filters";
import { holdings, shareForSelection, shareholderChoices, whoFrom, type Who } from "./ownership";

const rowsOf = (result: unknown): Record<string, unknown>[] =>
  Array.isArray(result) ? (result as Record<string, unknown>[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Record<string, unknown>[]);

/**
 * What the CRM knows, counted.
 *
 * Every figure here is worked out from the records themselves rather than kept
 * in a summary table, so a report can never drift from what the office sees on
 * the page it came from. Money is read in cents and only formatted at the edge.
 */

export type Range = { from: Date; to: Date };

/* ---------------------------------------------------------------------------
   Whose money, and which building

   One Eleven does not own every development outright. Some are held with a
   partner company on an agreement particular to that company and that
   building, so "what did we take last year" has no single answer until
   somebody says which deal they mean. That is what a scope is: a development,
   a partner, or both, narrowing every money figure on the page to the money
   that belongs to that pairing.

   It narrows rather than apportions. The office asked for the figures of the
   deal, at their full value, not for a share worked out from a percentage that
   the CRM cannot know is still the agreement.
   --------------------------------------------------------------------------- */

/**
 * Which developments, which companies and which shareholders, several of each.
 *
 * All three travel in the address as comma separated lists, the same as every
 * other filter in the CRM: ?project=a,b&partner=c&holder=oneEleven. A
 * shareholder is "oneEleven" or "holder:" and the name, the name encoded so a
 * comma in it cannot split the list. Nothing chosen is the whole book.
 */
export type Scope = { project: string; partner: string; holder: string };

export function scopeFrom(params: { project?: string; partner?: string; holder?: string }): Scope {
  return {
    project: many(params.project).join(","),
    partner: many(params.partner).join(","),
    holder: many(params.holder).join(","),
  };
}

export const scopeIsOn = (scope: Scope) => Boolean(scope.project || scope.partner || scope.holder);

/** A shareholder as it travels in the address, and back. */
export const holderValue = (value: string) =>
  value.startsWith("holder:") ? `holder:${encodeURIComponent(value.slice(7))}` : value;
export const holdersFrom = (scope: Pick<Scope, "holder">): Who[] =>
  many(scope.holder)
    .map((value) => {
      if (!value.startsWith("holder:")) return whoFrom(value);
      try {
        return whoFrom(`holder:${decodeURIComponent(value.slice(7))}`);
      } catch {
        return whoFrom(value);
      }
    })
    .filter((who): who is Who => who !== null);

/**
 * The developments a scope covers, or null for all of them.
 *
 * Null rather than a list of every id on purpose: "everything" is the ordinary
 * case, and a query that adds no condition at all is both faster and easier to
 * read than one that lists forty ids it is not excluding. A scope that matches
 * nothing returns an empty list, which correctly shows zeroes rather than
 * silently showing the whole book.
 *
 * Several developments are any of them; several companies are the
 * developments any of them holds a share in; several shareholders are the
 * developments any of them owns a part of, directly or through a company (and
 * through the companies chosen, when companies are chosen too). Together it is
 * the developments that are in every answer. Like the companies, a shareholder
 * narrows to whole developments at their full value; the Shareholders report is
 * where a share of the money is worked out.
 */
export async function projectsInScope(scope: Scope): Promise<string[] | null> {
  if (!scopeIsOn(scope)) return null;

  const buildings = many(scope.project);
  const companies = many(scope.partner);
  const parts: SQL[] = [];
  if (buildings.length > 0) parts.push(sql`${projects.id} in ${buildings}` as SQL);
  if (companies.length > 0) {
    /* "ours" is an old address meaning the developments no partner holds a share in. */
    const named = companies.filter((one) => one !== "ours");
    const either: SQL[] = [];
    if (named.length > 0)
      either.push(sql`exists (
            select 1 from project_partners pp
            where pp.project_id = ${projects.id} and pp.subowner_id in ${named}
          )` as SQL);
    if (companies.includes("ours"))
      either.push(sql`not exists (select 1 from project_partners pp where pp.project_id = ${projects.id})` as SQL);
    parts.push(sql`(${sql.join(either, sql` or `)})` as SQL);
  }

  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(...parts));
  const ids = rows.map((row) => row.id);

  const holders = holdersFrom(scope);
  if (holders.length === 0) return ids;
  const named = companies.filter((one) => one !== "ours");
  const owned = new Set(
    (await holdings())
      .filter((holding) => shareForSelection(holding, named, holders).share > 0)
      .map((holding) => holding.projectId),
  );
  return ids.filter((id) => owned.has(id));
}

/** The developments themselves, for the pickers. */
export async function scopeChoices() {
  const [buildings, partners, people] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    db
      .select({ id: subowners.id, name: subowners.name })
      .from(subowners)
      .orderBy(asc(subowners.name)),
    shareholderChoices(),
  ]);
  /* The shareholders carry their value ready for the address. */
  const holders = people.map((one) => ({ value: holderValue(one.value), label: one.label }));
  return { buildings, partners, holders };
}

/*
 * The same narrowing, said once for each table the money lives in.
 *
 * Every one of them returns undefined when the scope is off, which is what
 * and() wants for "no condition", so the caller writes the same line whether
 * the office is looking at one building or at all of them.
 */
const onlyProjects = (ids: string[] | null): SQL | undefined =>
  ids === null ? undefined : (sql`${units.projectId} in ${ids.length > 0 ? ids : [""]}` as SQL);

const contractsIn = (ids: string[] | null): SQL | undefined =>
  ids === null
    ? undefined
    : (sql`${contracts.unitId} in (
        select u.id from units u where u.project_id in ${ids.length > 0 ? ids : [""]}
      )` as SQL);

const installmentsIn = (ids: string[] | null): SQL | undefined =>
  ids === null
    ? undefined
    : (sql`${installments.contractId} in (
        select c.id from contracts c join units u on u.id = c.unit_id
        where u.project_id in ${ids.length > 0 ? ids : [""]}
      )` as SQL);

const paymentsIn = (ids: string[] | null): SQL | undefined =>
  ids === null
    ? undefined
    : (sql`${payments.contractId} in (
        select c.id from contracts c join units u on u.id = c.unit_id
        where u.project_id in ${ids.length > 0 ? ids : [""]}
      )` as SQL);

/* An invoice for several developments counts for each of them, by its lines. */
const expensesIn = (ids: string[] | null): SQL | undefined =>
  ids === null
    ? undefined
    : (sql`(${expenses.projectId} in ${ids.length > 0 ? ids : [""]} or exists (select 1 from expense_lines l where l.expense_id = ${expenses.id} and l.project_id in ${ids.length > 0 ? ids : [""]}))` as SQL);

/**
 * How much of an invoice belongs to the developments asked about: all of it,
 * or, for an invoice split between developments, the share of its lines that
 * are theirs.
 */
const shareIn = (ids: string[] | null): SQL =>
  ids === null
    ? sql`1`
    : sql`(case when exists (select 1 from expense_lines l where l.expense_id = ${expenses.id}) then coalesce((select sum(l.total_amount) from expense_lines l where l.expense_id = ${expenses.id} and l.project_id in ${ids.length > 0 ? ids : [""]}), 0) / nullif(${expenses.totalAmount}, 0) else 1 end)`;

/** A period, named the way the office asks for one. */
export function rangeFrom(params: { period?: string; from?: string; to?: string }): {
  range: Range;
  period: string;
} {
  const period = params.period ?? (params.from || params.to ? "custom" : "12m");
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  if (period === "custom" && (params.from || params.to)) {
    const from = params.from ? new Date(params.from) : new Date(2000, 0, 1);
    const to = params.to ? new Date(`${params.to}T23:59:59`) : end;
    return { range: { from, to }, period: "custom" };
  }

  if (period === "ytd") {
    return { range: { from: new Date(now.getFullYear(), 0, 1), to: end }, period };
  }
  if (period === "24m") {
    return {
      range: { from: new Date(now.getFullYear(), now.getMonth() - 23, 1), to: end },
      period,
    };
  }
  if (period === "all") {
    return { range: { from: new Date(2000, 0, 1), to: end }, period };
  }

  return { range: { from: new Date(now.getFullYear(), now.getMonth() - 11, 1), to: end }, period };
}

/**
 * The months in a range, oldest first.
 *
 * A long "everything" range is kept to its last ten years, counted back from
 * its end, so the months with the data in them are always the ones kept. The
 * charts leave out the months with nothing in them on their own.
 */
export function monthsIn(range: Range): string[] {
  const out: string[] = [];
  const last = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
  const earliest = new Date(last.getFullYear(), last.getMonth() - 119, 1);
  const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  if (cursor < earliest) cursor.setTime(earliest.getTime());
  while (cursor <= last) {
    out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export const monthLabel = (key: string, locale: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
    month: "short",
    year: "2-digit",
  });
};

const monthKey = (value: Date | null) =>
  value
    ? `${new Date(value).getFullYear()}-${String(new Date(value).getMonth() + 1).padStart(2, "0")}`
    : "";

/* ---------------------------------------------------------------------------
   Sales
   --------------------------------------------------------------------------- */

/** Contracts signed month by month, with what they sold for. */
export async function salesByMonth(range: Range, only: string[] | null = null) {
  const rows = await db
    .select({ contractDate: contracts.contractDate, netPrice: contracts.netPrice })
    .from(contracts)
    .where(
      and(
        isNotNull(contracts.contractDate),
        gte(contracts.contractDate, range.from),
        lte(contracts.contractDate, range.to),
        contractsIn(only),
        /* Sales are sales. A land exchange pays the owner in apartments, so it
           is not counted as an apartment sold or as money signed for. */
        eq(contracts.kind, "SALE"),
      ) as SQL,
    );

  const months = monthsIn(range);
  const count = new Map(months.map((m) => [m, 0]));
  const value = new Map(months.map((m) => [m, 0]));

  for (const row of rows) {
    const key = monthKey(row.contractDate);
    if (!count.has(key)) continue;
    count.set(key, (count.get(key) ?? 0) + 1);
    value.set(key, (value.get(key) ?? 0) + toCents(row.netPrice));
  }

  return months.map((month) => ({
    month,
    count: count.get(month) ?? 0,
    valueCents: value.get(month) ?? 0,
  }));
}

/** Every development, how much of it is sold, and at what. */
export async function salesByProject(only: string[] | null = null) {
  const rows = await db
    .select({
      project: projects,
      total: sql<number>`count(${units.id})::int`,
      sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
      reserved: sql<number>`count(*) filter (where ${units.status} = 'RESERVED')::int`,
      available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
      listValue: sql<string>`coalesce(sum(${units.netPrice}), 0)`,
      soldList: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} in ('SOLD','DELIVERED')), 0)`,
      area: sql<string>`coalesce(sum(${units.coveredArea}), 0)`,
      contracted: sql<string>`coalesce((
        select sum(c.net_price) from contracts c
        join units cu on cu.id = c.unit_id
        where cu.project_id = projects.id and c.kind = 'SALE'
      ), 0)`,
    })
    .from(projects)
    .leftJoin(units, eq(units.projectId, projects.id))
    .where(only === null ? undefined : sql`${projects.id} in ${only.length > 0 ? only : [""]}`)
    .groupBy(projects.id)
    .orderBy(asc(projects.name));

  return rows.map((row) => {
    const listCents = toCents(row.listValue);
    const soldListCents = toCents(row.soldList);
    const contractedCents = toCents(row.contracted);
    const area = Number(row.area) || 0;
    return {
      ...row,
      listCents,
      soldListCents,
      contractedCents,
      /** What the sold apartments actually went for against their asking price. */
      differenceCents: contractedCents - soldListCents,
      sellThrough: row.total > 0 ? row.sold / row.total : 0,
      perSquareMetre: area > 0 ? Math.round(listCents / area) : 0,
    };
  });
}

/** What each agent sold in the period, and what it earned them. */
/**
 * Whose expense a commission is.
 *
 * The office's own rule: the agent's commission is borne by the partner company
 * that holds the development, not by One Eleven. So a report narrowed to One
 * Eleven alone shows the sales, and shows no commission against them, because
 * none of it is ours to pay. Narrowed to a partner, or not narrowed at all, the
 * commissions are there as they always were.
 */
export const commissionsAreOurs = (scope: Scope) => scope.partner !== "ours";

export async function salesByAgent(
  range: Range,
  only: string[] | null = null,
  withCommission = true,
) {
  /*
   * The commission follows the same filters as the sales: generated on the day
   * it was generated and paid on the day it was paid, both within the period,
   * and only on sales in the developments chosen.
   */
  const ids = only === null ? null : only.length > 0 ? only : [""];
  const onSale = (alias: string) =>
    ids === null
      ? sql``
      : sql`and ${sql.raw(alias)}.contract_id in (
          select c2.id from contracts c2 join units u2 on u2.id = c2.unit_id where u2.project_id in ${ids}
        )`;
  const rows = await db
    .select({
      agent: agents,
      sales: sql<number>`count(${contracts.id})::int`,
      value: sql<string>`coalesce(sum(${contracts.netPrice}), 0)`,
      generatedTotal: sql<string>`coalesce((
        select sum(cm.total_amount) from commissions cm
        where cm.agent_id = agents.id and cm.status <> 'CANCELLED'
          and cm.created_at >= ${range.from} and cm.created_at <= ${range.to} ${onSale("cm")}
      ), 0)`,
      paidTotal: sql<string>`coalesce((
        select sum(cp.total_amount) from commission_payments cp
        left join commissions pcm on pcm.id = cp.commission_id
        where cp.agent_id = agents.id and cp.paid_on >= ${range.from} and cp.paid_on <= ${range.to} ${onSale("pcm")}
      ), 0)`,
      generated: sql<string>`coalesce((
        select sum(cm.amount) from commissions cm
        where cm.agent_id = agents.id and cm.status <> 'CANCELLED'
          and cm.created_at >= ${range.from} and cm.created_at <= ${range.to} ${onSale("cm")}
      ), 0)`,
      paid: sql<string>`coalesce((
        select sum(cp.amount) from commission_payments cp
        left join commissions pcm on pcm.id = cp.commission_id
        where cp.agent_id = agents.id and cp.paid_on >= ${range.from} and cp.paid_on <= ${range.to} ${onSale("pcm")}
      ), 0)`,
    })
    .from(agents)
    .leftJoin(
      contracts,
      and(
        eq(contracts.agentId, agents.id),
        gte(contracts.contractDate, range.from),
        lte(contracts.contractDate, range.to),
        contractsIn(only),
        eq(contracts.kind, "SALE"),
      ),
    )
    .groupBy(agents.id)
    .orderBy(asc(agents.name));

  return rows.map((row) => ({
    ...row,
    valueCents: toCents(row.value),
    /* Not ours to pay when the page is One Eleven's own books. The sales stay,
       because they are ours; the commission on them is the partner's. */
    generatedCents: withCommission ? toCents(row.generated) : 0,
    paidCents: withCommission ? toCents(row.paid) : 0,
    owedCents: withCommission ? toCents(row.generated) - toCents(row.paid) : 0,
    /* The same three with the agent's VAT on them: what is invoiced, paid and still owed. */
    generatedTotalCents: withCommission ? toCents(row.generatedTotal) : 0,
    paidTotalCents: withCommission ? toCents(row.paidTotal) : 0,
    owedTotalCents: withCommission ? toCents(row.generatedTotal) - toCents(row.paidTotal) : 0,
  }));
}

/* ---------------------------------------------------------------------------
   Money
   --------------------------------------------------------------------------- */

/**
 * What was due and what came in, month by month.
 *
 * Two lines that answer the question the office actually asks: are we collecting
 * what the contracts say we should.
 */
export async function cashByMonth(range: Range, only: string[] | null = null) {
  const [dueRows, paidRows] = await Promise.all([
    db
      .select({ dueDate: installments.dueDate, total: installments.totalAmount })
      .from(installments)
      .where(
        and(
          isNotNull(installments.dueDate),
          gte(installments.dueDate, range.from),
          lte(installments.dueDate, range.to),
          installmentsIn(only),
        ) as SQL,
      ),
    db
      .select({ paidOn: payments.paidOn, amount: payments.amount })
      .from(payments)
      .where(
        and(
          gte(payments.paidOn, range.from),
          lte(payments.paidOn, range.to),
          paymentsIn(only),
        ) as SQL,
      ),
  ]);

  const months = monthsIn(range);
  const due = new Map(months.map((m) => [m, 0]));
  const paid = new Map(months.map((m) => [m, 0]));

  for (const row of dueRows) {
    const key = monthKey(row.dueDate);
    if (due.has(key)) due.set(key, (due.get(key) ?? 0) + toCents(row.total));
  }
  for (const row of paidRows) {
    const key = monthKey(row.paidOn);
    if (paid.has(key)) paid.set(key, (paid.get(key) ?? 0) + toCents(row.amount));
  }

  return months.map((month) => ({
    month,
    dueCents: due.get(month) ?? 0,
    paidCents: paid.get(month) ?? 0,
  }));
}

/** Everything owed on a schedule, by how late it is. */
export async function ageing(only: string[] | null = null) {
  const rows = await db
    .select({
      installment: installments,
      contract: contracts,
      client: clients,
      unit: units,
      project: projects,
      paid: sql<string>`coalesce((
        select sum(p.amount) from payments p where p.installment_id = installments.id
      ), 0)`,
    })
    .from(installments)
    .innerJoin(contracts, eq(contracts.id, installments.contractId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .where(and(isNotNull(installments.dueDate), onlyProjects(only)) as SQL);

  const now = Date.now();
  const buckets = [
    { key: "due", from: -Infinity, to: 0 },
    { key: "d30", from: 0, to: 30 },
    { key: "d60", from: 30, to: 60 },
    { key: "d90", from: 60, to: 90 },
    { key: "older", from: 90, to: Infinity },
  ];

  const totals = new Map(buckets.map((b) => [b.key, { cents: 0, count: 0 }]));
  const lines: {
    id: string;
    label: string;
    client: string;
    where: string;
    dueDate: Date;
    days: number;
    outstandingCents: number;
    bucket: string;
  }[] = [];

  for (const row of rows) {
    const outstanding = toCents(row.installment.totalAmount) - toCents(row.paid);
    if (outstanding <= 0) continue;

    const dueDate = row.installment.dueDate as Date;
    const days = Math.floor((now - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000));
    const bucket = buckets.find((b) => days > b.from && days <= b.to) ?? buckets[0];

    const found = totals.get(bucket.key);
    if (found) {
      found.cents += outstanding;
      found.count += 1;
    }

    if (days > 0) {
      lines.push({
        id: row.installment.id,
        label: row.installment.label,
        client: row.client ? `${row.client.firstName} ${row.client.lastName}` : "",
        where:
          row.project && row.unit ? `${row.project.name} ${row.unit.code}` : row.contract.reference,
        dueDate,
        days,
        outstandingCents: outstanding,
        bucket: bucket.key,
      });
    }
  }

  lines.sort((a, b) => b.days - a.days);

  return {
    buckets: buckets.map((b) => ({
      key: b.key,
      cents: totals.get(b.key)?.cents ?? 0,
      count: totals.get(b.key)?.count ?? 0,
    })),
    overdueCents: buckets
      .filter((b) => b.key !== "due")
      .reduce((a, b) => a + (totals.get(b.key)?.cents ?? 0), 0),
    lines,
  };
}

/** What is coming, month by month, on what has not been paid yet. */
export async function upcoming(months = 12, only: string[] | null = null) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + months, 0, 23, 59, 59);

  const rows = await db
    .select({
      dueDate: installments.dueDate,
      total: installments.totalAmount,
      paid: sql<string>`coalesce((
        select sum(p.amount) from payments p where p.installment_id = installments.id
      ), 0)`,
    })
    .from(installments)
    .where(
      and(
        isNotNull(installments.dueDate),
        gte(installments.dueDate, from),
        lte(installments.dueDate, to),
        installmentsIn(only),
      ) as SQL,
    );

  const keys = monthsIn({ from, to });
  const totals = new Map(keys.map((m) => [m, 0]));

  for (const row of rows) {
    const outstanding = toCents(row.total) - toCents(row.paid);
    if (outstanding <= 0) continue;
    const key = monthKey(row.dueDate);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + outstanding);
  }

  return keys.map((month) => ({ month, cents: totals.get(month) ?? 0 }));
}

/** The whole book: contracted, scheduled, collected, outstanding, VAT. */
export async function moneyTotals(only: string[] | null = null) {
  /*
   * Narrowed to the developments in scope, or to all of them.
   *
   * Written as one condition repeated rather than a join, because each of
   * these is a whole table summed on its own: a join would multiply the
   * installments by the payments and quietly report a figure nobody owes.
   */
  const ids = only === null ? null : only.length > 0 ? only : [""];
  const mine = ids === null ? sql`true` : sql`u.project_id in ${ids}`;
  const scoped =
    ids === null
      ? sql`true`
      : sql`exists (select 1 from units u where u.id = c.unit_id and ${mine})`;

  const [row] = await db
    .select({
      /* Signed for is sales only: a land exchange is valued, not sold. */
      contracted: sql<string>`coalesce((select sum(c.net_price) from contracts c where ${scoped} and c.kind = 'SALE'), 0)`,
      scheduledNet: sql<string>`coalesce((select sum(i.net_amount) from installments i join contracts c on c.id = i.contract_id where ${scoped}), 0)`,
      scheduledVat: sql<string>`coalesce((select sum(i.vat_amount) from installments i join contracts c on c.id = i.contract_id where ${scoped}), 0)`,
      scheduledTotal: sql<string>`coalesce((select sum(i.total_amount) from installments i join contracts c on c.id = i.contract_id where ${scoped}), 0)`,
      collected: sql<string>`coalesce((select sum(p.amount) from payments p join contracts c on c.id = p.contract_id where ${scoped}), 0)`,
      /* The cash part of the sales, agreed and received, kept apart from the VAT book. */
      cashAgreed: sql<string>`coalesce((select sum(c.cash_amount) from contracts c where ${scoped} and c.kind = 'SALE'), 0)`,
      cashReceived: sql<string>`coalesce((select sum(r.amount) from cash_receipts r join contracts c on c.id = r.contract_id where ${scoped}), 0)`,
    })
    .from(contracts)
    .limit(1);

  const scheduledTotal = toCents(row?.scheduledTotal ?? "0");
  const collected = toCents(row?.collected ?? "0");
  const scheduledVat = toCents(row?.scheduledVat ?? "0");

  return {
    contractedCents: toCents(row?.contracted ?? "0"),
    scheduledNetCents: toCents(row?.scheduledNet ?? "0"),
    scheduledVatCents: scheduledVat,
    scheduledTotalCents: scheduledTotal,
    collectedCents: collected,
    outstandingCents: scheduledTotal - collected,
    cashAgreedCents: toCents(row?.cashAgreed ?? "0"),
    cashReceivedCents: toCents(row?.cashReceived ?? "0"),
    /** VAT moves with the money, so the share collected is the share of the book. */
    vatCollectedCents:
      scheduledTotal > 0 ? Math.round((scheduledVat * collected) / scheduledTotal) : 0,
  };
}

/* ---------------------------------------------------------------------------
   Leads
   --------------------------------------------------------------------------- */

export async function leadsByMonth(range: Range) {
  const rows = await db
    .select({ createdAt: leads.createdAt, status: leads.status })
    .from(leads)
    .where(and(gte(leads.createdAt, range.from), lte(leads.createdAt, range.to)) as SQL);

  const months = monthsIn(range);
  const arrived = new Map(months.map((m) => [m, 0]));
  const converted = new Map(months.map((m) => [m, 0]));

  for (const row of rows) {
    const key = monthKey(row.createdAt);
    if (!arrived.has(key)) continue;
    arrived.set(key, (arrived.get(key) ?? 0) + 1);
    if (row.status === "CONVERTED") converted.set(key, (converted.get(key) ?? 0) + 1);
  }

  return months.map((month) => ({
    month,
    arrived: arrived.get(month) ?? 0,
    converted: converted.get(month) ?? 0,
  }));
}

export async function leadsBySource(range: Range) {
  return db
    .select({
      source: leads.sourceKind,
      total: sql<number>`count(*)::int`,
      converted: sql<number>`count(*) filter (where ${leads.status} = 'CONVERTED')::int`,
    })
    .from(leads)
    .where(and(gte(leads.createdAt, range.from), lte(leads.createdAt, range.to)) as SQL)
    .groupBy(leads.sourceKind)
    .orderBy(desc(sql`count(*)`));
}

/** How many leads become clients, and how many of those buy. */
export async function leadFunnel(range: Range) {
  const [row] = await db
    .select({
      arrived: sql<number>`count(*)::int`,
      answered: sql<number>`count(*) filter (where ${leads.status} <> 'NEW')::int`,
      qualified: sql<number>`count(*) filter (where ${leads.status} in ('ACTIVE','CONVERTED'))::int`,
      converted: sql<number>`count(*) filter (where ${leads.status} = 'CONVERTED')::int`,
      bought: sql<number>`count(*) filter (where exists (
        select 1 from contracts c where c.client_id = leads.client_id
      ))::int`,
    })
    .from(leads)
    .where(and(gte(leads.createdAt, range.from), lte(leads.createdAt, range.to)) as SQL);

  return row ?? { arrived: 0, answered: 0, qualified: 0, converted: 0, bought: 0 };
}

/* ---------------------------------------------------------------------------
   Marketing
   --------------------------------------------------------------------------- */

export async function messageTotals(range: Range) {
  const rows = await db
    .select({
      channel: messages.channel,
      status: messages.status,
      total: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(and(gte(messages.createdAt, range.from), lte(messages.createdAt, range.to)) as SQL)
    .groupBy(messages.channel, messages.status);

  return rows;
}

export async function campaignRows(range: Range) {
  return db
    .select({
      campaign: campaigns,
      sent: sql<number>`(
        select count(*)::int from messages m
        where m.campaign_id = campaigns.id and m.status in ('SENT','SIMULATED')
      )`,
      failed: sql<number>`(
        select count(*)::int from messages m
        where m.campaign_id = campaigns.id and m.status in ('FAILED','SUPPRESSED')
      )`,
    })
    .from(campaigns)
    .where(and(gte(campaigns.createdAt, range.from), lte(campaigns.createdAt, range.to)) as SQL)
    .orderBy(desc(campaigns.createdAt))
    .limit(50);
}

/** How many clients can actually be written to. */
export async function consentTotals() {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      consented: sql<number>`count(*) filter (where ${clients.marketingOptIn})::int`,
      unsubscribed: sql<number>`count(*) filter (where ${clients.unsubscribedAt} is not null)::int`,
      withEmail: sql<number>`count(*) filter (where ${clients.email} is not null)::int`,
      withPhone: sql<number>`count(*) filter (where ${clients.phone} is not null)::int`,
    })
    .from(clients);
  return row ?? { total: 0, consented: 0, unsubscribed: 0, withEmail: 0, withPhone: 0 };
}

/* ---------------------------------------------------------------------------
   What the company pays
   --------------------------------------------------------------------------- */

/**
 * The lines of the invoices under Company, one way: IN is what we were billed,
 * OUT is what we charged. Each line counts for its own development and its own
 * category, and what was paid on the invoice is shared over its lines by their
 * amounts.
 */
async function moneyLines(direction: "IN" | "OUT", only: string[] | null, range?: Range) {
  const when = sql`coalesce(${expenses.issueDate}, ${expenses.createdAt})`;
  const rows = await db
    .select({
      when: sql<Date>`${when}`,
      projectId: expenseLines.projectId,
      category: sql<string>`coalesce(${expenseLines.category}, ${expenses.category}::text)`,
      total: expenseLines.totalAmount,
      paidShare: sql<string>`coalesce(round(${expenseLines.totalAmount} * ${expenses.paidAmount} / nullif(${expenses.totalAmount}, 0), 2), 0)`,
    })
    .from(expenseLines)
    .innerJoin(expenses, eq(expenses.id, expenseLines.expenseId))
    .where(
      and(
        eq(expenses.direction, direction),
        only === null ? undefined : (sql`${expenseLines.projectId} in ${only.length > 0 ? only : [""]}` as SQL),
        range ? gte(when, range.from) : undefined,
        range ? lte(when, range.to) : undefined,
      ) as SQL,
    );
  return rows.map((row) => ({
    when: new Date(row.when),
    projectId: row.projectId,
    category: row.category,
    totalCents: toCents(row.total),
    paidCents: toCents(row.paidShare),
  }));
}

/**
 * Cash paid and received outside the invoices, in the period, narrowed to the
 * developments chosen like the invoices are. IN is cash received, OUT is cash paid.
 */
export async function cashEntryLines(range: Range, only: string[] | null) {
  const ids = only === null ? null : only.length > 0 ? only : [""];
  const rows = rowsOf(
    await db.execute(sql`
      select c.direction, c.entry_date as at, c.amount, c.project_id, c.category
      from cash_entries c
      where c.entry_date >= ${range.from} and c.entry_date <= ${range.to}
        ${ids === null ? sql`` : sql`and c.project_id in ${ids}`}`),
  );
  return rows.map((row) => ({
    income: row.direction === "IN",
    when: new Date(String(row.at)),
    projectId: row.project_id ? String(row.project_id) : null,
    category: String(row.category ?? "OTHER"),
    cents: toCents(String(row.amount ?? "0")),
  }));
}

/** Cash received and paid, month by month, for the chart beside the invoices. */
export async function cashEntriesByMonth(range: Range, only: string[] | null) {
  const rows = await cashEntryLines(range, only);
  const months = monthsIn(range);
  const inMap = new Map(months.map((m) => [m, 0]));
  const outMap = new Map(months.map((m) => [m, 0]));
  for (const row of rows) {
    const key = monthKey(row.when);
    const target = row.income ? inMap : outMap;
    if (target.has(key)) target.set(key, (target.get(key) ?? 0) + row.cents);
  }
  return months.map((month) => ({ month, inCents: inMap.get(month) ?? 0, outCents: outMap.get(month) ?? 0 }));
}

/**
 * Every invoice of the period under Company, one line each, newest first: what
 * we charged (income) and what we were billed (expenses), a page at a time.
 *
 * Narrowed to developments, an invoice is in when any of its lines is, and its
 * figures are the part of it that belongs to those developments, the same rule
 * as the rest of the report.
 */
export async function incomeExpenseLines(range: Range, only: string[] | null, limit: number, offset: number) {
  const ids = only === null ? null : only.length > 0 ? only : [""];
  const when = sql`coalesce(e.issue_date, e.created_at)`;
  const share =
    ids === null
      ? sql`e.total_amount`
      : sql`(select coalesce(sum(l.total_amount), 0) from expense_lines l where l.expense_id = e.id and l.project_id in ${ids})`;
  /* The VAT on the same part of the invoice. */
  const vatShare =
    ids === null
      ? sql`e.vat_amount`
      : sql`(select coalesce(sum(l.vat_amount), 0) from expense_lines l where l.expense_id = e.id and l.project_id in ${ids})`;
  const where = sql`${when} >= ${range.from} and ${when} <= ${range.to}
    ${ids === null ? sql`` : sql`and exists (select 1 from expense_lines l where l.expense_id = e.id and l.project_id in ${ids})`}`;
  /* Cash paid and received outside the invoices, in the same list: no number, no VAT, paid in full. */
  const cashWhere = sql`c.entry_date >= ${range.from} and c.entry_date <= ${range.to}
    ${ids === null ? sql`` : sql`and c.project_id in ${ids}`}`;
  const both = sql`
    select 'invoice' as kind, e.id, (e.direction = 'OUT') as income, e.supplier as who, e.status, e.category::text as category, e.category_other,
           ${when} as at, e.created_at, e.total_amount, e.paid_amount, ${share} as in_scope, ${vatShare} as vat_in_scope, e.vat_rate,
           (select d.number from issued_documents d where d.id = e.issued_document_id) as our_number, e.reference,
           (select string_agg(distinct p.name, ', ') from expense_lines l join projects p on p.id = l.project_id where l.expense_id = e.id) as developments
    from expenses e
    where ${where}
    union all
    select 'cash' as kind, c.id, (c.direction = 'IN') as income, c.party as who, 'PAID' as status, c.category, c.category_other,
           c.entry_date as at, c.created_at, c.amount as total_amount, c.amount as paid_amount, c.amount as in_scope, 0::numeric as vat_in_scope, null::numeric as vat_rate,
           null as our_number, null as reference,
           (select p.name from projects p where p.id = c.project_id) as developments
    from cash_entries c
    where ${cashWhere}`;
  const rows = rowsOf(
    await db.execute(sql`
      select * from (${both}) as everything
      order by at desc, created_at desc
      limit ${limit} offset ${offset}`),
  );
  const [counted] = rowsOf(
    await db.execute(sql`select
      (select count(*) from expenses e where ${where}) + (select count(*) from cash_entries c where ${cashWhere}) as n`),
  );
  return {
    total: Number(counted?.n ?? 0),
    rows: rows.map((r) => {
      const totalCents = toCents(String(r.total_amount ?? "0"));
      const inScopeCents = toCents(String(r.in_scope ?? "0"));
      const paidCents = toCents(String(r.paid_amount ?? "0"));
      /* The paid part, in the same share as the total. */
      const paidInScope = totalCents > 0 ? Math.round((paidCents * inScopeCents) / totalCents) : 0;
      return {
        id: String(r.id),
        /* An invoice under Company, or cash recorded outside the invoices. */
        cash: r.kind === "cash",
        income: r.income === true || r.income === "t",
        at: new Date(String(r.at)),
        who: String(r.who ?? ""),
        number: String(r.our_number ?? r.reference ?? ""),
        category: String(r.category ?? "OTHER"),
        categoryOther: r.category_other ? String(r.category_other) : "",
        status: String(r.status ?? ""),
        developments: String(r.developments ?? ""),
        totalCents: inScopeCents,
        vatCents: toCents(String(r.vat_in_scope ?? "0")),
        netCents: inScopeCents - toCents(String(r.vat_in_scope ?? "0")),
        /* One rate for the whole invoice, or none when its lines differ. */
        vatRate: r.vat_rate === null || r.vat_rate === undefined ? null : Number(r.vat_rate),
        paidCents: paidInScope,
        owedCents: Math.max(0, inScopeCents - paidInScope),
      };
    }),
  };
}

/** By month: billed and paid. IN for what the company pays, OUT for what it charges. */
export async function costsByMonth(range: Range, only: string[] | null = null, direction: "IN" | "OUT" = "IN") {
  const rows = await moneyLines(direction, only);
  const months = monthsIn(range);
  const billed = new Map(months.map((m) => [m, 0]));
  const paid = new Map(months.map((m) => [m, 0]));
  for (const row of rows) {
    const key = monthKey(row.when);
    if (!billed.has(key)) continue;
    billed.set(key, (billed.get(key) ?? 0) + row.totalCents);
    paid.set(key, (paid.get(key) ?? 0) + row.paidCents);
  }
  return months.map((month) => ({
    month,
    billedCents: billed.get(month) ?? 0,
    paidCents: paid.get(month) ?? 0,
  }));
}

/** By category, each line by its own: billed and still owed. */
export async function costsByCategory(range: Range, only: string[] | null = null, direction: "IN" | "OUT" = "IN") {
  const rows = await moneyLines(direction, only, range);
  const by = new Map<string, { category: string; billedCents: number; owedCents: number; count: number }>();
  for (const row of rows) {
    const one = by.get(row.category) ?? { category: row.category, billedCents: 0, owedCents: 0, count: 0 };
    one.billedCents += row.totalCents;
    one.owedCents += row.totalCents - row.paidCents;
    one.count += 1;
    by.set(row.category, one);
  }
  return [...by.values()].sort((a, b) => b.billedCents - a.billedCents);
}

/** By development: what was charged, what was billed to us, and the difference. */
export async function incomeAndCostsByProject(range: Range, only: string[] | null = null) {
  const [income, costs, cash, names] = await Promise.all([
    moneyLines("OUT", only, range),
    moneyLines("IN", only, range),
    cashEntryLines(range, only),
    db.select({ id: projects.id, name: projects.name }).from(projects),
  ]);
  type Row = { projectId: string; name: string; incomeCents: number; costCents: number; cashInCents: number; cashOutCents: number };
  const by = new Map<string, Row>();
  const add = (projectId: string | null, field: "incomeCents" | "costCents" | "cashInCents" | "cashOutCents", cents: number) => {
    const key = projectId ?? "";
    const one = by.get(key) ?? {
      projectId: key,
      name: names.find((p) => p.id === projectId)?.name ?? "",
      incomeCents: 0,
      costCents: 0,
      cashInCents: 0,
      cashOutCents: 0,
    };
    one[field] += cents;
    by.set(key, one);
  };
  for (const row of income) add(row.projectId, "incomeCents", row.totalCents);
  for (const row of costs) add(row.projectId, "costCents", row.totalCents);
  /* Cash beside the invoices, in its own columns. */
  for (const row of cash) add(row.projectId, row.income ? "cashInCents" : "cashOutCents", row.cents);
  return [...by.values()].sort((a, b) => (a.projectId === "" ? 1 : b.projectId === "" ? -1 : a.name.localeCompare(b.name)));
}

/* ---------------------------------------------------------------------------
   Partners
   --------------------------------------------------------------------------- */

/** What each partner's share is worth across the developments they hold. */
export async function partnerPortfolio() {
  const rows = await db
    .select({
      subowner: subowners,
      project: projects,
      listValue: sql<string>`coalesce((
        select sum(u.net_price) from units u where u.project_id = projects.id
      ), 0)`,
      soldValue: sql<string>`coalesce((
        select sum(u.net_price) from units u
        where u.project_id = projects.id and u.status in ('SOLD','DELIVERED')
      ), 0)`,
    })
    .from(projectPartners)
    .innerJoin(subowners, eq(subowners.id, projectPartners.subownerId))
    .innerJoin(projects, eq(projects.id, projectPartners.projectId))
    .orderBy(asc(subowners.name));

  const byPartner = new Map<
    string,
    {
      name: string;
      id: string;
      projects: number;
      listCents: number;
      soldCents: number;
      shareCents: number;
    }
  >();

  for (const row of rows) {
    /* A company holds the whole of the development it is on. */
    const share = 1;
    const listCents = toCents(row.listValue);
    const soldCents = toCents(row.soldValue);
    const found = byPartner.get(row.subowner.id) ?? {
      id: row.subowner.id,
      name: row.subowner.name,
      projects: 0,
      listCents: 0,
      soldCents: 0,
      shareCents: 0,
    };
    found.projects += 1;
    found.listCents += listCents;
    found.soldCents += soldCents;
    found.shareCents += Math.round(listCents * share);
    byPartner.set(row.subowner.id, found);
  }

  return [...byPartner.values()].sort((a, b) => b.shareCents - a.shareCents);
}

/* ---------------------------------------------------------------------------
   The headline figures, for the front of the section
   --------------------------------------------------------------------------- */

export async function headline(range: Range, only: string[] | null = null) {
  const [sales, money, funnel, [stock], [costs]] = await Promise.all([
    salesByMonth(range, only),
    moneyTotals(only),
    leadFunnel(range),
    db
      .select({
        total: sql<number>`count(*)::int`,
        sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
        available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
        availableValue: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} = 'AVAILABLE'), 0)`,
      })
      .from(units)
      .where(onlyProjects(only)),
    db
      .select({
        owed: sql<string>`coalesce(round(sum((${expenses.totalAmount} - ${expenses.paidAmount}) * ${shareIn(only)}) filter (where ${expenses.direction} = 'IN'), 2), 0)`,
        owedToUs: sql<string>`coalesce(round(sum((${expenses.totalAmount} - ${expenses.paidAmount}) * ${shareIn(only)}) filter (where ${expenses.direction} = 'OUT'), 2), 0)`,
      })
      .from(expenses)
      .where(expensesIn(only)),
  ]);

  return {
    salesCount: sales.reduce((a, r) => a + r.count, 0),
    salesValueCents: sales.reduce((a, r) => a + r.valueCents, 0),
    money,
    funnel,
    stock: {
      total: stock?.total ?? 0,
      sold: stock?.sold ?? 0,
      available: stock?.available ?? 0,
      availableValueCents: toCents(stock?.availableValue ?? "0"),
    },
    costsOwedCents: toCents(costs?.owed ?? "0"),
    incomeOwedCents: toCents(costs?.owedToUs ?? "0"),
  };
}
