"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  changeRequests,
  commissions,
  contracts,
  installments,
  payments,
  units,
  vatChanges,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { readUploadFields, removeDocument, storeDocuments } from "@/lib/uploads";
import { fromCents, toCents } from "@/lib/money";
import { DEFAULT_STAGES, buildSchedule, singleRateSetup, type VatSetup } from "@/lib/vat";
import {
  getContract,
  recalculateSchedule,
  refreshInstallmentStatuses,
  vatSummary,
} from "@/lib/contracts";

const createSchema = z.object({
  unitId: z.string().min(1),
  clientId: z.string().min(1),
  agentId: z.string().optional(),
  reference: z.string().optional(),
  contractDate: z.string().optional(),
  netPrice: z.string(),
  vatMode: z.enum(["single_reduced", "single_standard", "split"]),
  reducedBase: z.string().optional(),
  reducedRate: z.string().optional(),
  standardBase: z.string().optional(),
  standardRate: z.string().optional(),
});

function setupFrom(input: {
  netCents: number;
  vatMode: "single_reduced" | "single_standard" | "split";
  reducedBase?: string;
  reducedRate?: string;
  standardBase?: string;
  standardRate?: string;
}): VatSetup {
  const reducedRate = Number(input.reducedRate ?? 5);
  const standardRate = Number(input.standardRate ?? 19);

  if (input.vatMode === "single_reduced") {
    return { ...singleRateSetup(input.netCents, reducedRate, true), standardRate };
  }
  if (input.vatMode === "single_standard") {
    return { ...singleRateSetup(input.netCents, standardRate, false), reducedRate };
  }

  const reducedBaseCents = toCents(input.reducedBase ?? "0");
  const standardBaseCents = input.standardBase
    ? toCents(input.standardBase)
    : input.netCents - reducedBaseCents;

  return {
    netCents: input.netCents,
    reducedBaseCents,
    reducedRate,
    standardBaseCents,
    standardRate,
  };
}

export async function createContract(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = createSchema.parse({
    unitId: formData.get("unitId"),
    clientId: formData.get("clientId"),
    agentId: formData.get("agentId") || undefined,
    reference: formData.get("reference") || undefined,
    contractDate: formData.get("contractDate") || undefined,
    netPrice: String(formData.get("netPrice") ?? "0"),
    vatMode: formData.get("vatMode") || "single_reduced",
    reducedBase: formData.get("reducedBase") || undefined,
    reducedRate: formData.get("reducedRate") || undefined,
    standardBase: formData.get("standardBase") || undefined,
    standardRate: formData.get("standardRate") || undefined,
  });

  const netCents = toCents(parsed.netPrice);
  const setup = setupFrom({ netCents, ...parsed });

  if (setup.reducedBaseCents + setup.standardBaseCents !== netCents) {
    throw new Error(
      "The two VAT bases must add up to the price before VAT. Check the amounts and try again.",
    );
  }

  const reference =
    parsed.reference?.trim() ||
    `C-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const inserted = await db
    .insert(contracts)
    .values({
      reference,
      unitId: parsed.unitId,
      clientId: parsed.clientId,
      agentId: parsed.agentId || null,
      contractDate: parsed.contractDate ? new Date(parsed.contractDate) : null,
      netPrice: fromCents(netCents),
      status: "ACTIVE",
      vatBaseReduced: fromCents(setup.reducedBaseCents),
      vatRateReduced: setup.reducedRate.toFixed(3),
      vatBaseStandard: fromCents(setup.standardBaseCents),
      vatRateStandard: setup.standardRate.toFixed(3),
    })
    .returning({ id: contracts.id });

  const contractId = inserted[0].id;

  // Starting schedule. The office can rename stages and set due dates afterwards.
  const plan = DEFAULT_STAGES.map((s, i) => ({
    seq: i + 1,
    label: s.label,
    percentage: s.percentage,
    locked: false,
  }));
  const lines = buildSchedule(setup, plan);

  await db.insert(installments).values(
    lines.map((line, i) => ({
      contractId,
      seq: line.seq,
      label: line.label,
      labelEl: DEFAULT_STAGES[i]?.labelEl ?? null,
      percentage: line.percentage.toFixed(4),
      netAmount: fromCents(line.netCents),
      vatAmount: fromCents(line.vatCents),
      totalAmount: fromCents(line.totalCents),
      vatRateApplied: line.rateApplied.toFixed(3),
    })),
  );

  // A contract means the apartment belongs to this client and is sold.
  await db
    .update(units)
    .set({ status: "SOLD", clientId: parsed.clientId, updatedAt: new Date() })
    .where(eq(units.id, parsed.unitId));

  if (parsed.agentId) {
    await syncCommission(contractId);
  }

  await recordAudit({
    action: "contract.create",
    entity: "contract",
    entityId: contractId,
    detail: `${reference}, ${fromCents(netCents)} net, ${vatSummary(setup)}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/contracts");
  redirect(`/contracts/${contractId}`);
}

