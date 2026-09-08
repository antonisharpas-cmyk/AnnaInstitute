"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agents, commissionPayments, commissions, contractUnits } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fromCents, toCents } from "@/lib/money";
import { syncCommission } from "../contracts/actions";

const agentSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  commissionRate: z.string(),
  notes: z.string().optional(),
});

function read(formData: FormData) {
  return agentSchema.parse({
    name: formData.get("name"),
    company: formData.get("company") || undefined,
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    commissionRate: String(formData.get("commissionRate") ?? "0"),
    notes: formData.get("notes") || undefined,
  });
}

export async function createAgent(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = read(formData);

  const inserted = await db
    .insert(agents)
    .values({
      name: parsed.name,
      company: parsed.company,
      email: parsed.email || null,
      phone: parsed.phone,
      commissionRate: Number(parsed.commissionRate || 0).toFixed(3),
      isActive: String(formData.get("isActive") ?? "") === "on",
      notes: parsed.notes,
    })
    .returning({ id: agents.id });

  await recordAudit({
    action: "agent.create",
    entity: "agent",
    entityId: inserted[0].id,
    detail: `${parsed.name} at ${parsed.commissionRate}%`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/agents");
  redirect(`/agents/${inserted[0].id}`);
}

export async function updateAgent(agentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = read(formData);
  const before = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);

  await db
    .update(agents)
    .set({
      name: parsed.name,
      company: parsed.company ?? null,
      email: parsed.email || null,
      phone: parsed.phone ?? null,
      commissionRate: Number(parsed.commissionRate || 0).toFixed(3),
      isActive: String(formData.get("isActive") ?? "") === "on",
      notes: parsed.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  // A new rate applies to the sales this agent is on that have no rate of their own.
  const sales = await db
    .select({ id: contractUnits.id })
    .from(contractUnits)
    .where(eq(contractUnits.agentId, agentId));
  for (const sale of sales) await syncCommission(sale.id);

  await recordAudit({
    action: "agent.update",
    entity: "agent",
    entityId: agentId,
    detail: `${before[0]?.commissionRate ?? "?"} to ${parsed.commissionRate}%`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/commissions");
  redirect(`/agents/${agentId}`);
}

export async function recordCommissionPayment(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const agentId = String(formData.get("agentId") ?? "");
  const commissionId = String(formData.get("commissionId") ?? "") || null;
  const amountCents = toCents(String(formData.get("amount") ?? "0"));
  const paidOn = String(formData.get("paidOn") ?? "");

  if (!agentId || amountCents <= 0) throw new Error("Choose an agent and an amount above zero.");

  await db.insert(commissionPayments).values({
    agentId,
    commissionId,
    amount: fromCents(amountCents),
    paidOn: paidOn ? new Date(paidOn) : new Date(),
    reference: String(formData.get("reference") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
  });

  if (commissionId) {
    const rows = await db
      .select()
      .from(commissions)
      .where(eq(commissions.id, commissionId))
      .limit(1);
    const paidRows = await db
      .select()
      .from(commissionPayments)
      .where(eq(commissionPayments.commissionId, commissionId));
    const paid = paidRows.reduce((a, p) => a + toCents(p.amount), 0);
    const due = toCents(rows[0]?.amount ?? "0");
    await db
      .update(commissions)
      .set({
        status: paid >= due ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "PENDING",
        updatedAt: new Date(),
      })
      .where(eq(commissions.id, commissionId));
  }

  await recordAudit({
    action: "commission.payment",
    entity: "agent",
    entityId: agentId,
    detail: fromCents(amountCents),
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/commissions");
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
}

export async function deleteCommissionPayment(paymentId: string, agentId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.delete(commissionPayments).where(eq(commissionPayments.id, paymentId));

  await recordAudit({
    action: "commission.payment.delete",
    entity: "agent",
    entityId: agentId,
    detail: paymentId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/commissions");
  revalidatePath(`/agents/${agentId}`);
}
