import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashReceipts, users } from "@/db/schema";
import { toCents } from "@/lib/money";

/*
 * The cash part of a sale: agreed on the contract, received a line at a time.
 *
 * Kept out of the payments, the invoices and the VAT entirely. What the office
 * needs from it is three figures, agreed, received and still to come, and the
 * price of the apartment with the cash put back in, which is the figure the
 * sale was really made at.
 */

export async function cashLinesOf(contractId: string) {
  return db
    .select({ line: cashReceipts, by: users.name })
    .from(cashReceipts)
    .leftJoin(users, eq(users.id, cashReceipts.recordedById))
    .where(eq(cashReceipts.contractId, contractId))
    .orderBy(asc(cashReceipts.receivedOn), asc(cashReceipts.createdAt));
}

export type CashStanding = {
  agreedCents: number;
  receivedCents: number;
  outstandingCents: number;
};

export function cashStanding(agreed: string | null | undefined, lines: { amount: string }[]): CashStanding {
  const agreedCents = toCents(agreed ?? "0");
  const receivedCents = lines.reduce((sum, one) => sum + toCents(one.amount), 0);
  return { agreedCents, receivedCents, outstandingCents: Math.max(0, agreedCents - receivedCents) };
}

/** Cash received so far, by contract, for lists and reports. */
export async function cashReceivedBy(contractIds: string[]): Promise<Map<string, number>> {
  if (contractIds.length === 0) return new Map();
  const rows = await db
    .select({ contractId: cashReceipts.contractId, total: sql<string>`coalesce(sum(${cashReceipts.amount}), 0)` })
    .from(cashReceipts)
    .where(inArray(cashReceipts.contractId, contractIds))
    .groupBy(cashReceipts.contractId);
  return new Map(rows.map((row) => [row.contractId, toCents(row.total)]));
}
