"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { agents, commissionPayments, commissions, contracts } from "@/db/schema";
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
  address: z.string().optional(),
  country: z.string().optional(),
  vatNumber: z.string().optional(),
  licenceNumber: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

function read(formData: FormData) {
  return agentSchema.parse({
    name: formData.get("name"),
    company: formData.get("company") || undefined,
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    commissionRate: String(formData.get("commissionRate") ?? "0"),
    address: formData.get("address") || undefined,
    country: formData.get("country") || undefined,
    vatNumber: formData.get("vatNumber") || undefined,
    licenceNumber: formData.get("licenceNumber") || undefined,
    website: formData.get("website") || undefined,
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
      address: parsed.address,
      country: parsed.country,
      vatNumber: parsed.vatNumber,
      licenceNumber: parsed.licenceNumber,
      website: parsed.website,
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

export type AgentState = { ok: true } | { error: string } | null;

/**
 * The agent's own card, saved in place.
 *
 * Same fields as the edit page, but it answers rather than redirects, so the
 * card closes itself and the page stays where it was.
 */
export async function saveAgentProfile(
  agentId: string,
  _prev: AgentState,
  formData: FormData,
): Promise<AgentState> {
  const user = await requireUser(["ADMIN"]);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "An agent needs a name." };

  const rate = Number(String(formData.get("commissionRate") ?? "0").replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { error: "The rate has to be a number between 0 and 100." };
  }

  await db
    .update(agents)
    .set({
      name,
      company: String(formData.get("company") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      commissionRate: rate.toFixed(3),
      address: String(formData.get("address") ?? "").trim() || null,
      country: String(formData.get("country") ?? "").trim() || null,
      vatNumber: String(formData.get("vatNumber") ?? "").trim() || null,
      licenceNumber: String(formData.get("licenceNumber") ?? "").trim() || null,
      website: String(formData.get("website") ?? "").trim() || null,
      isActive: String(formData.get("isActive") ?? "") === "on",
      notes: String(formData.get("notes") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  // The rate applies to the sales that carry no rate of their own.
  const sales = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.agentId, agentId));
  for (const sale of sales) await syncCommission(sale.id);

  await recordAudit({
    action: "agent.update",
    entity: "agent",
    entityId: agentId,
    detail: name,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/agents");
  revalidatePath("/commissions");
  return { ok: true };
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
      address: parsed.address ?? null,
      country: parsed.country ?? null,
      vatNumber: parsed.vatNumber ?? null,
      licenceNumber: parsed.licenceNumber ?? null,
      website: parsed.website ?? null,
      isActive: String(formData.get("isActive") ?? "") === "on",
      notes: parsed.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  // A new rate applies to the contracts this agent is on that carry no rate of
  // their own.
  const sales = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.agentId, agentId));
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

/**
 * An extra on top of the rate: most often the difference when an apartment went
 * for more than it was priced at, but it can be anything the office decides.
 */
export async function addExtra(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const amountCents = toCents(String(formData.get("amount") ?? "0"));
  const label = String(formData.get("label") ?? "").trim() || "Extra";

  if (amountCents === 0) throw new Error("Give the extra an amount.");

  const rows = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const contract = rows[0];
  if (!contract) throw new Error("Contract not found");
  if (!contract.agentId) throw new Error("This sale has no agent on it yet.");

  await db.insert(commissions).values({
    contractId,
    agentId: contract.agentId,
    kind: "EXTRA",
    label,
    baseAmount: "0.00",
    rate: "0.000",
    amount: fromCents(amountCents),
  });

  await recordAudit({
    action: "commission.extra",
    entity: "contract",
    entityId: contractId,
    detail: `${label}, ${fromCents(amountCents)}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/agents/${contract.agentId}`);
  revalidatePath("/commissions");
}

export async function removeCommissionLine(commissionId: string, agentId: string) {
  const user = await requireUser(["ADMIN"]);
  const rows = await db.select().from(commissions).where(eq(commissions.id, commissionId)).limit(1);
  const line = rows[0];
  if (!line) return;
  if (line.kind === "RATE") {
    throw new Error(
      "The rate line follows the contract. Take the agent off the contract instead, or set its rate to zero.",
    );
  }

  const [paidHere] = await db
    .select({ id: commissionPayments.id })
    .from(commissionPayments)
    .where(eq(commissionPayments.commissionId, commissionId))
    .limit(1);
  if (paidHere) throw new Error("That line has been paid. Remove the payment first.");

  await db.delete(commissions).where(eq(commissions.id, commissionId));

  await recordAudit({
    action: "commission.extra.delete",
    entity: "agent",
    entityId: agentId,
    detail: commissionId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/commissions");
}

/** Settle one line in full, which is what marking it paid means. */
export async function payLine(commissionId: string, agentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const rows = await db.select().from(commissions).where(eq(commissions.id, commissionId)).limit(1);
  const line = rows[0];
  if (!line) throw new Error("Commission not found");

  const paidRows = await db
    .select()
    .from(commissionPayments)
    .where(eq(commissionPayments.commissionId, commissionId));
  const already = paidRows.reduce((a, p) => a + toCents(p.amount), 0);
  const due = toCents(line.amount) - already;
  if (due <= 0) return;

  const paidOn = String(formData.get("paidOn") ?? "");

  await db.insert(commissionPayments).values({
    agentId: line.agentId,
    commissionId,
    amount: fromCents(due),
    paidOn: paidOn ? new Date(paidOn) : new Date(),
    reference: String(formData.get("reference") ?? "") || null,
  });

  await db
    .update(commissions)
    .set({ status: "PAID", updatedAt: new Date() })
    .where(eq(commissions.id, commissionId));

  await recordAudit({
    action: "commission.paid",
    entity: "agent",
    entityId: agentId,
    detail: `${fromCents(due)} settled`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/commissions");
}

/**
 * The rate on one sale, apart from the agent's usual one. A month with a better
 * rate on offer is exactly what this is for; leaving it empty goes back to the
 * agent's own rate.
 */
export async function setSaleRate(contractId: string, agentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const typed = String(formData.get("rate") ?? "").trim();
  const rate = typed === "" ? null : Number(typed).toFixed(3);

  await db
    .update(contracts)
    .set({ commissionRate: rate, updatedAt: new Date() })
    .where(eq(contracts.id, contractId));

  await syncCommission(contractId);

  await recordAudit({
    action: "commission.rate",
    entity: "contract",
    entityId: contractId,
    detail: rate ? `${rate}% on this sale` : "back to the agent's own rate",
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/agents/${agentId}`);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/commissions");
}
