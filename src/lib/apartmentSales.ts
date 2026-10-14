import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { toCents } from "@/lib/money";
import type { Range } from "@/lib/reports";

/*
 * Apartment Sales, in one place.
 *
 * Where every apartment stands, how far every contract has got, cancelled ones
 * included, and the money of every sale three ways: before VAT, with VAT, and
 * the cash beside the price. Each figure is agreed against received, so the
 * office reads how much came in out of how much. The things that change a sale
 * after it is signed, a reduced VAT rate, a penalty or a refund paid back, a
 * credit note, are shown where they happen rather than folded away.
 *
 * The period picks the contracts, by their contract date; the money is every
 * payment those contracts have had, whenever it arrived. The apartments are
 * where they stand today.
 */

export const UNIT_STATUSES = ["AVAILABLE", "NEGOTIATION", "RESERVED", "SOLD", "DELIVERED"] as const;

/** How far a contract has got, furthest first when it is worked out. */
export const STAGES = ["NEGOTIATION", "RESERVED", "SALE_SIGNED", "PAID", "DELIVERED", "CANCELLED"] as const;
export type Stage = (typeof STAGES)[number];

export type SaleLine = {
  id: string;
  reference: string;
  projectId: string;
  project: string;
  unit: string;
  buyer: string;
  clientId: string | null;
  date: Date | null;
  status: string;
  stage: Stage;
  vatRate: number;
  reducedVat: boolean;
  netAgreed: number;
  netReceived: number;
  grossAgreed: number;
  grossReceived: number;
  cashAgreed: number;
  cashReceived: number;
  /** What the VAT would have been at the standard rate, less what it is: the saving the reduced rate gave. */
  vatSaved: number;
  refunds: number;
  penalties: number;
  creditNotes: number;
  creditNoteCents: number;
  overdueCents: number;
};

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] =>
  Array.isArray(result) ? (result as Row[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Row[]);
const run = async (query: SQL): Promise<Row[]> => rowsOf(await db.execute(query));
const cents = (value: unknown) => toCents(value === null || value === undefined ? "0" : String(value));
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/** Every apartment by development and by where it stands, today. */
export async function unitsByStatus(only: string[] | null) {
  const ids = only === null ? null : only.length > 0 ? only : [""];
  const rows = await run(sql`
    select p.id, p.name, u.status, count(*)::int as n
    from units u join projects p on p.id = u.project_id
    ${ids === null ? sql`` : sql`where u.project_id in ${ids}`}
    group by p.id, p.name, u.status
    order by p.name`);
  return rows.map((r) => ({ projectId: str(r.id), project: str(r.name), status: str(r.status), count: Number(r.n) }));
}

/** Every sale in the period, with its money and how far it has got. */
export async function saleLines(range: Range, only: string[] | null): Promise<SaleLine[]> {
  const ids = only === null ? null : only.length > 0 ? only : [""];
  const rows = await run(sql`
    select c.id, c.reference, c.status, c.net_price, c.vat_rate, c.cash_amount,
           c.reduced_vat_approved_on, c.standard_vat_rate,
           coalesce(c.contract_date, c.created_at) as made,
           u.code, u.status as unit_status, p.id as project_id, p.name as project,
           cl.id as client_id, cl.first_name, cl.last_name,
           (select sum(i.net_amount) from installments i where i.contract_id = c.id) as sched_net,
           (select sum(i.total_amount) from installments i where i.contract_id = c.id) as sched_total,
           (select sum(pm.amount) from payments pm where pm.contract_id = c.id and pm.kind = 'PAYMENT') as paid,
           (select sum(pm.amount * coalesce(i.net_amount / nullif(i.total_amount, 0), 100 / (100 + c.vat_rate)))
              from payments pm left join installments i on i.id = pm.installment_id
              where pm.contract_id = c.id and pm.kind = 'PAYMENT') as paid_net,
           (select sum(r.amount) from cash_receipts r where r.contract_id = c.id) as cash_in,
           (select sum(r.amount) from refunds r where r.contract_id = c.id and r.purpose = 'REFUND') as refunded,
           (select sum(r.amount) from refunds r where r.contract_id = c.id and r.purpose = 'PENALTY') as penalised,
           (select count(*)::int from issued_documents d where d.contract_id = c.id and d.kind = 'CREDIT_NOTE' and d.voided_at is null) as credit_notes,
           (select sum(d.total_amount) from issued_documents d where d.contract_id = c.id and d.kind = 'CREDIT_NOTE' and d.voided_at is null) as credit_total,
           exists (select 1 from signing_papers sp where sp.contract_id = c.id and sp.kind = 'RESERVATION' and sp.signed_at is not null) as reservation_signed,
           exists (select 1 from signing_papers sp where sp.contract_id = c.id and sp.kind = 'SALE' and sp.signed_at is not null) as sale_signed,
           (select sum(i.total_amount - coalesce((select sum(px.amount) from payments px where px.installment_id = i.id), 0))
              from installments i
              where i.contract_id = c.id and i.due_date is not null and i.due_date < now()
                and coalesce((select sum(px.amount) from payments px where px.installment_id = i.id), 0) < i.total_amount) as overdue
    from contracts c
    join units u on u.id = c.unit_id
    join projects p on p.id = u.project_id
    left join clients cl on cl.id = c.client_id
    where c.kind = 'SALE'
      and coalesce(c.contract_date, c.created_at) >= ${range.from}
      and coalesce(c.contract_date, c.created_at) <= ${range.to}
      ${ids === null ? sql`` : sql`and u.project_id in ${ids}`}
    order by p.name, u.code`);

  return rows.map((r) => {
    const vatRate = Number(r.vat_rate ?? 19) || 0;
    const netPrice = cents(r.net_price);
    const netAgreed = r.sched_net === null || r.sched_net === undefined ? netPrice : cents(r.sched_net);
    const grossAgreed =
      r.sched_total === null || r.sched_total === undefined
        ? Math.round(netPrice * (1 + vatRate / 100))
        : cents(r.sched_total);
    const grossReceived = cents(r.paid);
    const reducedVat = Boolean(r.reduced_vat_approved_on);
    const standard = Number(r.standard_vat_rate ?? 19) || 19;
    const vatSaved = reducedVat ? Math.max(0, Math.round((netAgreed * standard) / 100) - (grossAgreed - netAgreed)) : 0;

    let stage: Stage = "NEGOTIATION";
    if (r.status === "CANCELLED") stage = "CANCELLED";
    else if (r.unit_status === "DELIVERED") stage = "DELIVERED";
    else if (grossAgreed > 0 && grossReceived >= grossAgreed) stage = "PAID";
    else if (r.sale_signed) stage = "SALE_SIGNED";
    else if (r.reservation_signed || grossReceived > 0) stage = "RESERVED";

    return {
      id: str(r.id),
      reference: str(r.reference),
      projectId: str(r.project_id),
      project: str(r.project),
      unit: str(r.code),
      buyer: `${str(r.last_name)} ${str(r.first_name)}`.trim(),
      clientId: r.client_id ? str(r.client_id) : null,
      date: r.made ? new Date(r.made as string) : null,
      status: str(r.status),
      stage,
      vatRate,
      reducedVat,
      netAgreed,
      netReceived: cents(r.paid_net),
      grossAgreed,
      grossReceived,
      cashAgreed: cents(r.cash_amount),
      cashReceived: cents(r.cash_in),
      vatSaved,
      refunds: cents(r.refunded),
      penalties: cents(r.penalised),
      creditNotes: Number(r.credit_notes ?? 0),
      creditNoteCents: cents(r.credit_total),
      overdueCents: stage === "CANCELLED" ? 0 : cents(r.overdue),
    };
  });
}

/** The money of a set of sales, added up. Cancelled ones are kept apart: what they agreed is no longer owed. */
export function addUp(lines: SaleLine[]) {
  const standing = lines.filter((line) => line.stage !== "CANCELLED");
  const cancelled = lines.filter((line) => line.stage === "CANCELLED");
  const sum = (set: SaleLine[], pick: (line: SaleLine) => number) => set.reduce((total, line) => total + pick(line), 0);
  return {
    contracts: standing.length,
    cancelled: cancelled.length,
    netAgreed: sum(standing, (l) => l.netAgreed),
    netReceived: sum(standing, (l) => l.netReceived),
    grossAgreed: sum(standing, (l) => l.grossAgreed),
    grossReceived: sum(standing, (l) => l.grossReceived),
    cashAgreed: sum(standing, (l) => l.cashAgreed),
    cashReceived: sum(standing, (l) => l.cashReceived),
    overdue: sum(standing, (l) => l.overdueCents),
    reducedVat: standing.filter((l) => l.reducedVat).length,
    vatSaved: sum(standing, (l) => l.vatSaved),
    refunds: sum(lines, (l) => l.refunds),
    penalties: sum(lines, (l) => l.penalties),
    creditNotes: sum(lines, (l) => l.creditNotes),
    creditNoteCents: sum(lines, (l) => l.creditNoteCents),
    /* Money that came in on contracts since cancelled, and what of it was paid back. */
    cancelledReceived: sum(cancelled, (l) => l.grossReceived + l.cashReceived),
    cancelledRefunded: sum(cancelled, (l) => l.refunds),
  };
}
