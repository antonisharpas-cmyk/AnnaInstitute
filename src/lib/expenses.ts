import "server-only";
import { choiceFilter } from "@/lib/choices/filter";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { expenses, projects } from "@/db/schema";
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

export async function listExpenses({
  query = "",
  category = "",
  status = "",
  limit = 20,
  offset = 0,
}: {
  query?: string;
  category?: string;
  status?: string;
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
  /* A built in category finds the office's own ones under it too; an own one finds itself. */
  const byCategory = category ? choiceFilter(expenses.category, expenses.categoryChoice, [category], EXPENSE_CATEGORIES) : null;
  if (byCategory) filters.push(byCategory);
  if (["UNPAID", "PARTIALLY_PAID", "PAID"].includes(status)) {
    filters.push(eq(expenses.status, status as "UNPAID"));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, [counted], [sums]] = await Promise.all([
    db
      .select({
        expense: expenses,
        project: projects,
        /* An invoice for several developments names them all. */
        developments: sql<string | null>`(select string_agg(p.name, ', ' order by l.seq) from expense_lines l join projects p on p.id = l.project_id where l.expense_id = ${expenses.id})`,
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
        billed: sql<string>`coalesce(sum(${expenses.totalAmount}), 0)`,
        paid: sql<string>`coalesce(sum(${expenses.paidAmount}), 0)`,
      })
      .from(expenses)
      .where(where),
  ]);

  const billedCents = toCents(sums?.billed ?? "0");
  const paidCents = toCents(sums?.paid ?? "0");

  return {
    rows,
    total: counted?.total ?? 0,
    billedCents,
    paidCents,
    owedCents: billedCents - paidCents,
  };
}

/** What each category has cost, for the summary at the top of the section. */
export async function expensesByCategory() {
  return db
    .select({
      category: expenses.category,
      billed: sql<string>`coalesce(sum(${expenses.totalAmount}), 0)`,
      owed: sql<string>`coalesce(sum(${expenses.totalAmount} - ${expenses.paidAmount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .groupBy(expenses.category);
}

/** What is still owed, so the dashboard can say it in one line. */
export async function expensesOwed() {
  const [row] = await db
    .select({
      owed: sql<string>`coalesce(sum(${expenses.totalAmount} - ${expenses.paidAmount}), 0)`,
      overdue: sql<number>`count(*) filter (
        where ${expenses.status} <> 'PAID' and ${expenses.dueDate} is not null and ${expenses.dueDate} < now()
      )::int`,
    })
    .from(expenses);
  return { owedCents: toCents(row?.owed ?? "0"), overdue: row?.overdue ?? 0 };
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
