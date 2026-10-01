"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashReceipts, contracts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { fromCents, parseAmount } from "@/lib/money";

/*
 * Cash received against the cash part of a sale, and taking a line back.
 *
 * Nothing else happens when cash is recorded: no invoice, no receipt, no VAT
 * and no email. It is the office's own record of what came in.
 */

function dayFrom(raw: FormDataEntryValue | null): Date {
  const text = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  }
  return new Date();
}

export async function recordCash(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract) return;

  const cents = parseAmount(String(formData.get("amount") ?? ""));
  if (!cents || cents <= 0) {
    await flash("said.cashNeedsAmount", "bad");
    return;
  }

  const [made] = await db
    .insert(cashReceipts)
    .values({
      contractId,
      amount: fromCents(cents),
      receivedOn: dayFrom(formData.get("receivedOn")),
      note: String(formData.get("note") ?? "").trim() || null,
      recordedById: user.id,
    })
    .returning({ id: cashReceipts.id });

  await recordAudit({
    action: "contract.cash.add",
    entity: "contract",
    entityId: contractId,
    detail: `cash ${fromCents(cents)} (${made.id})`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.cashRecorded");
  revalidatePath(`/contracts/${contractId}`);
}

export async function removeCash(cashId: string, contractId: string) {
  const user = await requireUser(["ADMIN"]);
  const [line] = await db
    .select()
    .from(cashReceipts)
    .where(and(eq(cashReceipts.id, cashId), eq(cashReceipts.contractId, contractId)))
    .limit(1);
  if (!line) return;

  await db.delete(cashReceipts).where(eq(cashReceipts.id, cashId));
  await recordAudit({
    action: "contract.cash.remove",
    entity: "contract",
    entityId: contractId,
    detail: `cash ${line.amount} removed`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.deleted");
  revalidatePath(`/contracts/${contractId}`);
}