/**
 * Change the price or the VAT of a contract.
 * The new rate is applied to the installments that are still open. Anything with
 * a payment against it keeps the figures it was invoiced at.
 */
export async function updateVat(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const before = await getContract(contractId);
  if (!before) throw new Error("Contract not found");

  const netCents = toCents(String(formData.get("netPrice") ?? before.contract.netPrice));
  const mode = String(formData.get("vatMode") ?? "split") as
    | "single_reduced"
    | "single_standard"
    | "split";

  const setup = setupFrom({
    netCents,
    vatMode: mode,
    reducedBase: String(formData.get("reducedBase") ?? ""),
    reducedRate: String(formData.get("reducedRate") ?? ""),
    standardBase: String(formData.get("standardBase") ?? ""),
    standardRate: String(formData.get("standardRate") ?? ""),
  });

  if (setup.reducedBaseCents + setup.standardBaseCents !== netCents) {
    throw new Error(
      "The two VAT bases must add up to the price before VAT. Check the amounts and try again.",
    );
  }

  await db
    .update(contracts)
    .set({
      netPrice: fromCents(netCents),
      vatBaseReduced: fromCents(setup.reducedBaseCents),
      vatRateReduced: setup.reducedRate.toFixed(3),
      vatBaseStandard: fromCents(setup.standardBaseCents),
      vatRateStandard: setup.standardRate.toFixed(3),
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  const { openSeqs } = await recalculateSchedule(contractId, user, "contract.vat.change");

  await db.insert(vatChanges).values({
    contractId,
    changedByEmail: user.email,
    fromSummary: vatSummary(before.vatSetup),
    toSummary: vatSummary(setup),
    appliedToSeqs: openSeqs.length > 0 ? openSeqs.join(", ") : "none",
  });

  await syncCommission(contractId);
  revalidatePath(`/contracts/${contractId}`);
}

export async function recordPayment(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const installmentId = String(formData.get("installmentId") ?? "") || null;
  const amountCents = toCents(String(formData.get("amount") ?? "0"));
  const paidOn = String(formData.get("paidOn") ?? "");

  if (amountCents <= 0) throw new Error("The amount must be more than zero.");

  await db.insert(payments).values({
    contractId,
    installmentId,
    amount: fromCents(amountCents),
    paidOn: paidOn ? new Date(paidOn) : new Date(),
    method: String(formData.get("method") ?? "") || null,
    receiptNumber: String(formData.get("receiptNumber") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
    recordedById: user.id,
  });

  await refreshInstallmentStatuses(contractId);

  await recordAudit({
    action: "payment.record",
    entity: "contract",
    entityId: contractId,
    detail: `${fromCents(amountCents)} against installment ${installmentId ?? "unassigned"}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}

export async function updateInstallment(installmentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const rows = await db.select().from(installments).where(eq(installments.id, installmentId)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("Installment not found");

  const dueDate = String(formData.get("dueDate") ?? "");
  await db
    .update(installments)
    .set({
      label: String(formData.get("label") ?? row.label) || row.label,
      dueDate: dueDate ? new Date(dueDate) : null,
      updatedAt: new Date(),
    })
    .where(eq(installments.id, installmentId));

  await recordAudit({
    action: "installment.update",
    entity: "installment",
    entityId: installmentId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${row.contractId}`);
}

export async function addChangeRequest(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const costImpact = String(formData.get("costImpact") ?? "");

  const inserted = await db
    .insert(changeRequests)
    .values({
      contractId,
      title: String(formData.get("title") ?? "").trim() || "Change request",
      description: String(formData.get("description") ?? "") || null,
      costImpact: costImpact ? fromCents(toCents(costImpact)) : null,
    })
    .returning({ id: changeRequests.id });

  // The PDF of what the buyer asked for is the point of this record, so it is
  // attached to the request itself and kept for ever.
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > 0) {
    await storeDocuments({
      files,
      title: String(formData.get("title") ?? "").trim() || "Change request",
      category: "CHANGE_REQUEST",
      attachTo: { contractId, changeRequestId: inserted[0].id },
      user,
    });
  }

  await recordAudit({
    action: "changeRequest.create",
    entity: "contract",
    entityId: contractId,
    detail: `${files.length} file(s) attached`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}

export async function uploadContractDocuments(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const { files, title, category } = readUploadFields(formData);
  await storeDocuments({ files, title, category, attachTo: { contractId }, user });
  revalidatePath(`/contracts/${contractId}`);
}

export async function deleteContractDocument(documentId: string, contractId: string) {
  const user = await requireUser(["ADMIN"]);
  await removeDocument(documentId, user);
  revalidatePath(`/contracts/${contractId}`);
}

export async function setChangeRequestStatus(
  changeRequestId: string,
  contractId: string,
  formData: FormData,
) {
  const user = await requireUser(["ADMIN"]);
  const status = String(formData.get("status") ?? "SUBMITTED") as
    | "SUBMITTED"
    | "IN_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "COMPLETED";

  await db
    .update(changeRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(changeRequests.id, changeRequestId));

  await recordAudit({
    action: "changeRequest.status",
    entity: "changeRequest",
    entityId: changeRequestId,
    detail: status,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}

/** Keep the agent commission in step with the contract price and rate. */
export async function syncCommission(contractId: string) {
  const detail = await getContract(contractId);
  if (!detail || !detail.contract.agentId || !detail.agent) return;

  const rate = Number(detail.contract.commissionRate ?? detail.agent.commissionRate ?? 0);
  const baseCents = toCents(detail.contract.netPrice);
  const amountCents = Math.round((baseCents * rate) / 100);

  const existing = await db
    .select()
    .from(commissions)
    .where(eq(commissions.contractId, contractId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(commissions)
      .set({
        baseAmount: fromCents(baseCents),
        rate: rate.toFixed(3),
        amount: fromCents(amountCents),
        updatedAt: new Date(),
      })
      .where(eq(commissions.id, existing[0].id));
    return;
  }

  await db.insert(commissions).values({
    contractId,
    agentId: detail.contract.agentId,
    baseAmount: fromCents(baseCents),
    rate: rate.toFixed(3),
    amount: fromCents(amountCents),
  });
}

export async function setContractCommissionRate(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const raw = String(formData.get("commissionRate") ?? "").trim();
  await db
    .update(contracts)
    .set({ commissionRate: raw === "" ? null : Number(raw).toFixed(3), updatedAt: new Date() })
    .where(eq(contracts.id, contractId));

  await syncCommission(contractId);

  await recordAudit({
    action: "contract.commissionRate.change",
    entity: "contract",
    entityId: contractId,
    detail: raw === "" ? "cleared, falls back to the agent rate" : `${raw}%`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}
