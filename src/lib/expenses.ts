import "server-only";
import { choiceFilter } from "@/lib/choices/filter";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { expenseLines, expenses, projects } from "@/db/schema";
import { toCents } from "./money";

/**
 * What the company pays.
 *
 * Marketing, the office, the rent, the bills. One row per invoice received, with
 * the paper attached and whether it has been paid, so the office can answer what
 * it owes this month without opening a drawer.
 */

export const EXPENSE_CATEGORIES = [
  "MANAGEMENT_FEES",
  "MARKETING",
  "OFFICE",
  "RENT",
  "BILLS",
  "LEGAL",
  "CONSTRUCTION",
  "OTHER",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const expenseStatusTone = (status: string) =>
  status === "PAID" ? "good" : status === "PARTIALLY_PAID" ? "warn" : "neutral";

/** Paid on an invoice we received, but their receipt is not in yet for every payment. */
export const RECEIPT_MISSING_SQL = sql`(${expenses.direction} = 'IN' and ${expenses.status} = 'PAID' and exists (select 1 from expense_payments ep where ep.expense_id = ${expenses.id} and ep.receipt_document_id is null))`;

export async function listExpenses({
  query = "",
  category = "",
  status = "",
  direction = "",
  limit = 20,
  offset = 0,
}: {
  query?: string;
  category?: string;
  status?: string;
  direction?: string;
  limit?: number;
  offset?: number;
}) {
  const filters: SQL[] = [];
  if (query) {
    filters.push(
      or(
        ilike(expenses.supplier, `%${query}%`),
        ilike(expenses.reference, `%${query}%`),
        ilike(expenses.description, `%${query}%`),
      ) as SQL,
    );
  }
  /* A built in category finds the office's own ones under it too, on any line of the invoice. */
  const byCategory = category ? choiceFilter(expenses.category, expenses.categoryChoice, [category], EXPENSE_CATEGORIES) : null;
  if (byCategory && category) {
    filters.push(
      or(
        byCategory,
        sql`exists (select 1 from expense_lines l where l.expense_id = ${expenses.id} and (l.category = ${category} or l.category_choice = ${category}))`,
      ) as SQL,
    );
  }
  if (["UNPAID", "PARTIALLY_PAID", "PAID"].includes(status)) {
    filters.push(eq(expenses.status, status as "UNPAID"));
  }
  if (status === "RECEIPT_MISSING") filters.push(RECEIPT_MISSING_SQL);
  if (direction === "IN" || direction === "OUT") filters.push(eq(expenses.direction, direction));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, [counted], sums] = await Promise.all([
    db
      .select({
        expense: expenses,
        project: projects,
        /* An invoice for several developments names them all. */
        developments: sql<string | null>`(select string_agg(distinct p.name, ', ') from expense_lines l join projects p on p.id = l.project_id where l.expense_id = ${expenses.id})`,
        receiptMissing: sql<boolean>`${RECEIPT_MISSING_SQL}`,
      })
      .from(expenses)
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .where(where)
      .orderBy(desc(expenses.issueDate), desc(expenses.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(expenses)
      .where(where),
    db
      .select({
        direction: expenses.direction,
        billed: sql<string>`coalesce(sum(${expenses.totalAmount}), 0)`,
        paid: sql<string>`coalesce(sum(${expenses.paidAmount}), 0)`,
      })
      .from(expenses)
      .where(where)
      .groupBy(expenses.direction),
  ]);

  const side = (which: string) => {
    const found = sums.find((one) => one.direction === which);
    const billedCents = toCents(found?.billed ?? "0");
    const paidCents = toCents(found?.paid ?? "0");
    return { billedCents, paidCents, owedCents: billedCents - paidCents };
  };

  return {
    rows,
    total: counted?.total ?? 0,
    income: side("OUT"),
    costs: side("IN"),
  };
}

/** What each category comes to, both ways, counted by the lines of the invoices. */
export async function expensesByCategory() {
  const rows = await db
    .select({
      category: sql<string>`coalesce(${expenseLines.category}, ${expenses.category}::text)`,
      direction: expenses.direction,
      billed: sql<string>`coalesce(sum(${expenseLines.totalAmount}), 0)`,
      owed: sql<string>`coalesce(sum(${expenseLines.totalAmount} * (1 - ${expenses.paidAmount} / nullif(${expenses.totalAmount}, 0))), 0)`,
      count: sql<number>`count(distinct ${expenses.id})::int`,
    })
    .from(expenseLines)
    .innerJoin(expenses, eq(expenses.id, expenseLines.expenseId))
    .groupBy(sql`coalesce(${expenseLines.category}, ${expenses.category}::text)`, expenses.direction);
  const out = new Map<string, { category: string; count: number; incomeCents: number; incomeOwedCents: number; costCents: number; costOwedCents: number }>();
  for (const row of rows) {
    const one = out.get(row.category) ?? { category: row.category, count: 0, incomeCents: 0, incomeOwedCents: 0, costCents: 0, costOwedCents: 0 };
    one.count += row.count;
    if (row.direction === "OUT") {
      one.incomeCents += toCents(row.billed);
      one.incomeOwedCents += toCents(row.owed);
    } else {
      one.costCents += toCents(row.billed);
      one.costOwedCents += toCents(row.owed);
    }
    out.set(row.category, one);
  }
  return [...out.values()].sort((a, b) => b.incomeCents + b.costCents - (a.incomeCents + a.costCents));
}

/** What is still owed both ways, so the dashboard can say it in one line. */
export async function expensesOwed() {
  const [row] = await db
    .select({
      owed: sql<string>`coalesce(sum(${expenses.totalAmount} - ${expenses.paidAmount}) filter (where ${expenses.direction} = 'IN'), 0)`,
      owedToUs: sql<string>`coalesce(sum(${expenses.totalAmount} - ${expenses.paidAmount}) filter (where ${expenses.direction} = 'OUT'), 0)`,
      overdue: sql<number>`count(*) filter (
        where ${expenses.direction} = 'IN' and ${expenses.status} <> 'PAID' and ${expenses.dueDate} is not null and ${expenses.dueDate} < now()
      )::int`,
      overdueToUs: sql<number>`count(*) filter (
        where ${expenses.direction} = 'OUT' and ${expenses.status} <> 'PAID' and ${expenses.dueDate} is not null and ${expenses.dueDate} < now()
      )::int`,
    })
    .from(expenses);
  return {
    owedCents: toCents(row?.owed ?? "0"),
    owedToUsCents: toCents(row?.owedToUs ?? "0"),
    overdue: row?.overdue ?? 0,
    overdueToUs: row?.overdueToUs ?? 0,
  };
}

/** The status an invoice should carry, given what has been paid against it. */
export function statusFor(
  totalCents: number,
  paidCents: number,
): "UNPAID" | "PARTIALLY_PAID" | "PAID" {
  if (paidCents <= 0) return "UNPAID";
  if (paidCents >= totalCents) return "PAID";
  return "PARTIALLY_PAID";
}
