import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { toCents } from "@/lib/money";
import type { Range } from "@/lib/reports";

/*
 * Every commission line, one row each, with its two papers: the agent's
 * invoice and the receipt for the money paid. The period picks lines by the
 * day they were generated; the developments chosen narrow them by the sale.
 */

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Row[]);
const run = async (query: SQL): Promise<Row[]> => rowsOf(await db.execute(query));
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export async function commissionLines(range: Range, only: string[] | null, limit: number, offset: number) {
  const ids = only === null ? null : only.length > 0 ? only : [""];
  const where = sql`cm.created_at >= ${range.from} and cm.created_at <= ${range.to}
    ${ids === null ? sql`` : sql`and u.project_id in ${ids}`}`;
  const from = sql`
    from commissions cm
    join agents a on a.id = cm.agent_id
    left join contracts c on c.id = cm.contract_id
    left join units u on u.id = c.unit_id
    left join projects p on p.id = u.project_id`;
  const rows = await run(sql`
    select cm.id, cm.created_at, cm.kind, cm.label, cm.amount, cm.status, cm.history,
           a.id as agent_id, a.name as agent, p.name as project, u.code, c.id as contract_id,
           (select coalesce(sum(x.amount), 0) from commission_payments x where x.commission_id = cm.id) as paid,
           exists (select 1 from documents d where d.commission_id = cm.id and d.category = 'AGENT_INVOICE') as has_invoice,
           exists (select 1 from documents d where d.commission_id = cm.id and d.category = 'AGENT_RECEIPT') as has_receipt
    ${from}
    where ${where}
    order by cm.created_at desc
    limit ${limit} offset ${offset}`);
  const [counted] = await run(sql`select count(*)::int as n ${from} where ${where}`);
  return {
    total: Number(counted?.n ?? 0),
    rows: rows.map((r) => {
      const cents = toCents(str(r.amount) || "0");
      const paid = toCents(str(r.paid) || "0");
      /* Where the line stands, from the money against it. */
      const standing =
        r.status === "CANCELLED" ? "CANCELLED" : paid <= 0 ? "PENDING" : paid < cents ? "PARTIALLY_PAID" : "PAID";
      return {
        id: str(r.id),
        at: new Date(str(r.created_at)),
        kind: str(r.kind),
        label: str(r.label),
        cents,
        paid,
        standing: standing as "CANCELLED" | "PENDING" | "PARTIALLY_PAID" | "PAID",
        history: Boolean(r.history),
        agentId: str(r.agent_id),
        agent: str(r.agent),
        project: str(r.project),
        unit: str(r.code),
        contractId: str(r.contract_id),
        hasInvoice: Boolean(r.has_invoice),
        hasReceipt: Boolean(r.has_receipt),
      };
    }),
  };
}
