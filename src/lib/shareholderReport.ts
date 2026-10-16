import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { toCents } from "@/lib/money";
import { holdings, shareForSelection, type Who } from "@/lib/ownership";
import type { Range } from "@/lib/reports";

/*
 * Shareholders and companies: the money of every development, and the part of
 * it that belongs to the companies and shareholders chosen.
 *
 * Every figure is money that moved, on the day it moved, VAT included, so the
 * columns add up to what is left: the Net Revenue.
 *
 *   in   money received from buyers, cash received from buyers, other income
 *        received on our invoices, other cash received
 *   out  VAT credited back to buyers, refunds, delay penalties, payments to the
 *        constructor, commissions paid to agents, expenses paid, other cash paid
 *
 * VAT. Buyers' payments, invoices under Company and the money paid back to
 * buyers are recorded as the money itself, VAT included. A payment to an
 * agent or a constructor is recorded before VAT with its own rate, and the
 * report takes it with that VAT on it: the money that actually went out.
 * Cash carries no VAT.
 *
 * A fee one of our companies charged the company that holds a development is,
 * for that development, money going out, so it counts as an expense there and
 * not as income.
 */

export const LEDGER_COLUMNS = [
  "received",
  "cash",
  "credits",
  "refunds",
  "penalties",
  "constructors",
  "commissions",
  "income",
  "expenses",
  "cashIncome",
  "cashExpenses",
] as const;

export type LedgerColumn = (typeof LEDGER_COLUMNS)[number];
export type Ledger = Record<LedgerColumn, number>;

/** Which way each column counts: money in is positive, money out negative. */
export const LEDGER_SIGN: Record<LedgerColumn, 1 | -1> = {
  received: 1,
  cash: 1,
  credits: -1,
  refunds: -1,
  penalties: -1,
  constructors: -1,
  commissions: -1,
  income: 1,
  expenses: -1,
  cashIncome: 1,
  cashExpenses: -1,
};

const empty = (): Ledger => Object.fromEntries(LEDGER_COLUMNS.map((one) => [one, 0])) as Ledger;
export const netOf = (ledger: Ledger) => LEDGER_COLUMNS.reduce((sum, one) => sum + ledger[one], 0);

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Row[]);
const run = async (query: SQL): Promise<Row[]> => rowsOf(await db.execute(query));

type Movement = { projectId: string; at: Date; column: LedgerColumn; cents: number };

