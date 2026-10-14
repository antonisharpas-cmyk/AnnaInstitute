import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { toCents } from "@/lib/money";

/*
 * The year, a month a row.
 *
 * One table the office reads across: how many people came in, how many
 * contracts were made and how far they got, and where the money went. Every
 * figure is counted in the month it happened in, so a row never changes once
 * the month is over, with one exception that says so: the cash still to come
 * is what was owed in cash at the end of that month.
 *
 * Narrowed to a development or a partnership, everything that belongs to a
 * contract follows the narrowing, and so do the company invoices and the
 * constructor's payments for those developments. Leads and clients belong to
 * nobody's building yet, so they are always the whole office.
 */

export const MONTHLY_COLUMNS = [
  "leads",
  "clients",
  "contracts",
  "reserved",
  "sold",
  "delivered",
  "paidNet",
  "cashIn",
  "cashOwed",
  "commissionMade",
  "commissionPaid",
  "incomePaid",
  "expensePaid",
] as const;

export type MonthlyColumn = (typeof MONTHLY_COLUMNS)[number];

/** The columns that hold money, in cents; the rest are counts. */
export const MONEY_COLUMNS: MonthlyColumn[] = [
  "paidNet",
  "cashIn",
  "cashOwed",
  "commissionMade",
  "commissionPaid",
  "incomePaid",
  "expensePaid",
];

export type MonthlyRow = { month: number; future: boolean } & Record<MonthlyColumn, number>;

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Row[]);
const run = async (query: SQL): Promise<Row[]> => rowsOf(await db.execute(query));

/** The years worth offering: from the first record the office has to this one. */
export async function monthlyYears(): Promise<number[]> {
  const now = new Date().getFullYear();
  let first = now;
  try {
    const [row] = await run(sql`
      select least(
        (select min(created_at) from leads),
        (select min(coalesce(contract_date, created_at)) from contracts),
        (select min(paid_on) from payments),
        (select min(paid_on) from expense_payments)
      ) as first`);
    if (row?.first) first = Math.min(now, new Date(row.first as string).getFullYear());
  } catch {
    /* An older database without one of the tables: this year alone. */
  }
  const out: number[] = [];
  for (let year = now; year >= Math.max(first, now - 10); year -= 1) out.push(year);
  return out;
}

