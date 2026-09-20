"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  changeRequests,
  contracts,
  contractUnits,
  documents,
  installments,
  payments,
  units,
  vatChanges,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { removeDocument, storeChosenDocuments, storeDocuments } from "@/lib/uploads";
import { fromCents, toCents } from "@/lib/money";
import {
  addMonths,
  buildSchedule,
  stageFromAnyLanguage,
  vatOn,
  type InstallmentPlanItem,
} from "@/lib/vat";
import {
  getContract,
  lockPaidInstallments,
  recalculateSchedule,
  vatSummary,
} from "@/lib/contracts";
import { followTheApartments, followTheMoney } from "@/lib/statuses";
import { recalculateCommission } from "@/lib/commissions";

const detailsSchema = z.object({
  reference: z.string().min(1),
  /** A sale, or land given in exchange for apartments. */
  kind: z.enum(["SALE", "LAND_EXCHANGE"]).default("SALE"),
  /** Money alongside the apartments, in either direction. */
  cashAmount: z.string().optional(),
  /** The figure the deed states, when it is not the value of the agreement. */
  contractValue: z.string().optional(),
  /* What a land exchange is made of, and nothing a sale ever carries. */
  plotDescription: z.string().optional(),
  plotReference: z.string().optional(),
  plotArea: z.string().optional(),
  sharePercent: z.string().optional(),
  /**
   * A sale names one apartment. A land exchange names none here: the owner's
   * apartments are their own lines, because their share is rarely one.
   */
  unitId: z.string().optional(),
  clientId: z.string().min(1),
  agentId: z.string().optional(),
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
 * What the contract form gets back. A name already in use, an apartment already
 * sold and a schedule that does not add up are ordinary mistakes, so they come
 * back as a message on the form rather than as an error page.
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

/**
 * Read and check the schedule, turning a foreseeable mistake into a message.
 *
 * A land exchange is allowed to have no schedule at all, which is the normal
 * case: the owner of the plot is paid in apartments, so there are no
 * installments to collect and insisting on some that add up to the contract
 * value would be asking the office to invent them. A schedule typed in anyway,
 * for cash paid in stages, is checked exactly as a sale's would be.
 */
function validated(
  formData: FormData,
  netCents: number,
  scheduleOptional = false,
): LineInput[] | { error: string } {
  try {
    const lines = readLines(formData);
    /*
      The form offers the usual stages with their amounts blank, so "no
      schedule" arrives as a set of lines worth nothing rather than as no lines
      at all. Either shape means the same thing here.
    */
    if (scheduleOptional && !lines.some((line) => toCents(line.amount) > 0)) return [];
    planFrom(lines, netCents);
    return lines;
  } catch (error) {
    if (error instanceof FormError) return { error: error.message };
    throw error;
  }
}

async function writeSchedule(
  contractId: string,
  netCents: number,
  rate: number,
  lines: LineInput[],
) {
  await db.delete(installments).where(eq(installments.contractId, contractId));

  /* No lines is a real answer, not an empty one: a land exchange collects
     nothing by installments. */
  if (lines.length === 0) return;

  const built = buildSchedule({ netCents, rate }, planFrom(lines, netCents));

  await db.insert(installments).values(
    built.map((line) => ({
      contractId,
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

/**
 * Space a set of dates out from the month the buyer signed. Month ends are
 * clamped, so the 31st of January plus one month is the 28th of February.
 */
function datesFrom(start: string, everyMonths: number, count: number): (Date | null)[] {
  if (!start) return Array(count).fill(null);
  const from = new Date(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => addMonths(from, i * Math.max(1, everyMonths)));
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

async function unitIsFree(unitId: string | undefined, exceptId?: string) {
  if (!unitId) return true;
  const rows = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(
      exceptId
        ? and(eq(contracts.unitId, unitId), ne(contracts.id, exceptId))
        : eq(contracts.unitId, unitId),
    )
    .limit(1);
  return rows.length === 0;
}

function readDetails(formData: FormData) {
  return detailsSchema.parse({
    reference: formData.get("reference"),
    kind: formData.get("kind") || "SALE",
    cashAmount: formData.get("cashAmount") || undefined,
    contractValue: formData.get("contractValue") || undefined,
    plotDescription: formData.get("plotDescription") || undefined,
    plotReference: formData.get("plotReference") || undefined,
    plotArea: formData.get("plotArea") || undefined,
    sharePercent: formData.get("sharePercent") || undefined,
    unitId: formData.get("unitId") || undefined,
    clientId: formData.get("clientId"),
    agentId: formData.get("agentId") || undefined,
    contractDate: formData.get("contractDate") || undefined,
    netPrice: String(formData.get("netPrice") ?? "0"),
    vatRate: String(formData.get("vatRate") ?? "5"),
    scheduleType: formData.get("scheduleType") || "STANDARD",
    periodMonths: formData.get("periodMonths") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

/**
 * Everything about a contract is also on its buyer's profile.
 *
 * The profile is where the office works now, so a payment, an adjustment or a
 * document recorded here has to appear there as well, immediately. Asking the
 * router to redraw is not enough on its own: the page has to be marked as
 * changed, or the redraw is served the same answer as before. So every action
 * that touches a contract marks the buyer's page too, and the office never
 * meets a screen that is a few seconds behind the truth.
 */
async function alsoTheBuyer(contractId: string) {
  const [row] = await db
    .select({ clientId: contracts.clientId })
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1);

  if (row?.clientId) revalidatePath(`/clients/${row.clientId}`);
  revalidatePath("/clients");
}

/**

 *
 * A contract on its own reserves the apartment rather than selling it, because
 * the office counts an apartment as sold once the first installment has come
 * in. That is what followTheMoney does the moment a payment is recorded, so
 * this only has to get the buyer and the reservation right.
 */
async function takeUnit(unitId: string | undefined, clientId: string) {
  if (!unitId) return;
  const rows = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  const already = rows[0];

  await db
    .update(units)
    .set({
      status: already && already.status !== "AVAILABLE" ? already.status : "RESERVED",
      clientId,
      updatedAt: new Date(),
    })
    .where(eq(units.id, unitId));
}

/**
 * The apartment's price is whatever its contract says it went for.
 *
 * Before a contract exists the price is the office's asking price, typed on the
 * apartment. Once there is one, the contract is the agreement and the apartment
 * follows it: the price before VAT and the cash beside it added together, which
 * is the figure a buyer would call the price. Two places holding two different
 * answers to the same question is how a price list and a contract end up
 * disagreeing in front of a buyer.
 */
async function priceTheUnit(
  unitId: string | undefined,
  netPrice: string,
  cashAmount: string | null,
) {
  if (!unitId) return;
  const together = toCents(netPrice) + toCents(cashAmount ?? "0");

  await db
    .update(units)
    .set({ netPrice: fromCents(together), updatedAt: new Date() })
    .where(eq(units.id, unitId));
}

/** An apartment with no contract on it is available again, or still reserved. */
async function releaseUnit(unitId: string | undefined) {
  if (!unitId) return;
  const rows = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  if (!rows[0]) return;
  await db
    .update(units)
    .set({ status: rows[0].clientId ? "RESERVED" : "AVAILABLE", updatedAt: new Date() })
    .where(eq(units.id, unitId));
}

/**
 * The apartments a landowner receives, kept in step with what was ticked.
 *
 * Written as the whole answer rather than as a difference: whatever is on the
 * form now is what the agreement says now. An apartment taken off goes back to
 * being free unless somebody else holds it, and one added is marked as the
 * owner's, so the development's list and the owner's own profile tell the same
 * story without anybody updating them separately.
 */
async function setLandExchangeUnits(contractId: string, clientId: string, wanted: string[]) {
  const before = await db
    .select({ unitId: contractUnits.unitId })
    .from(contractUnits)
    .where(eq(contractUnits.contractId, contractId));

  const had = new Set(before.map((row) => row.unitId));
  const now = new Set(wanted);

  for (const unitId of had) {
    if (now.has(unitId)) continue;
    await db
      .delete(contractUnits)
      .where(and(eq(contractUnits.contractId, contractId), eq(contractUnits.unitId, unitId)));
    await db
      .update(units)
      .set({ clientId: null, status: "AVAILABLE", updatedAt: new Date() })
      .where(and(eq(units.id, unitId), eq(units.clientId, clientId)));
  }

  for (const unitId of now) {
    if (!had.has(unitId)) {
      await db.insert(contractUnits).values({ contractId, unitId });
    }
    await takeUnit(unitId, clientId);
  }
}

export async function createContract(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = readDetails(formData);

  const reference = parsed.reference.trim();
  if (!(await referenceIsFree(reference))) {
    return {
      error: `There is already a contract called ${reference}. Give this one a different name.`,
    };
  }
  if (!(await unitIsFree(parsed.unitId))) {
    return { error: "That apartment already has a contract. Choose another one." };
  }

  const netCents = toCents(parsed.netPrice);
  const rate = Number(parsed.vatRate);

  const checked = validated(formData, netCents, parsed.kind === "LAND_EXCHANGE");
  if ("error" in checked) return checked;

  const inserted = await db
    .insert(contracts)
    .values({
      reference,
      kind: parsed.kind,
      unitId: parsed.unitId,
      clientId: parsed.clientId,
      agentId: parsed.agentId || null,
      contractDate: parsed.contractDate ? new Date(parsed.contractDate) : null,
      netPrice: fromCents(netCents),
      vatRate: rate.toFixed(3),
      /**
       * Cash counts on both kinds.
       *
       * On a sale it is the part of the agreed price that is not written on the
       * contract, and the agent's commission is worked out on the two together.
       * On a land exchange it is the money settling the difference against the
       * apartments. Either way an empty field means none.
       */
      cashAmount: parsed.cashAmount ? fromCents(toCents(parsed.cashAmount)) : null,
      /* What the deed says, when that is its own number. */
      contractValue: parsed.contractValue ? fromCents(toCents(parsed.contractValue)) : null,
      /* Only a land exchange carries a plot and a share, and choosing a sale
         afterwards clears them rather than leaving them to be found later. */
      plotDescription:
        parsed.kind === "LAND_EXCHANGE" ? parsed.plotDescription?.trim() || null : null,
      plotReference: parsed.kind === "LAND_EXCHANGE" ? parsed.plotReference?.trim() || null : null,
      plotArea:
        parsed.kind === "LAND_EXCHANGE" && parsed.plotArea
          ? Number(parsed.plotArea).toFixed(2)
          : null,
      sharePercent:
        parsed.kind === "LAND_EXCHANGE" && parsed.sharePercent
          ? Number(parsed.sharePercent).toFixed(3)
          : null,
      scheduleType: parsed.scheduleType,
      periodMonths: parsed.periodMonths ? Number(parsed.periodMonths) : null,
      status: "ACTIVE",
      notes: parsed.notes || null,
    })
    .returning({ id: contracts.id });

  const contractId = inserted[0].id;
  await writeSchedule(contractId, netCents, rate, checked);
  await takeUnit(parsed.unitId, parsed.clientId);
  await priceTheUnit(
    parsed.unitId,
    fromCents(netCents),
    parsed.cashAmount ? fromCents(toCents(parsed.cashAmount)) : null,
  );
  if (parsed.kind === "LAND_EXCHANGE") {
    await setLandExchangeUnits(contractId, parsed.clientId, formData.getAll("unitIds").map(String));
  }
  await syncCommission(contractId);
  await followTheMoney(contractId, user);

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
 * Edit a contract. While nothing has been receipted the schedule can be replaced
 * outright. Once money has arrived the lines stay and only the price and the
 * rate move onto the installments that are still open.
 */
export async function updateContract(
  contractId: string,
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const user = await requireUser(["ADMIN"]);
  const before = await getContract(contractId);
  if (!before) return { error: "Contract not found" };

  const parsed = readDetails(formData);
  const reference = parsed.reference.trim();

  if (!(await referenceIsFree(reference, contractId))) {
    return {
      error: `There is already a contract called ${reference}. Give this one a different name.`,
    };
  }
  if (!(await unitIsFree(parsed.unitId, contractId))) {
    return { error: "That apartment already has a contract. Choose another one." };
  }

  const netCents = toCents(parsed.netPrice);
  const rate = Number(parsed.vatRate);
  const status = String(formData.get("status") ?? before.contract.status) as
    "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

  const checked = before.open
    ? validated(formData, netCents, parsed.kind === "LAND_EXCHANGE")
    : null;
  if (checked && "error" in checked) return checked;

  await db
    .update(contracts)
    .set({
      reference,
      kind: parsed.kind,
      unitId: parsed.unitId,
      clientId: parsed.clientId,
      agentId: parsed.agentId || null,
      contractDate: parsed.contractDate ? new Date(parsed.contractDate) : null,
      netPrice: fromCents(netCents),
      vatRate: rate.toFixed(3),
      /**
       * Cash counts on both kinds.
       *
       * On a sale it is the part of the agreed price that is not written on the
       * contract, and the agent's commission is worked out on the two together.
       * On a land exchange it is the money settling the difference against the
       * apartments. Either way an empty field means none.
       */
      cashAmount: parsed.cashAmount ? fromCents(toCents(parsed.cashAmount)) : null,
      /* What the deed says, when that is its own number. */
      contractValue: parsed.contractValue ? fromCents(toCents(parsed.contractValue)) : null,
      /* Only a land exchange carries a plot and a share, and choosing a sale
         afterwards clears them rather than leaving them to be found later. */
      plotDescription:
        parsed.kind === "LAND_EXCHANGE" ? parsed.plotDescription?.trim() || null : null,
      plotReference: parsed.kind === "LAND_EXCHANGE" ? parsed.plotReference?.trim() || null : null,
      plotArea:
        parsed.kind === "LAND_EXCHANGE" && parsed.plotArea
          ? Number(parsed.plotArea).toFixed(2)
          : null,
      sharePercent:
        parsed.kind === "LAND_EXCHANGE" && parsed.sharePercent
          ? Number(parsed.sharePercent).toFixed(3)
          : null,
      scheduleType: parsed.scheduleType,
      periodMonths: parsed.periodMonths ? Number(parsed.periodMonths) : null,
      status,
      notes: parsed.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  if (before.contract.unitId && before.contract.unitId !== parsed.unitId) {
    await releaseUnit(before.contract.unitId);
  }
  await takeUnit(parsed.unitId, parsed.clientId);
  await priceTheUnit(
    parsed.unitId,
    fromCents(netCents),
    parsed.cashAmount ? fromCents(toCents(parsed.cashAmount)) : null,
  );
  await setLandExchangeUnits(
    contractId,
    parsed.clientId,
    /* A contract changed back to a sale gives the owner's apartments up, which
       is the same answer as an empty list. */
    parsed.kind === "LAND_EXCHANGE" ? formData.getAll("unitIds").map(String) : [],
  );

  if (checked) {
    await writeSchedule(contractId, netCents, rate, checked);
  } else {
    await recalculateSchedule(contractId, user, "contract.update");
  }

  const summaryBefore = vatSummary(before.vatSetup);
  const summaryAfter = vatSummary({ netCents, rate });
  if (summaryBefore !== summaryAfter) {
    await db.insert(vatChanges).values({
      contractId,
      changedByEmail: user.email,
      fromSummary: summaryBefore,
      toSummary: summaryAfter,
      appliedToSeqs: before.open ? "the whole schedule" : "the open installments",
    });
  }

  await syncCommission(contractId);
  await followTheMoney(contractId, user);

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

  await db.delete(contracts).where(eq(contracts.id, contractId));
  if (detail.contract.unitId) {
    await releaseUnit(detail.contract.unitId);
    const [unit] = await db
      .select({ projectId: units.projectId })
      .from(units)
      .where(eq(units.id, detail.contract.unitId))
      .limit(1);
    if (unit) await followTheApartments(unit.projectId, user);
  }

  await recordAudit({
    action: "contract.delete",
    entity: "contract",
    entityId: contractId,
    detail: detail.contract.reference,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.deleted");
  revalidatePath("/contracts");
  redirect("/contracts");
}

/**
 * Date the schedule from the month the buyer signed. Lines that have already
 * been receipted keep the dates they were invoiced on.
 */
export async function setDates(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const start = String(formData.get("startDate") ?? "");
  const everyMonths = Number(String(formData.get("everyMonths") ?? "1")) || 1;
  if (!start) throw new Error("Give the date of the first payment.");

  const rows = await db
    .select()
    .from(installments)
    .where(eq(installments.contractId, contractId))
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
  await alsoTheBuyer(contractId);
}

/**
 * Edit one line: its name, its date, its amount. The VAT is worked out again at
 * the contract's rate, and the percentage follows the amount. A line with a
 * receipt against it keeps the figures it was invoiced at.
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
  // A stage picked from the list carries both languages with it, so the contract
  // reads properly in either one whoever typed it.
  const typedLabel = String(formData.get("label") ?? row.label) || row.label;
  const known = stageFromAnyLanguage(typedLabel);
  const label = known ? known.label : typedLabel;
  const labelEl = known ? known.labelEl : row.labelEl;
  const amountField = formData.get("amount");

  if (paidHere || row.lockedAt !== null) {
    await db
      .update(installments)
      .set({ label, labelEl, dueDate: dueDate ? new Date(dueDate) : null, updatedAt: new Date() })
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
        labelEl,
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

  await followTheMoney(contractId, user);

  revalidatePath(`/contracts/${contractId}`);
  await alsoTheBuyer(contractId);
}

/** One more line on the schedule, for whatever the deal needs. */
export async function addLine(contractId: string) {
  const user = await requireUser(["ADMIN"]);
  const rows = await db
    .select()
    .from(installments)
    .where(eq(installments.contractId, contractId))
    .orderBy(asc(installments.seq));

  const nextSeq = rows.reduce((highest, l) => Math.max(highest, l.seq), 0) + 1;

  await db.insert(installments).values({
    contractId,
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
    detail: `now ${rows.length + 1} installments`,
    userId: user.id,
    userEmail: user.email,
  });

  await followTheMoney(contractId, user);

  revalidatePath(`/contracts/${contractId}`);
  await alsoTheBuyer(contractId);
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

  await followTheMoney(contractId, user);

  revalidatePath(`/contracts/${contractId}`);
  await alsoTheBuyer(contractId);
}

export async function recordPayment(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const installmentId = String(formData.get("installmentId") ?? "") || null;
  const amountCents = toCents(String(formData.get("amount") ?? "0"));
  const paidOn = String(formData.get("paidOn") ?? "");

  if (amountCents <= 0) throw new Error("The amount must be more than zero.");

  const inserted = await db
    .insert(payments)
    .values({
      contractId,
      installmentId,
      amount: fromCents(amountCents),
      paidOn: paidOn ? new Date(paidOn) : new Date(),
      method: String(formData.get("method") ?? "") || null,
      receiptNumber: String(formData.get("receiptNumber") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
      recordedById: user.id,
    })
    .returning({ id: payments.id });

  // The invoice and the receipt belong with the payment, not loose in the
  // contract's files, so they are filed against it.
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length > 0) {
    await storeDocuments({
      files,
      title:
        String(formData.get("fileTitle") ?? "").trim() ||
        `Receipt ${String(formData.get("receiptNumber") ?? "").trim() || fromCents(amountCents)}`,
      category: "RECEIPT",
      attachTo: { contractId, paymentId: inserted[0].id },
      user,
    });
  }

  await lockPaidInstallments(contractId);
  await followTheMoney(contractId, user);

  await recordAudit({
    action: "payment.record",
    entity: "contract",
    entityId: contractId,
    detail: `${fromCents(amountCents)} against installment ${installmentId ?? "unassigned"}`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.paymentRecorded");

  revalidatePath(`/contracts/${contractId}`);
  await alsoTheBuyer(contractId);
  revalidatePath("/contracts");
}

export async function deletePayment(paymentId: string, contractId: string) {
  const user = await requireUser(["ADMIN"]);

  // The row would go on its own through the foreign key, but the files behind it
  // would stay on disk, so they are removed properly first.
  const filed = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.paymentId, paymentId));
  for (const doc of filed) await removeDocument(doc.id, user);

  await db.delete(payments).where(eq(payments.id, paymentId));
  await lockPaidInstallments(contractId);
  await followTheMoney(contractId, user);

  await recordAudit({
    action: "payment.delete",
    entity: "contract",
    entityId: contractId,
    detail: `payment ${paymentId}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/contracts/${contractId}`);
  await alsoTheBuyer(contractId);
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
  await alsoTheBuyer(contractId);
}

/**
 * Upload one or more documents to a contract.
 *
 * The same form and the same filing as the client profile, so an identity
 * document filed from here ends up on the buyer's record exactly as it would
 * have done from their own page, and a receipt filed from here names the
 * apartment the contract is about without anybody choosing it.
 */
export async function uploadContractDocuments(contractId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const [contract] = await db
    .select({ clientId: contracts.clientId, unitId: contracts.unitId })
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1);

  await storeChosenDocuments({
    formData,
    user,
    attachTo: { contractId, unitId: contract?.unitId ?? null },
    clientId: contract?.clientId ?? null,
  });

  revalidatePath(`/contracts/${contractId}`);
  await alsoTheBuyer(contractId);
  if (contract?.clientId) revalidatePath(`/clients/${contract.clientId}`);
}

export async function deleteContractDocument(documentId: string, contractId: string) {
  const user = await requireUser(["ADMIN"]);
  await removeDocument(documentId, user);
  revalidatePath(`/contracts/${contractId}`);
  await alsoTheBuyer(contractId);
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
  await alsoTheBuyer(contractId);
}

/** Keep the agent commission in step with the contract price and the rate. */
/**
 * Keep the agent's commission in step with this contract.
 *
 * The rule itself lives in the library, because the same recalculation has to
 * happen when a payment moves an apartment to sold, and that path is also
 * walked by a command line script that cannot load a server action module.
 */
export async function syncCommission(contractId: string) {
  await recalculateCommission(contractId);
}
