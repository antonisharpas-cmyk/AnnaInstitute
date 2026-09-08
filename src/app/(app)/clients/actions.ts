"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, contractUnits, contracts, payments, units } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { removeDocument, storeDocuments } from "@/lib/uploads";
import { fromCents, toCents } from "@/lib/money";
import { resetToPlan, syncCommission } from "../contracts/actions";

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
    .set({
      marketingOptIn: false,
      unsubscribedAt: new Date(),
      updatedAt: new Date(),
    })
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

  const category = idType
    ? "IDENTIFICATION"
    : (chosen as "CONTRACT" | "RECEIPT" | "CHANGE_REQUEST" | "OTHER");
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

  // A buyer with more than one apartment keeps different paperwork for each, so
  // the file can name the apartment it concerns.
  const unitId = String(formData.get("unitId") ?? "").trim() || null;

  await storeDocuments({
    files,
    title,
    category,
    attachTo: { clientId, unitId },
    user,
  });
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
  const status = String(formData.get("status") ?? "RESERVED") as "RESERVED" | "SOLD" | "DELIVERED";

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

  const [assignment] = await db
    .select({ id: contractUnits.id })
    .from(contractUnits)
    .where(eq(contractUnits.unitId, unitId))
    .limit(1);

  // A contract has to go first, otherwise the payment schedule would be left
  // pointing at an apartment nobody holds. The page shows this as a note rather
  // than throwing, so nobody lands on an error screen.
  if (assignment) {
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
 * Put a contract on an apartment this client holds.
 *
 * Contracts are written in the contracts section and stand on their own, so the
 * same one can serve several apartments. Here the office only picks which
 * contract this apartment is on.
 */
export async function attachContract(clientId: string, unitId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const contractId = String(formData.get("contractId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const everyMonths = String(formData.get("everyMonths") ?? "1");
  if (!contractId) throw new Error("Choose a contract first.");

  const rows = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const contract = rows[0];
  if (!contract) throw new Error("Contract not found");

  const taken = await db
    .select({ id: contractUnits.id })
    .from(contractUnits)
    .where(eq(contractUnits.unitId, unitId))
    .limit(1);
  if (taken[0]) throw new Error("That apartment is already on a contract.");

  const inserted = await db
    .insert(contractUnits)
    .values({ contractId, unitId, clientId })
    .returning({ id: contractUnits.id });

  // The apartment takes its own copy of the contract's plan, on its own dates.
  const dates = new FormData();
  dates.set("startDate", startDate);
  dates.set("everyMonths", everyMonths);
  await resetToPlan(inserted[0].id, contractId, dates);

  await db
    .update(units)
    .set({ status: "SOLD", clientId, updatedAt: new Date() })
    .where(eq(units.id, unitId));

  await syncCommission(inserted[0].id);

  await recordAudit({
    action: "contract.attach",
    entity: "contract",
    entityId: contractId,
    detail: `${contract.reference} put on apartment ${unitId}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
}

/**
 * Take the contract off this apartment.
 *
 * The contract itself is left alone, because other apartments may be on it.
 * Money already received against this apartment blocks it, so nothing is
 * orphaned.
 */
export async function detachContract(assignmentId: string, clientId: string) {
  const user = await requireUser(["ADMIN"]);

  const rows = await db
    .select()
    .from(contractUnits)
    .where(eq(contractUnits.id, assignmentId))
    .limit(1);
  const assignment = rows[0];
  if (!assignment) return;

  const [paidHere] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.assignmentId, assignmentId))
    .limit(1);

  // Shown on the page as a note rather than an error screen.
  if (paidHere) {
    revalidatePath(`/clients/${clientId}`);
    return;
  }

  await db.delete(contractUnits).where(eq(contractUnits.id, assignmentId));
  await db
    .update(units)
    .set({ status: assignment.clientId ? "RESERVED" : "AVAILABLE", updatedAt: new Date() })
    .where(eq(units.id, assignment.unitId));

  await recordAudit({
    action: "contract.detach",
    entity: "contract",
    entityId: assignment.contractId,
    detail: `taken off apartment ${assignment.unitId}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/contracts/${assignment.contractId}`);
  revalidatePath("/contracts");
}
