"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, contracts, installments, units, vatChanges } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { removeDocument, storeDocuments } from "@/lib/uploads";
import { fromCents, toCents } from "@/lib/money";
import { DEFAULT_STAGES, buildSchedule, singleRateSetup } from "@/lib/vat";
import { recalculateSchedule, vatSetupOf, vatSummary } from "@/lib/contracts";

const clientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  idType: z.enum(["ID_CARD", "PASSPORT", "YELLOW_SLIP"]).optional(),
  idNumber: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  source: z.enum(["BUYER", "ENQUIRY", "AGENT_REFERRAL", "OTHER"]),
  notes: z.string().optional(),
});

function readClient(formData: FormData) {
  return clientSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    idType: formData.get("idType") || undefined,
    idNumber: formData.get("idNumber") || undefined,
    address: formData.get("address") || undefined,
    country: formData.get("country") || undefined,
    source: formData.get("source") || "BUYER",
    notes: formData.get("notes") || undefined,
  });
}

export async function createClient(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = readClient(formData);

  const inserted = await db
    .insert(clients)
    .values({ ...parsed, email: parsed.email || null })
    .returning({ id: clients.id });

  await recordAudit({
    action: "client.create",
    entity: "client",
    entityId: inserted[0].id,
    detail: `${parsed.firstName} ${parsed.lastName}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/clients");
  redirect(`/clients/${inserted[0].id}`);
}

export async function updateClient(
  clientId: string,
  _previous: { ok: true } | { error: string } | null,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser(["ADMIN"]);

  let parsed: ReturnType<typeof readClient>;
  try {
    parsed = readClient(formData);
  } catch {
    return { error: "Check the name, the surname and the email address." };
  }

  const before = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!before[0]) return { error: "Client not found." };

  await db
    .update(clients)
    .set({
      ...parsed,
      email: parsed.email || null,
      idType: parsed.idType ?? null,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));

  await recordAudit({
    action: "client.update",
    entity: "client",
    entityId: clientId,
    detail: `${before[0].firstName} ${before[0].lastName} to ${parsed.firstName} ${parsed.lastName}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/**
 * Marketing consent. The campaign module may never send to a client without it,
 * and an unsubscribe is permanent until the client asks to come back.
 */
export async function setMarketingConsent(clientId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const optIn = String(formData.get("optIn") ?? "") === "on";
  const source = String(formData.get("optInSource") ?? "").trim() || null;

  await db
    .update(clients)
    .set({
      marketingOptIn: optIn,
      marketingOptInAt: optIn ? new Date() : null,
      marketingOptInSource: optIn ? source : null,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));

  await recordAudit({
    action: optIn ? "client.consent.granted" : "client.consent.removed",
    entity: "client",
    entityId: clientId,
    detail: source ?? "",
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function unsubscribeClient(clientId: string) {
  const user = await requireUser(["ADMIN"]);
  await db
    .update(clients)
    .set({ marketingOptIn: false, unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  await recordAudit({
    action: "client.unsubscribed",
    entity: "client",
    entityId: clientId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
}

const ID_LABELS: Record<string, string> = {
  ID_CARD: "Identity Card",
  PASSPORT: "Passport",
  YELLOW_SLIP: "Yellow Slip",
};

/**
 * Upload one or more documents to a client.
 *
 * The category can be one of the three identification types. When it is, the
 * document is filed as identification, the type is put on the end of the title
 * so the list reads "Title - Passport", and the type and number are written onto
 * the client record at the same time.
 */
export async function uploadClientDocuments(clientId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const chosen = String(formData.get("category") ?? "OTHER");
  const idType = ID_LABELS[chosen] ? (chosen as "ID_CARD" | "PASSPORT" | "YELLOW_SLIP") : null;

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const typed = String(formData.get("title") ?? "").trim();

  if (files.length === 0) throw new Error("Choose at least one file.");
  if (!typed) throw new Error("Give the file a title first.");

  const category = idType ? "IDENTIFICATION" : (chosen as "CONTRACT" | "RECEIPT" | "CHANGE_REQUEST" | "OTHER");
  const title = idType ? `${typed} - ${ID_LABELS[idType]}` : typed;

  if (idType) {
    const idNumber = String(formData.get("idNumber") ?? "").trim();
    await db
      .update(clients)
      .set({
        idType,
        ...(idNumber ? { idNumber } : {}),
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId));
  }

  await storeDocuments({ files, title, category, attachTo: { clientId }, user });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClientDocument(documentId: string, clientId: string) {
  const user = await requireUser(["ADMIN"]);
  await removeDocument(documentId, user);
  revalidatePath(`/clients/${clientId}`);
}

/**
 * Assign an apartment to a client, with the status that matches where the deal is.
 *
 * This is separate from the contract on purpose. The office knows who has taken
 * an apartment long before the contract and its payment schedule exist, and this
 * is what the clients table shows.
 */
export async function assignApartment(clientId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const unitId = String(formData.get("unitId") ?? "");
  const status = String(formData.get("status") ?? "RESERVED") as
    | "RESERVED"
    | "SOLD"
    | "DELIVERED";

  if (!unitId) throw new Error("Choose an apartment first.");

  const rows = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  const unit = rows[0];
  if (!unit) throw new Error("Apartment not found");

  if (unit.clientId && unit.clientId !== clientId) {
    throw new Error("That apartment is already assigned to another client.");
  }

  await db
    .update(units)
    .set({ clientId, status, updatedAt: new Date() })
    .where(eq(units.id, unitId));

  await recordAudit({
    action: "unit.assign",
    entity: "unit",
    entityId: unitId,
    detail: `${unit.code} to client ${clientId} as ${status.toLowerCase()}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath(`/projects/${unit.projectId}`);
}

/** Take the apartment back off the client. It becomes available again. */
export async function unassignApartment(unitId: string, clientId: string) {
  const user = await requireUser(["ADMIN"]);

  const rows = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  const unit = rows[0];
  if (!unit) return;

  const [contract] = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.unitId, unitId))
    .limit(1);

  // A contract has to go first, otherwise the payment schedule would be left
  // pointing at an apartment nobody holds. The page shows this as a note rather
  // than throwing, so nobody lands on an error screen.
  if (contract) {
    revalidatePath(`/clients/${clientId}`);
    return;
  }

  await db
    .update(units)
    .set({ clientId: null, status: "AVAILABLE", updatedAt: new Date() })
    .where(eq(units.id, unitId));

  await recordAudit({
    action: "unit.unassign",
    entity: "unit",
    entityId: unitId,
    detail: `${unit.code} released from client ${clientId}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath(`/projects/${unit.projectId}`);
}

/**
 * Write the contract for an apartment the client already holds.
 *
 * The price comes from the apartment and the whole of it starts at the reduced
 * rate, with five stages. All of that is then editable: the rate, the split
 * between the two rates, the stages and their dates.
 */
export async function createContractForUnit(clientId: string, unitId: string) {
  const user = await requireUser(["ADMIN"]);

  const unitRows = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  const unit = unitRows[0];
  if (!unit) throw new Error("Apartment not found");
  if (unit.clientId !== clientId) throw new Error("That apartment is not assigned to this client.");

  const existing = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(eq(contracts.unitId, unitId))
    .limit(1);
  if (existing[0]) return;

  const netCents = toCents(unit.netPrice);
  const setup = singleRateSetup(netCents, 5);

  const reference = `C-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const inserted = await db
    .insert(contracts)
    .values({
      reference,
      unitId,
      clientId,
      contractDate: new Date(),
      netPrice: fromCents(netCents),
      status: "ACTIVE",
      vatBaseReduced: fromCents(netCents),
      vatRateReduced: "5.000",
      vatBaseStandard: "0.00",
      vatRateStandard: "19.000",
    })
    .returning({ id: contracts.id });

  const contractId = inserted[0].id;
  const stages = DEFAULT_STAGES.slice(0, 5);
  const plan = stages.map((stage, i) => ({
    seq: i + 1,
    label: stage.label,
    // Five equal stages to start with, which the office then adjusts.
    percentage: 100 / stages.length,
    locked: false,
  }));
  const lines = buildSchedule(setup, plan);

  await db.insert(installments).values(
    lines.map((line, i) => ({
      contractId,
      seq: line.seq,
      label: line.label,
      labelEl: stages[i]?.labelEl ?? null,
      percentage: line.percentage.toFixed(4),
      netAmount: fromCents(line.netCents),
      vatAmount: fromCents(line.vatCents),
      totalAmount: fromCents(line.totalCents),
      vatRateApplied: line.rateApplied.toFixed(3),
    })),
  );

  await db.update(units).set({ status: "SOLD", updatedAt: new Date() }).where(eq(units.id, unitId));

  await recordAudit({
    action: "contract.createFromClient",
    entity: "contract",
    entityId: contractId,
    detail: `${reference} for apartment ${unit.code}, five stages at 5%`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/contracts");
}

/**
 * Add one more stage to a schedule.
 *
 * The new stage takes an equal share, and every stage that has not been paid is
 * recalculated. Anything already paid keeps the figures it was invoiced at.
 */
export async function addInstallment(contractId: string, clientId: string) {
  const user = await requireUser(["ADMIN"]);

  const lines = await db
    .select()
    .from(installments)
    .where(eq(installments.contractId, contractId));

  const nextSeq = lines.reduce((highest, l) => Math.max(highest, l.seq), 0) + 1;
  const share = 100 / (lines.length + 1);

  await db.insert(installments).values({
    contractId,
    seq: nextSeq,
    label: `Stage ${nextSeq}`,
    percentage: share.toFixed(4),
    netAmount: "0.00",
    vatAmount: "0.00",
    totalAmount: "0.00",
    vatRateApplied: "0.000",
  });

  // Spread the percentages evenly again over everything that is still open.
  const openLines = [...lines.filter((l) => l.status !== "PAID"), { seq: nextSeq }];
  const paidPercentage = lines
    .filter((l) => l.status === "PAID")
    .reduce((total, l) => total + Number(l.percentage), 0);
  const each = (100 - paidPercentage) / openLines.length;

  for (const line of openLines) {
    await db
      .update(installments)
      .set({ percentage: each.toFixed(4) })
      .where(and(eq(installments.contractId, contractId), eq(installments.seq, line.seq)));
  }

  await recalculateSchedule(contractId, user, "installment.add");

  await recordAudit({
    action: "installment.add",
    entity: "contract",
    entityId: contractId,
    detail: `now ${lines.length + 1} stages`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/contracts/${contractId}`);
}

/** Change the VAT rate of a contract from the client page. */
export async function setContractVatRate(
  contractId: string,
  clientId: string,
  formData: FormData,
) {
  const user = await requireUser(["ADMIN"]);
  const rate = Number(String(formData.get("rate") ?? "5"));

  const rows = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const contract = rows[0];
  if (!contract) throw new Error("Contract not found");

  const before = vatSummary(vatSetupOf(contract));
  const netCents = toCents(contract.netPrice);
  const setup = singleRateSetup(netCents, rate);

  await db
    .update(contracts)
    .set({
      vatBaseReduced: fromCents(netCents),
      vatRateReduced: rate.toFixed(3),
      vatBaseStandard: "0.00",
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contractId));

  const { openSeqs } = await recalculateSchedule(contractId, user, "contract.vat.change");

  await db.insert(vatChanges).values({
    contractId,
    changedByEmail: user.email,
    fromSummary: before,
    toSummary: vatSummary(setup),
    appliedToSeqs: openSeqs.length > 0 ? openSeqs.join(", ") : "none",
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/contracts/${contractId}`);
}


/**
 * Delete a contract.
 *
 * Its installments, payments, VAT history and commission go with it, because
 * they only exist as part of that contract. The apartment stays with the client
 * and keeps its status, so the office can write a fresh contract or release the
 * apartment afterwards.
 */
export async function deleteContract(contractId: string, clientId: string) {
  const user = await requireUser(["ADMIN"]);

  const rows = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const contract = rows[0];
  if (!contract) return;

  await db.delete(contracts).where(eq(contracts.id, contractId));

  await recordAudit({
    action: "contract.delete",
    entity: "contract",
    entityId: contractId,
    detail: `${contract.reference}, with its schedule and payments`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/contracts");
}
