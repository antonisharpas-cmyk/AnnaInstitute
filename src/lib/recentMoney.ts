import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { toCents } from "@/lib/money";

/*
 * Every payment lately, whichever way it went.
 *
 * Money from buyers, the cash beside it, what agents were paid, what came in
 * and went out on company invoices, and what the constructor was paid, newest
 * first, in one list. Each kind is read on its own, newest first, and the
 * lists are merged, so the page never reads more than it shows.
 */

export type MoneyKind = "buyer" | "cash" | "agent" | "income" | "expense" | "constructor";

export type MoneyLine = {
  id: string;
  kind: MoneyKind;
  at: Date;
  /** Who paid us, or who we paid. */
  who: string;
  /** The record's own words: the apartment, the reference, the receipt number. */
  note: string;
  href: string;
  cents: number;
  incoming: boolean;
};

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Row[]);
const run = async (query: SQL): Promise<Row[]> => {
  try {
    return rowsOf(await db.execute(query));
  } catch (error) {
    console.warn("A kind of payment could not be read for the dashboard.", error);
    return [];
  }
};
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const joined = (...parts: unknown[]) => parts.map(str).filter(Boolean).join(", ");

export async function recentMoney(limit: number, only: string[] | null): Promise<MoneyLine[]> {
  const ids = only === null ? null : only.length > 0 ? only : [""];
  const unitIn = (alias: string) => (ids === null ? sql`true` : sql`${sql.raw(alias)}.project_id in ${ids}`);
  const expenseIn =
    ids === null
      ? sql`true`
      : sql`(e.project_id in ${ids} or exists (select 1 from expense_lines l where l.expense_id = e.id and l.project_id in ${ids}))`;

  const [buyer, cash, agent, company, builder] = await Promise.all([
    run(sql`
      select pm.id, pm.paid_on as at, pm.amount, pm.receipt_number, c.id as contract_id, c.reference,
             cl.first_name, cl.last_name, u.code, p.name as project
      from payments pm
      join contracts c on c.id = pm.contract_id
      left join clients cl on cl.id = c.client_id
      left join units u on u.id = c.unit_id
      left join projects p on p.id = u.project_id
      where pm.kind = 'PAYMENT' and ${ids === null ? sql`true` : sql`u.project_id in ${ids}`}
      order by pm.paid_on desc, pm.created_at desc limit ${limit}`),
    run(sql`
      select cr.id, cr.received_on as at, cr.amount, c.id as contract_id, c.reference,
             cl.first_name, cl.last_name, u.code, p.name as project
      from cash_receipts cr
      join contracts c on c.id = cr.contract_id
      left join clients cl on cl.id = c.client_id
      left join units u on u.id = c.unit_id
      left join projects p on p.id = u.project_id
      where ${ids === null ? sql`true` : sql`u.project_id in ${ids}`}
      order by cr.received_on desc, cr.created_at desc limit ${limit}`),
    run(sql`
      select cp.id, cp.paid_on as at, cp.amount, cp.reference as paid_ref, a.id as agent_id, a.name,
             c.reference, u.code, p.name as project
      from commission_payments cp
      join agents a on a.id = cp.agent_id
      left join commissions cm on cm.id = cp.commission_id
      left join contracts c on c.id = cm.contract_id
      left join units u on u.id = c.unit_id
      left join projects p on p.id = u.project_id
      where ${ids === null ? sql`true` : sql`u.project_id in ${ids}`}
      order by cp.paid_on desc, cp.created_at desc limit ${limit}`),
    run(sql`
      select ep.id, ep.paid_on as at, ep.amount, e.id as expense_id, e.direction, e.supplier, e.reference
      from expense_payments ep
      join expenses e on e.id = ep.expense_id
      where ${expenseIn}
      order by ep.paid_on desc, ep.created_at desc limit ${limit}`),
    run(sql`
      select cpay.id, cpay.paid_on as at, cpay.amount, cpay.kind, k.id as constructor_id, k.name, p.name as project
      from constructor_payments cpay
      join constructor_projects cp on cp.id = cpay.constructor_project_id
      join constructors k on k.id = cp.constructor_id
      left join projects p on p.id = cp.project_id
      where cpay.status = 'PAID' and ${unitIn("cp")}
      order by cpay.paid_on desc, cpay.created_at desc limit ${limit}`),
  ]);

  const name = (r: Row) => `${str(r.last_name)} ${str(r.first_name)}`.trim() || str(r.reference);
  const lines: MoneyLine[] = [
    ...buyer.map((r) => ({
      id: `b${str(r.id)}`,
      kind: "buyer" as const,
      at: new Date(r.at as string),
      who: name(r),
      note: joined(r.project, r.code, r.receipt_number),
      href: `/contracts/${str(r.contract_id)}`,
      cents: toCents(str(r.amount)),
      incoming: true,
    })),
    ...cash.map((r) => ({
      id: `c${str(r.id)}`,
      kind: "cash" as const,
      at: new Date(r.at as string),
      who: name(r),
      note: joined(r.project, r.code),
      href: `/contracts/${str(r.contract_id)}`,
      cents: toCents(str(r.amount)),
      incoming: true,
    })),
    ...agent.map((r) => ({
      id: `a${str(r.id)}`,
      kind: "agent" as const,
      at: new Date(r.at as string),
      who: str(r.name),
      note: joined(r.project, r.code, r.paid_ref),
      href: `/agents/${str(r.agent_id)}`,
      cents: toCents(str(r.amount)),
      incoming: false,
    })),
    ...company.map((r) => ({
      id: `e${str(r.id)}`,
      kind: (r.direction === "OUT" ? "income" : "expense") as MoneyKind,
      at: new Date(r.at as string),
      who: str(r.supplier),
      note: str(r.reference),
      href: `/invoices/${str(r.expense_id)}`,
      cents: toCents(str(r.amount)),
      incoming: r.direction === "OUT",
    })),
    ...builder.map((r) => ({
      id: `k${str(r.id)}`,
      kind: "constructor" as const,
      at: new Date(r.at as string),
      who: str(r.name),
      note: joined(r.project, r.kind),
      href: `/constructors/${str(r.constructor_id)}`,
      cents: toCents(str(r.amount)),
      incoming: false,
    })),
  ];

  return lines.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
