"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, contracts, units } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { removeDocument, storeDocuments } from "@/lib/uploads";
import { flash } from "@/lib/flash";
import { offerUndo } from "@/lib/undo";
import { matchingClientIds } from "@/lib/clients";

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

/* ---------------------------------------------------------------------------
   From the list itself
   --------------------------------------------------------------------------- */

/**
 * A telephone number or an email address, corrected where it is read.
 *
 * Most corrections to a client record are one of these two fields, and walking
 * to the record and back for a digit is the sort of friction that makes people
 * stop correcting things at all.
 */
export async function setClientField(
  clientId: string,
  field: "phone" | "email",
  value: string,
): Promise<{ error?: string }> {
  const user = await requireUser(["ADMIN"]);
  const clean = value.trim();

  if (field === "email" && clean && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(clean)) {
    return { error: "That is not an email address" };
  }
  if (field === "phone" && clean && !/^[+()\d\s.-]{6,24}$/.test(clean)) {
    return { error: "That is not a telephone number" };
  }

  await db
    .update(clients)
    .set({ [field]: clean || null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  await recordAudit({
    action: "client.update",
    entity: "client",
    entityId: clientId,
    detail: `${field} changed from the list`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saved");
  revalidatePath("/clients");
  return {};
}

/** The ids the selection bar sent, or every client the filters match. */
async function chosenClientIds(formData: FormData): Promise<string[]> {
  if (String(formData.get("scope") ?? "page") === "all") {
    const rows = await matchingClientIds({
      query: String(formData.get("q") ?? ""),
      held: String(formData.get("held") ?? ""),
    });
    return rows;
  }
  return formData.getAll("ids").map(String).filter(Boolean);
}

export async function bulkClientMarketing(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const wanted = String(formData.get("marketing") ?? "on") === "on";
  const ids = await chosenClientIds(formData);

  if (ids.length === 0) {
    await flash("said.nothingChosen", "bad");
    revalidatePath("/clients");
    return;
  }

  const before = await db.select().from(clients).where(inArray(clients.id, ids));

  /**
   * An unsubscribe is the client's own decision and outranks the office, so
   * those records are left exactly as they are and counted separately.
   */
  const allowed = before.filter((row) => !wanted || row.unsubscribedAt === null);

  await db
    .update(clients)
    .set({
      marketingOptIn: wanted,
      marketingOptInAt: wanted ? new Date() : null,
      marketingOptInSource: wanted ? "office, from the list" : null,
      updatedAt: new Date(),
    })
    .where(
      inArray(
        clients.id,
        allowed.map((row) => row.id),
      ),
    );

  await recordAudit({
    action: "client.marketing.bulk",
    entity: "client",
    detail: `${allowed.length} set to ${wanted ? "allowed" : "stopped"}, ${
      before.length - allowed.length
    } left alone because they unsubscribed`,
    userId: user.id,
    userEmail: user.email,
  });

  await offerUndo({
    kind: "client.marketing",
    was: allowed.map((row) => ({ id: row.id, value: row.marketingOptIn ? "on" : "off" })),
  });
  await flash("said.marketingSet");
  revalidatePath("/clients");
}

/**
 * Clients to the recycle bin.
 *
 * A client who has signed something is not deleted at all: the contract, the
 * money and the apartment all point at them, so those are named in the message
 * and left where they are.
 */
export async function bulkClientBin(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const ids = await chosenClientIds(formData);

  if (ids.length === 0) {
    await flash("said.nothingChosen", "bad");
    revalidatePath("/clients");
    return;
  }

  const signed = await db
    .select({ clientId: contracts.clientId })
    .from(contracts)
    .where(inArray(contracts.clientId, ids));

  const locked = new Set(signed.map((row) => row.clientId).filter(Boolean) as string[]);
  const removable = ids.filter((id) => !locked.has(id));

  if (removable.length > 0) {
    await db
      .update(clients)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(inArray(clients.id, removable));

    await offerUndo({ kind: "client.deleted", was: removable.map((id) => ({ id })) });
  }

  await recordAudit({
    action: "client.binned.bulk",
    entity: "client",
    detail: `${removable.length} moved to the bin, ${locked.size} kept because they have a contract`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash(
    removable.length > 0 ? "said.movedToBin" : "said.clientHasContract",
    removable.length > 0 ? "good" : "bad",
  );
  revalidatePath("/clients");
}
