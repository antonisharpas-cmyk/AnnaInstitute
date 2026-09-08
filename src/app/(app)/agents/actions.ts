"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agents, commissionPayments, commissions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fromCents, toCents } from "@/lib/money";

const agentSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  commissionRate: z.string(),
  notes: z.string().optional(),
});

export async function createAgent(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = agentSchema.parse({
    name: formData.get("name"),
    company: formData.get("company") || undefined,
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    commissionRate: String(formData.get("commissionRate") ?? "0"),
    notes: formData.get("notes") || undefined,
  });

  const inserted = await db
    .insert(agents)
    .values({
      name: parsed.name,
      company: parsed.company,
      email: parsed.email || null,
      phone: parsed.phone,
      commissionRate: Number(parsed.commissionRate || 0).toFixed(3),
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
}

export async function updateAgentRate(agentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const before = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  const rate = Number(String(formData.get("commissionRate") ?? "0")).toFixed(3);

  await db
    .update(agents)
    .set({ commissionRate: rate, isActive: String(formData.get("isActive") ?? "") === "on", updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  await recordAudit({
    action: "agent.rate.change",
    entity: "agent",
    entityId: agentId,
    detail: `${before[0]?.commissionRate} to ${rate}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/agents");
  revalidatePath("/commissions");
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
      .set({ status: paid >= due ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "PENDING", updatedAt: new Date() })
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
}
