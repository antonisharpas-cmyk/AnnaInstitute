import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { many } from "@/lib/filters";
import { toCents } from "@/lib/money";
import { monthsIn, type Range } from "@/lib/reports";

/*
 * The constructors, as one report.
 *
 * What was agreed with each constructor for each development, what has been
 * paid against it, what is waiting to be paid and what is still to come, and
 * every payment with its two papers. The agreements are as they stand today;
 * the period picks the payments, by the day they were paid or are due.
 */

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Row[]);
const run = async (query: SQL): Promise<Row[]> => rowsOf(await db.execute(query));
const cents = (value: unknown) => toCents(value === null || value === undefined ? "0" : String(value));
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export type ConstructorFilter = {
  range: Range;
  /** Developments, or null for all of them. */
  only: string[] | null;
  /** Constructors, comma separated; empty for all of them. */
  builders: string;
};

const narrowed = (filter: ConstructorFilter, alias: string) => {
  const parts: SQL[] = [];
  const ids = filter.only === null ? null : filter.only.length > 0 ? filter.only : [""];
  if (ids !== null) parts.push(sql`${sql.raw(alias)}.project_id in ${ids}`);
  const who = many(filter.builders);
  if (who.length > 0) parts.push(sql`${sql.raw(alias)}.constructor_id in ${who}`);
  return parts.length === 0 ? sql`true` : sql.join(parts, sql` and `);
};

/** The constructors to choose from. */
export async function constructorChoices() {
  const rows = await run(sql`select id, name from constructors order by name`);
  return rows.map((r) => ({ value: str(r.id), label: str(r.name) }));
}

/**
 * Each agreement: one constructor on one development, with what was agreed,
 * what was paid in the period and in all, what is pending, and how many paid
 * payments still miss a paper.
 */
export async function constructorJobs(filter: ConstructorFilter) {
  const { from, to } = filter.range;
  const rows = await run(sql`
    select cp.id, cp.constructor_id, k.name as builder, cp.project_id, p.name as project, cp.agreed_amount,
           (select coalesce(sum(x.amount), 0) from constructor_payments x where x.constructor_project_id = cp.id and x.status = 'PAID') as paid_all,
           (select coalesce(sum(x.amount), 0) from constructor_payments x where x.constructor_project_id = cp.id and x.status = 'PAID'
              and x.paid_on >= ${from} and x.paid_on <= ${to}) as paid_period,
           (select coalesce(sum(x.amount), 0) from constructor_payments x where x.constructor_project_id = cp.id and x.status = 'PENDING') as pending,
           (select count(*)::int from constructor_payments x where x.constructor_project_id = cp.id and x.status = 'PAID' and not x.history
              and (not exists (select 1 from documents d where d.constructor_payment_id = x.id and d.category = 'INVOICE')
                or not exists (select 1 from documents d where d.constructor_payment_id = x.id and d.category = 'RECEIPT'))) as papers_missing
    from constructor_projects cp
    join constructors k on k.id = cp.constructor_id
    join projects p on p.id = cp.project_id
    where ${narrowed(filter, "cp")}
    order by k.name, p.name`);
  return rows.map((r) => {
    const agreed = cents(r.agreed_amount);
    const paid = cents(r.paid_all);
    return {
      id: str(r.id),
      constructorId: str(r.constructor_id),
      builder: str(r.builder),
      projectId: str(r.project_id),
      project: str(r.project),
      agreed,
      paid,
      paidInPeriod: cents(r.paid_period),
      pending: cents(r.pending),
      remaining: Math.max(0, agreed - paid),
      papersMissing: Number(r.papers_missing ?? 0),
    };
  });
}

/** What was paid each month of the period, and what is pending by the day it is set for. */
export async function constructorMonths(filter: ConstructorFilter) {
  const { from, to } = filter.range;
  const rows = await run(sql`
    select x.paid_on as at, x.amount, x.status
    from constructor_payments x
    join constructor_projects cp on cp.id = x.constructor_project_id
    where x.status in ('PAID', 'PENDING') and x.paid_on >= ${from} and x.paid_on <= ${to} and ${narrowed(filter, "cp")}`);
  const months = monthsIn(filter.range);
  const paid = new Map(months.map((m) => [m, 0]));
  const pending = new Map(months.map((m) => [m, 0]));
  for (const r of rows) {
    const at = new Date(str(r.at));
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
    const target = r.status === "PAID" ? paid : pending;
    if (target.has(key)) target.set(key, (target.get(key) ?? 0) + cents(r.amount));
  }
  return months.map((month) => ({ month, paidCents: paid.get(month) ?? 0, pendingCents: pending.get(month) ?? 0 }));
}

/** Every payment of the period, newest first, a page at a time, with its papers. */
export async function constructorPaymentLines(filter: ConstructorFilter, limit: number, offset: number) {
  const { from, to } = filter.range;
  const where = sql`x.paid_on >= ${from} and x.paid_on <= ${to} and ${narrowed(filter, "cp")}`;
  const rows = await run(sql`
    select x.id, x.paid_on, x.kind, x.amount, x.status, x.notes, x.history,
           cp.constructor_id, k.name as builder, p.name as project,
           exists (select 1 from documents d where d.constructor_payment_id = x.id and d.category = 'INVOICE') as has_invoice,
           exists (select 1 from documents d where d.constructor_payment_id = x.id and d.category = 'RECEIPT') as has_receipt
    from constructor_payments x
    join constructor_projects cp on cp.id = x.constructor_project_id
    join constructors k on k.id = cp.constructor_id
    join projects p on p.id = cp.project_id
    where ${where}
    order by x.paid_on desc, x.created_at desc
    limit ${limit} offset ${offset}`);
  const [counted] = await run(sql`
    select count(*)::int as n from constructor_payments x
    join constructor_projects cp on cp.id = x.constructor_project_id
    where ${where}`);
  return {
    total: Number(counted?.n ?? 0),
    rows: rows.map((r) => ({
      id: str(r.id),
      at: new Date(str(r.paid_on)),
      kind: str(r.kind),
      cents: cents(r.amount),
      status: str(r.status),
      history: Boolean(r.history),
      constructorId: str(r.constructor_id),
      builder: str(r.builder),
      project: str(r.project),
      hasInvoice: Boolean(r.has_invoice),
      hasReceipt: Boolean(r.has_receipt),
    })),
  };
}
