"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  agents,
  commissionPayments,
  commissions,
  contracts,
  documents,
  leads,
  users,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { fromCents, toCents } from "@/lib/money";
import { recalculateCommission, refreshCommissionPapers } from "@/lib/commissions";
import { whatGoesWithAgent } from "@/lib/deletes";
import { removeDocument, storeDocuments } from "@/lib/uploads";

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
  for (const sale of sales) await recalculateCommission(sale.id);

  await recordAudit({
    action: "agent.update",
    entity: "agent",
    entityId: agentId,
    detail: name,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saved");
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
  for (const sale of sales) await recalculateCommission(sale.id);

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

  await recalculateCommission(contractId);

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

/**
 * Record a sale against an agent.
 *
 * The office asked for a button rather than only the automatic route, and both
 * answer the same question from different ends. Usually the agent is named on
 * the contract and the commission appears by itself the moment the first
 * installment lands. Sometimes the contract was written without naming anybody,
 * and somebody has to say afterwards that this sale was theirs.
 *
 * So this takes an apartment that already has a contract, puts the agent on it,
 * and takes the rate for that sale if one was agreed, leaving the agent's own
 * standard rate to apply when it is left empty. The commission line itself is
 * never written here: it is worked out from the contract and the apartment's
 * status, so a sale recorded before the first payment waits, exactly as one
 * that came in the ordinary way would.
 */
export async function recordSale(agentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const contractId = String(formData.get("contractId") ?? "").trim();

  if (!contractId) {
    await flash("said.chooseApartment", "bad");
    revalidatePath(`/agents/${agentId}`);
    return;
  }

  const typed = String(formData.get("rate") ?? "").trim();
  const rate = typed === "" ? null : Number(typed).toFixed(3);

  await db
    .update(contracts)
    .set({ agentId, commissionRate: rate, updatedAt: new Date() })
    .where(eq(contracts.id, contractId));

  await recalculateCommission(contractId);

  await recordAudit({
    action: "commission.sale",
    entity: "contract",
    entityId: contractId,
    detail: `sale recorded for agent ${agentId}${rate ? ` at ${rate}%` : ""}`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saleRecorded");
  revalidatePath(`/agents/${agentId}`);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/commissions");
}

/*
 * The two papers that finish a commission.
 *
 * The office's own words: the commission record is created when the buyer pays,
 * the agent's invoice and the receipt for the money are put on it, and when
 * both are there the commission is completed, meaning the agent has been paid.
 * So these two actions do nothing clever. They file a paper against the line
 * and then ask the line to look at what it now has, which is what decides
 * whether it reads as finished.
 */
export async function uploadCommissionPaper(
  commissionId: string,
  agentId: string,
  kind: "AGENT_INVOICE" | "AGENT_RECEIPT",
  formData: FormData,
) {
  const user = await requireUser(["ADMIN"]);

  /*
   * The slot already says what this paper is, so the form asks for the file and
   * nothing else. That is the difference between two labelled slots and a pile
   * of files: the office does not have to name what it is uploading.
   */
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    await flash("said.noFile", "bad");
    revalidatePath(`/agents/${agentId}`);
    return;
  }

  /* The slot says which paper this is twice, in the binding and in the form
     itself, and the form wins. Two slots side by side on one page is exactly
     where a paper ends up in the wrong one, and an invoice filed as a receipt
     settles a commission that nobody has paid. */
  const said = formData.get("kind");
  const slot: "AGENT_INVOICE" | "AGENT_RECEIPT" =
    said === "AGENT_INVOICE" || said === "AGENT_RECEIPT" ? said : kind;

  const rows = await db.select().from(commissions).where(eq(commissions.id, commissionId)).limit(1);
  if (!rows[0]) throw new Error("Commission not found");

  /*
   * The paper is filed under its own file name, not under the name of the slot.
   * The slot already says what it is, in the heading above it, so titling the
   * document "Invoice from the agent" as well put the same four words twice in
   * the same little box and made a filed paper look like an empty one. The file
   * name is the one thing in there that tells the office which paper it is.
   */
  const named = files[0].name.trim();
  await storeDocuments({
    files: [files[0]],
    title: named || (slot === "AGENT_INVOICE" ? "Invoice from the agent" : "Receipt of payment"),
    category: slot,
    attachTo: { commissionId },
    user,
  });

  const complete = await refreshCommissionPapers(commissionId);

  await recordAudit({
    action: complete ? "commission.completed" : "commission.paper.add",
    entity: "agent",
    entityId: agentId,
    detail: `${commissionId}, ${slot}${complete ? ", both papers in" : ""}`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash(complete ? "said.commissionCompleted" : "said.saved");
  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/commissions");
}

export async function removeCommissionPaper(
  documentId: string,
  commissionId: string,
  agentId: string,
) {
  const user = await requireUser(["ADMIN"]);
  await removeDocument(documentId, user);
  await refreshCommissionPapers(commissionId);

  await recordAudit({
    action: "commission.paper.remove",
    entity: "agent",
    entityId: agentId,
    detail: `${commissionId}, ${documentId}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/agents/${agentId}`);
  revalidatePath("/commissions");
}

/**
 * Getting rid of an agent.
 *
 * Every agent can go, because a record made twice, or made by mistake, has to
 * be able to leave. What goes with them is said in plain words before anybody
 * presses it: their commission lines, the payments recorded against those
 * lines, and the invoices and receipts filed with them. The sales themselves
 * are not touched. A contract belongs to the buyer and the apartment, not to
 * the agent, so it keeps everything it has and simply stops naming anybody,
 * which is exactly what an unclaimed sale is.
 *
 * For an agent who has merely stopped working with us there is still the active
 * switch, which is the better answer: the history stays and they leave the
 * pickers. The page says so. But it is a suggestion now, not a wall.
 */
export async function deleteAgent(agentId: string) {
  const user = await requireUser(["ADMIN"]);

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) return;

  const attached = await whatGoesWithAgent(agentId);

  /* The papers filed against this agent's commission lines go with the lines,
     files and all, rather than being left behind pointing at nothing. */
  const lines = await db
    .select({ id: commissions.id })
    .from(commissions)
    .where(eq(commissions.agentId, agentId));

  if (lines.length > 0) {
    const papers = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        inArray(
          documents.commissionId,
          lines.map((line) => line.id),
        ),
      );
    for (const paper of papers) await removeDocument(paper.id, user);
  }

  await db.delete(commissionPayments).where(eq(commissionPayments.agentId, agentId));
  await db.delete(commissions).where(eq(commissions.agentId, agentId));

  /* The sales they were named on keep their own contracts and simply stop
     naming anybody, which is exactly what an unclaimed sale is. */
  await db.update(contracts).set({ agentId: null }).where(eq(contracts.agentId, agentId));
  await db.update(leads).set({ agentId: null }).where(eq(leads.agentId, agentId));
  await db.update(users).set({ agentId: null }).where(eq(users.agentId, agentId));
  await db.delete(agents).where(eq(agents.id, agentId));

  await recordAudit({
    action: "agent.delete",
    entity: "agent",
    entityId: agentId,
    detail: `${agent.name}, ${attached.commissions} commission lines, ${attached.payments} payments, ${attached.sales.length} sales released`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.deleted");
  revalidatePath("/agents");
  redirect("/agents");
}