export async function monthlyTable(year: number, only: string[] | null): Promise<{ rows: MonthlyRow[]; total: MonthlyRow }> {
  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);
  const ids = only === null ? null : only.length > 0 ? only : [""];

  /* A contract in the narrowing: its apartment is in one of the developments. */
  const contractIn = (column: string) =>
    ids === null
      ? sql`true`
      : sql`${sql.raw(column)} in (select c2.id from contracts c2 join units u2 on u2.id = c2.unit_id where u2.project_id in ${ids})`;

  /* The part of a company invoice that belongs to the narrowing, as a fraction. */
  const shareOf = (alias: string) => {
    const e = sql.raw(alias);
    return ids === null
      ? sql`1`
      : sql`(case when exists (select 1 from expense_lines l where l.expense_id = ${e}.id)
          then coalesce((select sum(l.total_amount) from expense_lines l where l.expense_id = ${e}.id and l.project_id in ${ids}), 0) / nullif(${e}.total_amount, 0)
          else (case when ${e}.project_id in ${ids} then 1 else 0 end) end)`;
  };

  const [
    leadRows,
    clientRows,
    contractRows,
    deliveredRows,
    paymentRows,
    cashRows,
    cashOwedRows,
    madeRows,
    paidAgentRows,
    companyRows,
    constructorRows,
  ] = await Promise.all([
    run(sql`select created_at as at from leads where deleted_at is null and created_at >= ${from} and created_at < ${to}`),
    run(sql`select created_at as at from clients where deleted_at is null and created_at >= ${from} and created_at < ${to}`),
    /* Every contract that stands, with the three days that move it on. */
    run(sql`
      select coalesce(c.contract_date, c.created_at) as made,
             (select min(pm.paid_on) from payments pm where pm.contract_id = c.id and pm.kind = 'PAYMENT' and pm.amount > 0) as first_paid,
             (select min(sp.signed_at) from signing_papers sp where sp.contract_id = c.id and sp.signed_at is not null) as first_signed
      from contracts c
      where c.status <> 'CANCELLED' and ${contractIn("c.id")}`),
    run(sql`
      select coalesce(u.status_by_hand_at, u.updated_at) as at from units u
      where u.status = 'DELIVERED' ${ids === null ? sql`` : sql`and u.project_id in ${ids}`}`),
    /* Money from buyers, before VAT: each payment at the share of its stage that is not VAT. */
    run(sql`
      select pm.paid_on as at,
             pm.amount * coalesce(i.net_amount / nullif(i.total_amount, 0), 100 / (100 + c.vat_rate)) as net
      from payments pm
      join contracts c on c.id = pm.contract_id
      left join installments i on i.id = pm.installment_id
      where pm.kind = 'PAYMENT' and pm.paid_on >= ${from} and pm.paid_on < ${to} and ${contractIn("pm.contract_id")}`),
    run(sql`
      select cr.received_on as at, cr.amount from cash_receipts cr
      where cr.received_on >= ${from} and cr.received_on < ${to} and ${contractIn("cr.contract_id")}`),
    /* For the cash still to come: what was agreed in cash, and every bit of it received, ever. */
    run(sql`
      select 'agreed' as what, coalesce(c.contract_date, c.created_at) as at, c.cash_amount as amount
      from contracts c
      where c.status <> 'CANCELLED' and c.kind = 'SALE' and coalesce(c.cash_amount, 0) > 0 and ${contractIn("c.id")}
      union all
      select 'received', cr.received_on, cr.amount
      from cash_receipts cr join contracts c on c.id = cr.contract_id
      where c.status <> 'CANCELLED' and c.kind = 'SALE' and ${contractIn("c.id")}`),
    run(sql`
      select cm.created_at as at, cm.amount from commissions cm
      where cm.status <> 'CANCELLED' and cm.created_at >= ${from} and cm.created_at < ${to} and ${contractIn("cm.contract_id")}`),
    run(sql`
      select cp.paid_on as at, cp.amount from commission_payments cp
      left join commissions cm on cm.id = cp.commission_id
      where cp.paid_on >= ${from} and cp.paid_on < ${to}
        ${ids === null ? sql`` : sql`and ${contractIn("cm.contract_id")}`}`),
    run(sql`
      select ep.paid_on as at, e.direction, ep.amount * ${shareOf("e")} as amount
      from expense_payments ep join expenses e on e.id = ep.expense_id
      where ep.paid_on >= ${from} and ep.paid_on < ${to}`),
    run(sql`
      select cpay.paid_on as at, cpay.amount from constructor_payments cpay
      join constructor_projects cp on cp.id = cpay.constructor_project_id
      where cpay.status = 'PAID' and cpay.paid_on >= ${from} and cpay.paid_on < ${to}
        ${ids === null ? sql`` : sql`and cp.project_id in ${ids}`}`),
  ]);

  const now = new Date();
  const rows: MonthlyRow[] = Array.from({ length: 12 }, (_, month) => {
    const row = { month, future: new Date(year, month, 1) > now } as MonthlyRow;
    for (const column of MONTHLY_COLUMNS) row[column] = 0;
    return row;
  });

  const monthOf = (value: unknown): number | null => {
    if (!value) return null;
    const at = new Date(value as string);
    if (at < from || at >= to) return null;
    return at.getMonth();
  };
  const add = (column: MonthlyColumn, at: unknown, amount = 1) => {
    const month = monthOf(at);
    if (month !== null) rows[month][column] += amount;
  };
  const cents = (value: unknown) => toCents(value === null || value === undefined ? "0" : String(value));

  for (const r of leadRows) add("leads", r.at);
  for (const r of clientRows) add("clients", r.at);
  for (const r of contractRows) {
    add("contracts", r.made);
    /* Reserved on the first signed paper; a contract from before the papers were kept, on its first money. */
    add("reserved", r.first_signed ?? r.first_paid);
    /* Sold on the first money received, which is the CRM's own rule for the apartment. */
    add("sold", r.first_paid);
  }
  for (const r of deliveredRows) add("delivered", r.at);
  for (const r of paymentRows) add("paidNet", r.at, cents(r.net));
  for (const r of cashRows) add("cashIn", r.at, cents(r.amount));
  for (const r of madeRows) add("commissionMade", r.at, cents(r.amount));
  for (const r of paidAgentRows) add("commissionPaid", r.at, cents(r.amount));
  for (const r of companyRows) add(r.direction === "OUT" ? "incomePaid" : "expensePaid", r.at, cents(r.amount));
  for (const r of constructorRows) add("expensePaid", r.at, cents(r.amount));

  /* The cash still to come at the end of each month gone by. */
  for (const row of rows) {
    if (row.future) continue;
    const end = new Date(year, row.month + 1, 1);
    let owed = 0;
    for (const r of cashOwedRows) {
      if (!r.at || new Date(r.at as string) >= end) continue;
      owed += r.what === "agreed" ? cents(r.amount) : -cents(r.amount);
    }
    row.cashOwed = owed;
  }

  const total = { month: -1, future: false } as MonthlyRow;
  for (const column of MONTHLY_COLUMNS) {
    total[column] = column === "cashOwed" ? 0 : rows.reduce((sum, row) => sum + row[column], 0);
  }
  /* A balance does not add up across months: the total is where it stands at the last month gone by. */
  const last = [...rows].reverse().find((row) => !row.future);
  total.cashOwed = last ? last.cashOwed : 0;

  return { rows, total };
}
