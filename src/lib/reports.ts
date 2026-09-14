import "server-only";
import { and, asc, desc, eq, gte, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  campaigns,
  clients,
  contracts,
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

/**
 * What the CRM knows, counted.
 *
 * Every figure here is worked out from the records themselves rather than kept
 * in a summary table, so a report can never drift from what the office sees on
 * the page it came from. Money is read in cents and only formatted at the edge.
 */

export type Range = { from: Date; to: Date };

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

/** The months in a range, oldest first, so a chart has no holes in it. */
export function monthsIn(range: Range): string[] {
  const out: string[] = [];
  const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  const last = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
  // A long "all time" range is cut to the last five years, which is as far back
  // as a monthly chart stays readable.
  let guard = 0;
  while (cursor <= last && guard < 60) {
    out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
    guard += 1;
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
export async function salesByMonth(range: Range) {
  const rows = await db
    .select({ contractDate: contracts.contractDate, netPrice: contracts.netPrice })
    .from(contracts)
    .where(
      and(
        isNotNull(contracts.contractDate),
        gte(contracts.contractDate, range.from),
        lte(contracts.contractDate, range.to),
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
export async function salesByProject() {
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
        where cu.project_id = projects.id
      ), 0)`,
    })
    .from(projects)
    .leftJoin(units, eq(units.projectId, projects.id))
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
export async function salesByAgent(range: Range) {
  const rows = await db
    .select({
      agent: agents,
      sales: sql<number>`count(${contracts.id})::int`,
      value: sql<string>`coalesce(sum(${contracts.netPrice}), 0)`,
      generated: sql<string>`coalesce((
        select sum(cm.amount) from commissions cm where cm.agent_id = agents.id
      ), 0)`,
      paid: sql<string>`coalesce((
        select sum(cp.amount) from commission_payments cp where cp.agent_id = agents.id
      ), 0)`,
    })
    .from(agents)
    .leftJoin(
      contracts,
      and(
        eq(contracts.agentId, agents.id),
        gte(contracts.contractDate, range.from),
        lte(contracts.contractDate, range.to),
      ),
    )
    .groupBy(agents.id)
    .orderBy(asc(agents.name));

  return rows.map((row) => ({
    ...row,
    valueCents: toCents(row.value),
    generatedCents: toCents(row.generated),
    paidCents: toCents(row.paid),
    owedCents: toCents(row.generated) - toCents(row.paid),
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
export async function cashByMonth(range: Range) {
  const [dueRows, paidRows] = await Promise.all([
    db
      .select({ dueDate: installments.dueDate, total: installments.totalAmount })
      .from(installments)
      .where(
        and(
          isNotNull(installments.dueDate),
          gte(installments.dueDate, range.from),
          lte(installments.dueDate, range.to),
        ) as SQL,
      ),
    db
      .select({ paidOn: payments.paidOn, amount: payments.amount })
      .from(payments)
      .where(and(gte(payments.paidOn, range.from), lte(payments.paidOn, range.to)) as SQL),
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
export async function ageing() {
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
    .where(isNotNull(installments.dueDate));

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
export async function upcoming(months = 12) {
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
export async function moneyTotals() {
  const [row] = await db
    .select({
      contracted: sql<string>`coalesce((select sum(c.net_price) from contracts c), 0)`,
      scheduledNet: sql<string>`coalesce((select sum(i.net_amount) from installments i), 0)`,
      scheduledVat: sql<string>`coalesce((select sum(i.vat_amount) from installments i), 0)`,
      scheduledTotal: sql<string>`coalesce((select sum(i.total_amount) from installments i), 0)`,
      collected: sql<string>`coalesce((select sum(p.amount) from payments p), 0)`,
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

/** How many enquiries become clients, and how many of those buy. */
export async function leadFunnel(range: Range) {
  const [row] = await db
    .select({
      arrived: sql<number>`count(*)::int`,
      answered: sql<number>`count(*) filter (where ${leads.status} <> 'NEW')::int`,
      qualified: sql<number>`count(*) filter (where ${leads.status} in ('QUALIFIED','CONVERTED'))::int`,
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

export async function costsByMonth(range: Range) {
  const rows = await db
    .select({
      issueDate: expenses.issueDate,
      createdAt: expenses.createdAt,
      total: expenses.totalAmount,
      paid: expenses.paidAmount,
    })
    .from(expenses);

  const months = monthsIn(range);
  const billed = new Map(months.map((m) => [m, 0]));
  const paid = new Map(months.map((m) => [m, 0]));

  for (const row of rows) {
    const key = monthKey(row.issueDate ?? row.createdAt);
    if (!billed.has(key)) continue;
    billed.set(key, (billed.get(key) ?? 0) + toCents(row.total));
    paid.set(key, (paid.get(key) ?? 0) + toCents(row.paid));
  }

  return months.map((month) => ({
    month,
    billedCents: billed.get(month) ?? 0,
    paidCents: paid.get(month) ?? 0,
  }));
}

export async function costsByCategory(range: Range) {
  const rows = await db
    .select({
      category: expenses.category,
      billed: sql<string>`coalesce(sum(${expenses.totalAmount}), 0)`,
      owed: sql<string>`coalesce(sum(${expenses.totalAmount} - ${expenses.paidAmount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(
      and(
        gte(sql`coalesce(${expenses.issueDate}, ${expenses.createdAt})`, range.from),
        lte(sql`coalesce(${expenses.issueDate}, ${expenses.createdAt})`, range.to),
      ) as SQL,
    )
    .groupBy(expenses.category)
    .orderBy(desc(sql`sum(${expenses.totalAmount})`));

  return rows.map((row) => ({
    ...row,
    billedCents: toCents(row.billed),
    owedCents: toCents(row.owed),
  }));
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
      share: projectPartners.sharePercent,
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
    const share = Number(row.share ?? 0) / 100;
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

export async function headline(range: Range) {
  const [sales, money, funnel, [stock], [costs]] = await Promise.all([
    salesByMonth(range),
    moneyTotals(),
    leadFunnel(range),
    db
      .select({
        total: sql<number>`count(*)::int`,
        sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
        available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
        availableValue: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} = 'AVAILABLE'), 0)`,
      })
      .from(units),
    db
      .select({
        owed: sql<string>`coalesce(sum(${expenses.totalAmount} - ${expenses.paidAmount}), 0)`,
      })
      .from(expenses),
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
  };
}
