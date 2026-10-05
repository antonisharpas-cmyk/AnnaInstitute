import "server-only";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cashReceipts, commissions, contracts, expenseLines, expenses, payments, units } from "@/db/schema";
import { toCents } from "@/lib/money";
import { holdings, shareOf, type Who } from "@/lib/ownership";
import type { Range } from "@/lib/reports";

/*
 * One shareholder's part of every development, or one company's.
 *
 * Each figure is the development's own for the period, then its share of it:
 * sales signed before VAT, money received, cash received, the company's costs
 * and the agents' commissions. The full figure is shown beside the share, so
 * the office can check the arithmetic against the development's own page.
 */

export type ShareRow = {
  projectId: string;
  projectName: string;
  share: number;
  commissionShare: number;
  via: { via: string | null; companyShare: number; holderShare: number; share: number }[];
  full: { signed: number; received: number; cash: number; income: number; costs: number; commissions: number };
  part: { signed: number; received: number; cash: number; income: number; costs: number; commissions: number };
};

const within = (column: SQL | unknown, range: Range) =>
  and(gte(column as never, range.from), lte(column as never, range.to)) as SQL;

async function byProject(query: Promise<{ projectId: string | null; total: string }[]>) {
  const rows = await query;
  return new Map(rows.filter((row) => row.projectId).map((row) => [row.projectId as string, toCents(row.total)]));
}

export async function shareholderReport(who: Who, range: Range) {
  const chargedToHolder = sql`(${expenses.direction} = 'OUT' and ${expenses.partyKind} = 'COMPANY' and ${expenses.partyId} in (select pp.subowner_id from project_partners pp where pp.project_id = ${expenseLines.projectId}))`;
  const [held, signed, received, cash, costs, income, paidOut] = await Promise.all([
    holdings(),
    byProject(
      db
        .select({ projectId: units.projectId, total: sql<string>`coalesce(sum(${contracts.netPrice}), 0)` })
        .from(contracts)
        .innerJoin(units, eq(units.id, contracts.unitId))
        .where(and(eq(contracts.kind, "SALE"), within(contracts.contractDate, range)))
        .groupBy(units.projectId),
    ),
    byProject(
      db
        .select({ projectId: units.projectId, total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .innerJoin(contracts, eq(contracts.id, payments.contractId))
        .innerJoin(units, eq(units.id, contracts.unitId))
        .where(and(eq(payments.kind, "PAYMENT"), within(payments.paidOn, range)))
        .groupBy(units.projectId),
    ),
    byProject(
      db
        .select({ projectId: units.projectId, total: sql<string>`coalesce(sum(${cashReceipts.amount}), 0)` })
        .from(cashReceipts)
        .innerJoin(contracts, eq(contracts.id, cashReceipts.contractId))
        .innerJoin(units, eq(units.id, contracts.unitId))
        .where(within(cashReceipts.receivedOn, range))
        .groupBy(units.projectId),
    ),
    /*
     * Each line of an invoice under Company counts for its own development. A
     * cost is an invoice the company was billed, and also a fee one of our
     * companies charged to the company that holds the development: for that
     * development it is money going out.
     */
    byProject(
      db
        .select({ projectId: expenseLines.projectId, total: sql<string>`coalesce(sum(${expenseLines.totalAmount}), 0)` })
        .from(expenseLines)
        .innerJoin(expenses, eq(expenses.id, expenseLines.expenseId))
        .where(and(sql`(${expenses.direction} = 'IN' or ${chargedToHolder})`, within(sql`coalesce(${expenses.issueDate}, ${expenses.createdAt})`, range)))
        .groupBy(expenseLines.projectId),
    ),
    /* Other income: what our companies charged anybody else for the development. */
    byProject(
      db
        .select({ projectId: expenseLines.projectId, total: sql<string>`coalesce(sum(${expenseLines.totalAmount}), 0)` })
        .from(expenseLines)
        .innerJoin(expenses, eq(expenses.id, expenseLines.expenseId))
        .where(and(sql`(${expenses.direction} = 'OUT' and not ${chargedToHolder})`, within(sql`coalesce(${expenses.issueDate}, ${expenses.createdAt})`, range)))
        .groupBy(expenseLines.projectId),
    ),
    byProject(
      db
        .select({ projectId: units.projectId, total: sql<string>`coalesce(sum(${commissions.amount}), 0)` })
        .from(commissions)
        .innerJoin(contracts, eq(contracts.id, commissions.contractId))
        .innerJoin(units, eq(units.id, contracts.unitId))
        .where(within(commissions.createdAt, range))
        .groupBy(units.projectId),
    ),
  ]);

  const rows: ShareRow[] = [];
  for (const holding of held) {
    const of = shareOf(holding, who);
    if (of.share <= 0 && of.commissionShare <= 0) continue;
    const full = {
      signed: signed.get(holding.projectId) ?? 0,
      received: received.get(holding.projectId) ?? 0,
      cash: cash.get(holding.projectId) ?? 0,
      income: income.get(holding.projectId) ?? 0,
      costs: costs.get(holding.projectId) ?? 0,
      commissions: paidOut.get(holding.projectId) ?? 0,
    };
    const times = (cents: number, share: number) => Math.round(cents * share);
    rows.push({
      projectId: holding.projectId,
      projectName: holding.projectName,
      share: of.share,
      commissionShare: of.commissionShare,
      via: of.lines,
      full,
      part: {
        signed: times(full.signed, of.share),
        received: times(full.received, of.share),
        cash: times(full.cash, of.share),
        income: times(full.income, of.share),
        costs: times(full.costs, of.share),
        commissions: times(full.commissions, of.commissionShare),
      },
    });
  }

  const sum = (pick: (row: ShareRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return {
    rows,
    totals: {
      signed: sum((row) => row.part.signed),
      received: sum((row) => row.part.received),
      cash: sum((row) => row.part.cash),
      income: sum((row) => row.part.income),
      costs: sum((row) => row.part.costs),
      commissions: sum((row) => row.part.commissions),
    },
  };
}