/** Every movement of money in the period, by development, with its sign. */
async function movements(range: Range): Promise<Movement[]> {
  const { from, to } = range;
  const between = (column: string) => sql`${sql.raw(column)} >= ${from} and ${sql.raw(column)} <= ${to}`;
  const [buyers, cash, back, builders, agents, company, loose] = await Promise.all([
    run(sql`
      select u.project_id, pm.paid_on as at, pm.amount
      from payments pm join contracts c on c.id = pm.contract_id join units u on u.id = c.unit_id
      where pm.kind = 'PAYMENT' and ${between("pm.paid_on")}`),
    run(sql`
      select u.project_id, r.received_on as at, r.amount
      from cash_receipts r join contracts c on c.id = r.contract_id join units u on u.id = c.unit_id
      where ${between("r.received_on")}`),
    run(sql`
      select u.project_id, r.paid_on as at, r.amount, r.purpose
      from refunds r join contracts c on c.id = r.contract_id join units u on u.id = c.unit_id
      where ${between("r.paid_on")}`),
    run(sql`
      select cp.project_id, x.paid_on as at, x.total_amount as amount
      from constructor_payments x join constructor_projects cp on cp.id = x.constructor_project_id
      where x.status = 'PAID' and ${between("x.paid_on")}`),
    run(sql`
      select u.project_id, p.paid_on as at, p.total_amount as amount
      from commission_payments p
      join commissions cm on cm.id = p.commission_id
      join contracts c on c.id = cm.contract_id
      join units u on u.id = c.unit_id
      where ${between("p.paid_on")}`),
    /* Money in and out on invoices under Company, each payment split over the invoice's lines by their share. */
    run(sql`
      select coalesce(l.project_id, e.project_id) as project_id, ep.paid_on as at,
             ep.amount * coalesce(l.total_amount / nullif(e.total_amount, 0), 1) as amount,
             case when e.direction = 'IN'
                    or (e.party_kind = 'COMPANY' and e.party_id in (
                          select pp.subowner_id from project_partners pp where pp.project_id = coalesce(l.project_id, e.project_id)))
                  then 'expenses' else 'income' end as col
      from expense_payments ep
      join expenses e on e.id = ep.expense_id
      left join expense_lines l on l.expense_id = e.id
      where coalesce(l.project_id, e.project_id) is not null and ${between("ep.paid_on")}`),
    /* Cash paid and received outside the invoices, for a development. */
    run(sql`
      select c.project_id, c.entry_date as at, c.amount, c.direction
      from cash_entries c
      where c.project_id is not null and ${between("c.entry_date")}`),
  ]);

  const out: Movement[] = [];
  const add = (rows: Row[], column: (row: Row) => LedgerColumn | null) => {
    for (const row of rows) {
      const which = column(row);
      if (!which || !row.project_id) continue;
      const cents = toCents(String(row.amount ?? "0"));
      out.push({ projectId: String(row.project_id), at: new Date(String(row.at)), column: which, cents: LEDGER_SIGN[which] * Math.abs(cents) });
    }
  };
  add(buyers, () => "received");
  add(cash, () => "cash");
  add(back, (row) => (row.purpose === "VAT_CHANGE" ? "credits" : row.purpose === "PENALTY" ? "penalties" : "refunds"));
  add(builders, () => "constructors");
  add(agents, () => "commissions");
  add(company, (row) => (row.col === "expenses" ? "expenses" : "income"));
  add(loose, (row) => (row.direction === "IN" ? "cashIncome" : "cashExpenses"));
  return out;
}

export type ShareRow = {
  projectId: string;
  projectName: string;
  share: number;
  commissionShare: number;
  via: { via: string | null; companyShare: number; holderShare: number; share: number }[];
  full: Ledger;
  part: Ledger;
};

export type MonthRow = { key: string; year: number; month: number; part: Ledger };

export async function shareholderReport(range: Range, companyIds: string[], holders: Who[]) {
  const [held, moved] = await Promise.all([holdings(), movements(range)]);

  const rows: ShareRow[] = [];
  const shareBy = new Map<string, { share: number; commissionShare: number }>();
  for (const holding of held) {
    const of = shareForSelection(holding, companyIds, holders);
    if (of.share <= 0 && of.commissionShare <= 0) continue;
    shareBy.set(holding.projectId, of);
    rows.push({
      projectId: holding.projectId,
      projectName: holding.projectName,
      share: of.share,
      commissionShare: of.commissionShare,
      via: of.lines,
      full: empty(),
      part: empty(),
    });
  }

  const byProject = new Map(rows.map((row) => [row.projectId, row]));
  const byMonth = new Map<string, MonthRow>();
  for (const one of moved) {
    const row = byProject.get(one.projectId);
    const share = shareBy.get(one.projectId);
    if (!row || !share) continue;
    /* A commission is the holding companies' expense, so it is shared by their part, not by the whole. */
    const part = Math.round(one.cents * (one.column === "commissions" ? share.commissionShare : share.share));
    row.full[one.column] += one.cents;
    row.part[one.column] += part;
    if (part === 0) continue;
    const key = `${one.at.getFullYear()}-${String(one.at.getMonth() + 1).padStart(2, "0")}`;
    const month = byMonth.get(key) ?? { key, year: one.at.getFullYear(), month: one.at.getMonth() + 1, part: empty() };
    month.part[one.column] += part;
    byMonth.set(key, month);
  }

  const totals = empty();
  for (const row of rows) for (const column of LEDGER_COLUMNS) totals[column] += row.part[column];

  return {
    rows,
    totals,
    months: [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}
