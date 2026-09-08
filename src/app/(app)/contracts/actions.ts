"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  agents,
  changeRequests,
  commissions,
  contractUnits,
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
import { addMonths, buildSchedule, vatOn, type InstallmentPlanItem } from "@/lib/vat";
import {
  getContract,
  lockPaidInstallments,
  recalculateSchedule,
  vatSetupOf,
  vatSummary,
} from "@/lib/contracts";

const detailsSchema = z.object({
  reference: z.string().min(1),
  contractDate: z.string().optional(),
  netPrice: z.string(),
  vatRate: z.string(),
  scheduleType: z.enum(["STANDARD", "PERIODIC"]),
  periodMonths: z.string().optional(),
  notes: z.string().optional(),
});

type LineInput = {
  label: string;
  labelEl?: string | null;
  amount: string;
  dueDate?: string | null;
};

/**
 * What the contract form gets back. A name already in use and a schedule that
 * does not add up are both ordinary mistakes, so they come back as a message on
 * the form rather than as an error page.
 */
export type ContractFormState = { error?: string } | undefined;

class FormError extends Error {}

/** The schedule arrives from the builder as JSON, one entry per installment. */
function readLines(formData: FormData): LineInput[] {
  const raw = String(formData.get("lines") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FormError("The installments could not be read. Try again.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new FormError("A contract needs at least one installment.");
  }
  return parsed.map((entry) => {
    const line = entry as Record<string, unknown>;
    return {
      label: String(line.label ?? "").trim() || "Installment",
      labelEl: line.labelEl ? String(line.labelEl) : null,
      amount: String(line.amount ?? "0"),
      dueDate: line.dueDate ? String(line.dueDate) : null,
    };
  });
}

function planFrom(lines: LineInput[], netCents: number): InstallmentPlanItem[] {
  const amounts = lines.map((l) => toCents(l.amount));
  const sum = amounts.reduce((a, b) => a + b, 0);

  // A euro of slack, so a schedule typed as percentages of an odd price is not
  // rejected over rounding. Anything further out is a mistake worth naming.
  if (Math.abs(sum - netCents) > 100) {
    throw new FormError(
      `The installments add up to ${fromCents(sum)} but the price before VAT is ${fromCents(
        netCents,
      )}. Make them match and save again.`,
    );
  }

  return lines.map((line, i) => ({
    seq: i + 1,
    label: line.label,
    labelEl: line.labelEl ?? null,
    percentage: sum > 0 ? (amounts[i] / sum) * 100 : 100 / lines.length,
    dueDate: line.dueDate ? new Date(line.dueDate) : null,
    locked: false,
  }));
}

async function writeSchedule(
  contractId: string,
  assignmentId: string | null,
  netCents: number,
  rate: number,
  lines: LineInput[],
) {
  const plan = planFrom(lines, netCents);
  const built = buildSchedule({ netCents, rate }, plan);

  await db
    .delete(installments)
    .where(
      assignmentId === null
        ? and(eq(installments.contractId, contractId), isNull(installments.assignmentId))
        : eq(installments.assignmentId, assignmentId),
    );

  await db.insert(installments).values(
    built.map((line) => ({
      contractId,
      assignmentId,
      seq: line.seq,
      label: line.label,
      labelEl: line.labelEl ?? null,
      percentage: line.percentage.toFixed(4),
      netAmount: fromCents(line.netCents),
      vatAmount: fromCents(line.vatCents),
      totalAmount: fromCents(line.totalCents),
      vatRateApplied: line.rateApplied.toFixed(3),
      dueDate: line.dueDate ?? null,
    })),
  );
}

/** The plan of a contract: its own lines, the ones with no apartment on them. */
async function planOf(contractId: string) {
  return db
    .select()
    .from(installments)
    .where(and(eq(installments.contractId, contractId), isNull(installments.assignmentId)))
    .orderBy(asc(installments.seq));
}

/**
 * Space a set of dates out from the month the buyer signed. Month ends are
 * clamped, so the 31st of January plus one month is the 28th of February.
 */
function datesFrom(start: string, everyMonths: number, count: number): (Date | null)[] {
  if (!start) return Array(count).fill(null);
  const from = new Date(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => addMonths(from, i * Math.max(1, everyMonths)));
}

/**
 * Copy the contract's plan onto one apartment.
 *
 * This is what makes the same contract work for two buyers at once: the shape
 * comes from the contract, the dates belong to the apartment, and from here on
 * the two schedules move independently.
 */
async function copyPlanToAssignment(
  contractId: string,
  assignmentId: string,
  dueDates: (Date | null)[] | Map<number, Date | null>,
) {
  const plan = await planOf(contractId);
  if (plan.length === 0) return;

  await db.delete(installments).where(eq(installments.assignmentId, assignmentId));

  await db.insert(installments).values(
    plan.map((line, i) => ({
      contractId,
      assignmentId,
      seq: line.seq,
      label: line.label,
      labelEl: line.labelEl,
      percentage: line.percentage,
      netAmount: line.netAmount,
      vatAmount: line.vatAmount,
      totalAmount: line.totalAmount,
      vatRateApplied: line.vatRateApplied,
      dueDate: dueDates instanceof Map ? (dueDates.get(line.seq) ?? null) : (dueDates[i] ?? null),
    })),
  );
}

async function referenceIsFree(reference: string, exceptId?: string) {
  const rows = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      exceptId
        ? and(eq(contracts.reference, reference), ne(contracts.id, exceptId))
        : eq(contracts.reference, reference),
    )
    .limit(1);
  return rows.length === 0;
}

/** Read and check the schedule, turning a foreseeable mistake into a message. */
function validated(formData: FormData, netCents: number): LineInput[] | { error: string } {
  try {
    const lines = readLines(formData);
    planFrom(lines, netCents);
    return lines;
  } catch (error) {
    if (error instanceof FormError) return { error: error.message };
    throw error;
  }
}

export async function createContract(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = detailsSchema.parse({
    reference: formData.get("reference"),
    contractDate: formData.get("contractDate") || undefined,
    netPrice: String(formData.get("netPrice") ?? "0"),
    vatRate: String(formData.get("vatRate") ?? "5"),
    scheduleType: formData.get("scheduleType") || "STANDARD",
    periodMonths: formData.get("periodMonths") || undefined,
    notes: formData.get("notes") || undefined,
  });

  const reference = parsed.reference.trim();
  if (!(await referenceIsFree(reference))) {
    return {
      error: `There is already a contract called ${reference}. Give this one a different name.`,
    };
  }

  const netCents = toCents(parsed.netPrice);
  const rate = Number(parsed.vatRate);

  const checked = validated(formData, netCents);
  if ("error" in checked) return checked;

  const inserted = await db
    .insert(contracts)
    .values({
      reference,
      contractDate: parsed.contractDate ? new Date(parsed.contractDate) : null,
      netPrice: fromCents(netCents),
      vatRate: rate.toFixed(3),
      scheduleType: parsed.scheduleType,
      periodMonths: parsed.periodMonths ? Number(parsed.periodMonths) : null,
      status: "ACTIVE",
      notes: parsed.notes || null,
    })
    .returning({ id: contracts.id });

  const contractId = inserted[0].id;
  await writeSchedule(contractId, null, netCents, rate, checked);

  await recordAudit({
    action: "contract.create",
    entity: "contract",
    entityId: contractId,
    detail: `${reference}, ${vatSummary({ netCents, rate })}, ${checked.length} installments`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/contracts");
  redirect(`/contracts/${contractId}`);
}

/**
 * Edit a contract. The price and the VAT rate flow into the installments that
 * are still open; anything with a receipt against it keeps its figures. The
 * installments themselves can be rewritten as long as nothing is paid yet.
 */
export async function updateContract(
  contractId: string,
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const user = await requireUser(["ADMIN"]);
  const before = await getContract(contractId);
  if (!before) return { error: "Contract not found" };

  const parsed = detailsSchema.parse({
    reference: formData.get("reference"),
    contractDate: formData.get("contractDate") || undefined,
    netPrice: String(formData.get("netPrice") ?? "0"),
    vatRate: String(formData.get("vatRate") ?? "5"),
    scheduleType: formData.get("scheduleType") || "STANDARD",
    periodMonths: formData.get("periodMonths") || undefined,
    notes: formData.get("notes") || undefined,
  });

  const reference = parsed.reference.trim();
  if (!(await referenceIsFree(reference, contractId))) {
    return {
      error: `There is already a contract called ${reference}. Give this one a different name.`,
    };
  }

  const netCents = toCents(parsed.netPrice);
  const rate = Number(parsed.vatRate);
  const status = String(formData.get("status") ?? before.contract.status) as
    "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

  // The plan takes no payments, so it can always be rewritten. What it cannot do
  // is disturb an apartment that has already received money.
  const anythingPaid = before.assignments.some((a) => !a.open);
  const checked = validated(formData, netCents);
  if ("error" in checked) return checked;

  await db
    .update(contracts)
    .set({
      reference,
      contractDate: parsed.contractDate ? new Date(parsed.contractDate) : null,
      netPrice: fromCents(netCents),
      vatRate: rate.toFixed(3),
      scheduleType: parsed.scheduleType,
      periodMonths: parsed.periodMonths ? Number(parsed.periodMonths) : null,
      status,
      notes: parsed.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  await writeSchedule(contractId, null, netCents, rate, checked);

  // An apartment with nothing receipted follows the new plan, keeping the dates
  // it already had. One with payments against it keeps its own lines, and only
  // has the price and the rate moved onto what is still open.
  for (const a of before.assignments) {
    if (!a.open) continue;
    const dates = new Map(a.lines.map((l) => [l.seq, l.dueDate] as [number, Date | null]));
    await copyPlanToAssignment(contractId, a.assignment.id, dates);
  }

  await recalculateSchedule(contractId, user, "contract.update");

  const summaryBefore = vatSummary(before.vatSetup);
  const summaryAfter = vatSummary({ netCents, rate });
  if (summaryBefore !== summaryAfter) {
    await db.insert(vatChanges).values({
      contractId,
      changedByEmail: user.email,
      fromSummary: summaryBefore,
      toSummary: summaryAfter,
      appliedToSeqs: anythingPaid ? "the open installments" : "the whole schedule",
    });
  }

  for (const assignment of before.assignments) {
    await syncCommission(assignment.assignment.id);
  }

  await recordAudit({
    action: "contract.update",
    entity: "contract",
    entityId: contractId,
    detail: `${reference}, ${summaryAfter}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);
  redirect(`/contracts/${contractId}`);
}

export async function deleteContract(contractId: string) {
  const user = await requireUser(["ADMIN"]);
  const detail = await getContract(contractId);
  if (!detail) return;

  for (const a of detail.assignments) {
    await releaseUnit(a.unit.id, a.assignment.clientId);
  }

  await db.delete(contracts).where(eq(contracts.id, contractId));

  await recordAudit({
    action: "contract.delete",
    entity: "contract",
    entityId: contractId,
    detail: detail.contract.reference,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/contracts");
  redirect("/contracts");
}

/** An apartment with no contract on it is available again, or still reserved. */
async function releaseUnit(unitId: string, clientId: string | null) {
  await db
    .update(units)
    .set({ status: clientId ? "RESERVED" : "AVAILABLE", updatedAt: new Date() })
    .where(eq(units.id, unitId));
}

/**
 * Put an apartment on this contract. The buyer comes from the apartment, since
 * that is where the office records who has taken it.
 */
export async function assignApartment(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const unitId = String(formData.get("unitId") ?? "");
  const agentId = String(formData.get("agentId") ?? "") || null;
  const startDate = String(formData.get("startDate") ?? "");
  const everyMonths = Number(String(formData.get("everyMonths") ?? "1")) || 1;
  if (!unitId) throw new Error("Choose an apartment first.");

  const taken = await db
    .select({ id: contractUnits.id })
    .from(contractUnits)
    .where(eq(contractUnits.unitId, unitId))
    .limit(1);
  if (taken[0]) throw new Error("That apartment is already on a contract.");

  const found = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  const unit = found[0];
  if (!unit) throw new Error("Apartment not found");

  const inserted = await db
    .insert(contractUnits)
    .values({ contractId, unitId, clientId: unit.clientId, agentId })
    .returning({ id: contractUnits.id });

  // The apartment takes its own copy of the plan, dated from the month this
  // buyer signed, and moves at its own pace from here on.
  const plan = await planOf(contractId);
  await copyPlanToAssignment(
    contractId,
    inserted[0].id,
    datesFrom(startDate, everyMonths, plan.length),
  );

  await db.update(units).set({ status: "SOLD", updatedAt: new Date() }).where(eq(units.id, unitId));

  await syncCommission(inserted[0].id);

  await recordAudit({
    action: "contract.assign",
    entity: "contract",
    entityId: contractId,
    detail: `apartment ${unit.code}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
}

export async function removeAssignment(assignmentId: string, contractId: string) {
  const user = await requireUser(["ADMIN"]);
  const rows = await db
    .select()
    .from(contractUnits)
    .where(eq(contractUnits.id, assignmentId))
    .limit(1);
  const assignment = rows[0];
  if (!assignment) return;

  const paidRows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.assignmentId, assignmentId))
    .limit(1);
  if (paidRows[0]) {
    throw new Error(
      "That apartment has payments recorded against this contract. Remove the payments first.",
    );
  }

  await db.delete(contractUnits).where(eq(contractUnits.id, assignmentId));
  await releaseUnit(assignment.unitId, assignment.clientId);

  await recordAudit({
    action: "contract.unassign",
    entity: "contract",
    entityId: contractId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
}

/** The buyer and the agent of one apartment on the contract. */
export async function updateAssignment(
  assignmentId: string,
  contractId: string,
  formData: FormData,
) {
  await requireUser(["ADMIN"]);
  const clientId = String(formData.get("clientId") ?? "") || null;
  const agentId = String(formData.get("agentId") ?? "") || null;

  const rows = await db
    .select()
    .from(contractUnits)
    .where(eq(contractUnits.id, assignmentId))
    .limit(1);
  if (!rows[0]) throw new Error("Assignment not found");

  await db
    .update(contractUnits)
    .set({ clientId, agentId, updatedAt: new Date() })
    .where(eq(contractUnits.id, assignmentId));

  // The apartment belongs to whoever the contract says it does.
  await db
    .update(units)
    .set({ clientId, updatedAt: new Date() })
    .where(eq(units.id, rows[0].unitId));

  await syncCommission(assignmentId);

  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/clients");
}

export async function recordPayment(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const assignmentId = String(formData.get("assignmentId") ?? "") || null;
  const installmentId = String(formData.get("installmentId") ?? "") || null;
  const amountCents = toCents(String(formData.get("amount") ?? "0"));
  const paidOn = String(formData.get("paidOn") ?? "");

  if (amountCents <= 0) throw new Error("The amount must be more than zero.");
  if (!assignmentId) throw new Error("Choose which apartment paid.");

  // The installment has to be one of that apartment's own lines.
  if (installmentId) {
    const [line] = await db
      .select({ assignmentId: installments.assignmentId })
      .from(installments)
      .where(eq(installments.id, installmentId))
      .limit(1);
    if (!line || line.assignmentId !== assignmentId) {
      throw new Error("That installment belongs to another apartment.");
    }
  }

  await db.insert(payments).values({
    contractId,
    assignmentId,
    installmentId,
    amount: fromCents(amountCents),
    paidOn: paidOn ? new Date(paidOn) : new Date(),
    method: String(formData.get("method") ?? "") || null,
    receiptNumber: String(formData.get("receiptNumber") ?? "") || null,
    notes: String(formData.get("notes") ?? "") || null,
    recordedById: user.id,
  });

  await lockPaidInstallments(contractId);

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

export async function deletePayment(paymentId: string, contractId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.delete(payments).where(eq(payments.id, paymentId));
  await lockPaidInstallments(contractId);

  await recordAudit({
    action: "payment.delete",
    entity: "contract",
    entityId: contractId,
    detail: `payment ${paymentId}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}

/**
 * Edit one line of one apartment's schedule: its name, its date, its amount.
 *
 * Only this apartment is touched. The VAT is worked out again at the contract's
 * rate, and the percentage follows the amount, so the line stays honest even
 * when the office adjusts it for one buyer alone.
 */
export async function updateLine(installmentId: string, contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const rows = await db
    .select()
    .from(installments)
    .where(eq(installments.id, installmentId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Installment not found");

  const contractRows = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1);
  const contract = contractRows[0];
  if (!contract) throw new Error("Contract not found");

  const [paidHere] = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.installmentId, installmentId))
    .limit(1);

  const dueDate = String(formData.get("dueDate") ?? "");
  const label = String(formData.get("label") ?? row.label) || row.label;
  const amountField = formData.get("amount");

  // A line with a receipt against it keeps the figures it was invoiced at.
  if (paidHere || row.lockedAt !== null) {
    await db
      .update(installments)
      .set({ label, dueDate: dueDate ? new Date(dueDate) : null, updatedAt: new Date() })
      .where(eq(installments.id, installmentId));
  } else {
    const netCents = amountField === null ? toCents(row.netAmount) : toCents(String(amountField));
    const rate = Number(contract.vatRate);
    const vatCents = vatOn(netCents, rate);
    const contractNet = toCents(contract.netPrice);

    await db
      .update(installments)
      .set({
        label,
        dueDate: dueDate ? new Date(dueDate) : null,
        netAmount: fromCents(netCents),
        vatAmount: fromCents(vatCents),
        totalAmount: fromCents(netCents + vatCents),
        vatRateApplied: rate.toFixed(3),
        percentage: (contractNet > 0 ? (netCents / contractNet) * 100 : 0).toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(installments.id, installmentId));
  }

  await recordAudit({
    action: "installment.update",
    entity: "installment",
    entityId: installmentId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}

/** One more line on this apartment's schedule, for whatever the deal needs. */
export async function addLine(assignmentId: string, contractId: string) {
  const user = await requireUser(["ADMIN"]);
  const rows = await db
    .select()
    .from(installments)
    .where(eq(installments.assignmentId, assignmentId))
    .orderBy(asc(installments.seq));

  const nextSeq = rows.reduce((highest, l) => Math.max(highest, l.seq), 0) + 1;

  await db.insert(installments).values({
    contractId,
    assignmentId,
    seq: nextSeq,
    label: `Installment ${nextSeq}`,
    percentage: "0.0000",
    netAmount: "0.00",
    vatAmount: "0.00",
    totalAmount: "0.00",
    vatRateApplied: "0.000",
  });

  await recordAudit({
    action: "installment.add",
    entity: "contract",
    entityId: contractId,
    detail: `apartment schedule now has ${rows.length + 1} lines`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}

export async function removeLine(installmentId: string, contractId: string) {
  const user = await requireUser(["ADMIN"]);
  const [paidHere] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.installmentId, installmentId))
    .limit(1);
  if (paidHere) {
    throw new Error("That installment has a payment against it. Remove the payment first.");
  }

  await db.delete(installments).where(eq(installments.id, installmentId));

  await recordAudit({
    action: "installment.delete",
    entity: "contract",
    entityId: contractId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}

/**
 * Date this apartment's schedule from the month the buyer signed.
 * Lines that have already been receipted keep the dates they were invoiced on.
 */
export async function setDates(assignmentId: string, contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const start = String(formData.get("startDate") ?? "");
  const everyMonths = Number(String(formData.get("everyMonths") ?? "1")) || 1;
  if (!start) throw new Error("Give the date of the first payment.");

  const rows = await db
    .select()
    .from(installments)
    .where(eq(installments.assignmentId, assignmentId))
    .orderBy(asc(installments.seq));

  const dates = datesFrom(start, everyMonths, rows.length);

  for (const [i, row] of rows.entries()) {
    const [paidHere] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.installmentId, row.id))
      .limit(1);
    if (paidHere) continue;
    await db
      .update(installments)
      .set({ dueDate: dates[i] ?? null, updatedAt: new Date() })
      .where(eq(installments.id, row.id));
  }

  await recordAudit({
    action: "installment.dates",
    entity: "contract",
    entityId: contractId,
    detail: `from ${start}, every ${everyMonths} month(s)`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
}

/** Copy the contract's plan onto this apartment again, from a fresh start date. */
export async function resetToPlan(assignmentId: string, contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const start = String(formData.get("startDate") ?? "");
  const everyMonths = Number(String(formData.get("everyMonths") ?? "1")) || 1;

  const [paidHere] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.assignmentId, assignmentId))
    .limit(1);
  if (paidHere) {
    throw new Error(
      "This apartment has payments against it, so its schedule cannot be replaced. Edit the lines that are still open instead.",
    );
  }

  const plan = await planOf(contractId);
  await copyPlanToAssignment(contractId, assignmentId, datesFrom(start, everyMonths, plan.length));

  await recordAudit({
    action: "installment.reset",
    entity: "contract",
    entityId: contractId,
    detail: `apartment schedule rebuilt from the plan`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
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
    "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "COMPLETED";

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

/**
 * Keep the agent commission of one sale in step with the contract price and the
 * rate. The sale is the apartment on the contract, so a contract on three
 * apartments earns three commissions.
 */
export async function syncCommission(assignmentId: string) {
  const rows = await db
    .select({ assignment: contractUnits, contract: contracts })
    .from(contractUnits)
    .innerJoin(contracts, eq(contracts.id, contractUnits.contractId))
    .where(eq(contractUnits.id, assignmentId))
    .limit(1);
  const row = rows[0];
  if (!row) return;

  const existing = await db
    .select()
    .from(commissions)
    .where(eq(commissions.assignmentId, assignmentId))
    .limit(1);

  if (!row.assignment.agentId) {
    if (existing[0]) await db.delete(commissions).where(eq(commissions.id, existing[0].id));
    return;
  }

  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.id, row.assignment.agentId))
    .limit(1);

  const rate = Number(row.assignment.commissionRate ?? agentRows[0]?.commissionRate ?? 0);
  const baseCents = toCents(row.contract.netPrice);
  const amountCents = Math.round((baseCents * rate) / 100);

  if (existing[0]) {
    await db
      .update(commissions)
      .set({
        agentId: row.assignment.agentId,
        baseAmount: fromCents(baseCents),
        rate: rate.toFixed(3),
        amount: fromCents(amountCents),
        updatedAt: new Date(),
      })
      .where(eq(commissions.id, existing[0].id));
    return;
  }

  await db.insert(commissions).values({
    assignmentId,
    agentId: row.assignment.agentId,
    baseAmount: fromCents(baseCents),
    rate: rate.toFixed(3),
    amount: fromCents(amountCents),
  });
}
