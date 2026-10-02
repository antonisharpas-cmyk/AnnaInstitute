"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, contractUnits, contracts, units } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { followTheApartments, markUnitByHand } from "@/lib/statuses";
import { revertCommission } from "@/lib/commissions";
import { removeDocument, storeChosenDocuments } from "@/lib/uploads";
import { flash } from "@/lib/flash";
import { offerUndo } from "@/lib/undo";
import { matchingClientIds } from "@/lib/clients";
import { splitChoice } from "@/lib/choices/lists";
import { cleanBirthDate, emailList } from "@/lib/buyers";

const clientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  idType: z.enum(["ID_CARD", "PASSPORT", "YELLOW_SLIP"]).optional(),
  idNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  source: z.enum([
    "BUYER",
    "ENQUIRY",
    "WEBSITE",
    "WHATSAPP",
    "AGENT_REFERRAL",
    "LAND_OWNER",
    "OTHER",
    "INSTAGRAM",
    "FACEBOOK",
    "SOCIAL_MEDIA",
    "PHONE",
    "EMAIL",
    "REFERRAL",
  ]),
  notes: z.string().optional(),
});

/**
 * The client as typed.
 *
 * The source and the kind of ID may be the office's own values from the
 * Builder: the built in value they count as is what is checked and kept in the
 * record's own column, and the office's value goes beside it.
 */
function readClient(formData: FormData) {
  const source = splitChoice(String(formData.get("source") || "BUYER"));
  const idType = splitChoice(String(formData.get("idType") || ""));
  const parsed = clientSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    idNumber: formData.get("idNumber") || undefined,
    vatNumber: formData.get("vatNumber") || undefined,
    address: formData.get("address") || undefined,
    country: formData.get("country") || undefined,
    source: source.base,
    notes: formData.get("notes") || undefined,
    idType: idType.base || undefined,
  });
  /* The agent is kept only for a client an agent brought. */
  const agentId = source.base === "AGENT_REFERRAL" ? String(formData.get("agentId") ?? "").trim() || null : null;
  return {
    ...parsed,
    sourceChoice: source.choice,
    idTypeChoice: parsed.idType ? idType.choice : null,
    agentId,
    birthDate: cleanBirthDate(String(formData.get("birthDate") ?? "")),
  };
}

const typed = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

/**
 * The second buyer as typed: an apartment in two names. Nothing is kept
 * without a name and a surname, because a second buyer nobody can call by
 * name is not one.
 */
function readSecondBuyer(formData: FormData) {
  const idType = splitChoice(String(formData.get("secondIdType") || ""));
  const base = ["ID_CARD", "PASSPORT", "YELLOW_SLIP"].includes(idType.base) ? (idType.base as "ID_CARD" | "PASSPORT" | "YELLOW_SLIP") : null;
  const email = typed(formData, "secondEmail");
  return {
    secondFirstName: typed(formData, "secondFirstName"),
    secondLastName: typed(formData, "secondLastName"),
    secondEmail: email && emailList(email)[0] ? emailList(email)[0] : null,
    secondPhone: typed(formData, "secondPhone"),
    secondIdType: base,
    secondIdTypeChoice: base ? idType.choice : null,
    secondIdNumber: typed(formData, "secondIdNumber"),
    secondAddress: typed(formData, "secondAddress"),
    secondCountry: typed(formData, "secondCountry"),
    secondBirthDate: cleanBirthDate(String(formData.get("secondBirthDate") ?? "")),
    secondRelation: typed(formData, "secondRelation"),
  };
}

const NO_SECOND_BUYER = {
  secondFirstName: null,
  secondLastName: null,
  secondEmail: null,
  secondPhone: null,
  secondIdType: null,
  secondIdTypeChoice: null,
  secondIdNumber: null,
  secondAddress: null,
  secondCountry: null,
  secondBirthDate: null,
  secondRelation: null,
};

/** Paying with a bank loan, and who at the bank is copied on the payment letters. */
function readLoan(formData: FormData) {
  const loan = String(formData.get("loan") ?? "") === "on";
  return {
    loan,
    loanBank: typed(formData, "loanBank"),
    loanContact: typed(formData, "loanContact"),
    loanEmail: emailList(typed(formData, "loanEmail")).join(", ") || null,
    loanPhone: typed(formData, "loanPhone"),
    loanNotes: typed(formData, "loanNotes"),
  };
}

export async function createClient(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = readClient(formData);
  if (parsed.source === "AGENT_REFERRAL" && !parsed.agentId) {
    await flash("said.referralNeedsAgent", "bad");
    redirect("/clients/new");
  }

  /* The second buyer and the bank only when the form says so. */
  const second = String(formData.get("hasSecondBuyer") ?? "") === "on" ? readSecondBuyer(formData) : NO_SECOND_BUYER;
  if (second.secondFirstName === null || second.secondLastName === null) Object.assign(second, NO_SECOND_BUYER);
  const loan = readLoan(formData);

  const inserted = await db
    .insert(clients)
    .values({ ...parsed, ...second, ...loan, email: parsed.email || null })
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
      vatNumber: parsed.vatNumber ?? null,
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
type CardState = { ok: true } | { error: string } | null;

/** The second buyer, added or changed from the client's page. */
export async function updateSecondBuyer(
  clientId: string,
  _previous: CardState,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser(["ADMIN"]);
  const second = readSecondBuyer(formData);
  if (!second.secondFirstName || !second.secondLastName) {
    return { error: "The second buyer needs a name and a surname." };
  }
  if (typed(formData, "secondEmail") && !second.secondEmail) {
    return { error: "Check the second buyer's email address." };
  }
  await db.update(clients).set({ ...second, updatedAt: new Date() }).where(eq(clients.id, clientId));
  await recordAudit({
    action: "client.secondBuyer",
    entity: "client",
    entityId: clientId,
    detail: `${second.secondFirstName} ${second.secondLastName}`,
    userId: user.id,
    userEmail: user.email,
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return { ok: true };
}

/** The apartment is in one name again. Their documents stay, marked as the second buyer's. */
export async function removeSecondBuyer(clientId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.update(clients).set({ ...NO_SECOND_BUYER, updatedAt: new Date() }).where(eq(clients.id, clientId));
  await recordAudit({
    action: "client.secondBuyer.remove",
    entity: "client",
    entityId: clientId,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

/** Paying with a bank loan: the bank and the people there to copy. */
export async function updateLoan(
  clientId: string,
  _previous: CardState,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser(["ADMIN"]);
  const loan = readLoan(formData);
  if (typed(formData, "loanEmail") && !loan.loanEmail) {
    return { error: "Check the bank's email address." };
  }
  await db.update(clients).set({ ...loan, updatedAt: new Date() }).where(eq(clients.id, clientId));
  await recordAudit({
    action: "client.loan",
    entity: "client",
    entityId: clientId,
    detail: loan.loan ? `${loan.loanBank ?? "a bank"}${loan.loanEmail ? `, ${loan.loanEmail}` : ""}` : "no loan",
    userId: user.id,
    userEmail: user.email,
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

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

/**
 * Upload one or more documents to a client.
 *
 * The form and the filing itself are shared with the contract side, in
 * src/components/DocumentUpload.tsx and storeChosenDocuments, so the office
 * gets the same questions and the same result whichever page it starts from.
 */
export async function uploadClientDocuments(clientId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  await storeChosenDocuments({
    formData,
    user,
    attachTo: { clientId },
    clientId,
    /* The second buyer's own paper: their ID goes on their part of the record. */
    secondBuyer: String(formData.get("person") ?? "") === "2",
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

  /**
   * A status picked here is somebody's decision about a deal the schedule knows
   * nothing about yet, so it is marked as set by hand and the payments leave it
   * alone until the apartment is handed back to them.
   */
  await markUnitByHand(unitId, user);
  await followTheApartments(unit.projectId, user);

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
    .where(and(eq(contracts.unitId, unitId), ne(contracts.status, "CANCELLED")))
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
    .set({
      clientId: null,
      status: "AVAILABLE",
      // Nobody holds it, so there is nothing for a hand set status to protect.
      statusByHandAt: null,
      statusByHandById: null,
      updatedAt: new Date(),
    })
    .where(eq(units.id, unitId));

  await followTheApartments(unit.projectId, user);

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
      project: String(formData.get("project") ?? ""),
      partner: String(formData.get("partner") ?? ""),
      source: String(formData.get("source") ?? ""),
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

  /*
   * A client with a sale that is still going can be deleted: the office's
   * rule is that the sale goes with them. The contract is cancelled (kept, with
   * its payments and papers), the agent's commission on it is taken back, and
   * the apartment is free, exactly as when a client is closed. A client with a
   * finished sale or a land exchange is kept, because that is a deal that
   * happened and a commission that was earned.
   */
  const signed = await db
    .select({ clientId: contracts.clientId, kind: contracts.kind, status: contracts.status })
    .from(contracts)
    .where(inArray(contracts.clientId, ids));

  const locked = new Set(
    signed
      .filter((row) => row.kind !== "SALE" || row.status === "COMPLETED")
      .map((row) => row.clientId)
      .filter(Boolean) as string[],
  );
  const removable = ids.filter((id) => !locked.has(id));
  const withSales = new Set(
    signed.map((row) => row.clientId).filter((id): id is string => Boolean(id) && !locked.has(id as string)),
  );

  let cancelled = 0;
  for (const clientId of withSales) {
    const { open } = await walkAway(clientId, user);
    cancelled += open.length;
  }

  if (removable.length > 0) {
    await db
      .update(clients)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(inArray(clients.id, removable));

    /*
     * The apartments they were holding go back on the market.
     *
     * This is the case the office found: the contract was deleted, then the
     * client, and the apartment was left sold to nobody. A client who is gone
     * holds nothing, so the apartment is nobody's and it is free, and the
     * development's own list says so without anybody going round after the
     * deletion putting it right.
     */
    const held = await db
      .select({ id: units.id, projectId: units.projectId, code: units.code })
      .from(units)
      .where(inArray(units.clientId, removable));

    if (held.length > 0) {
      await db
        .update(units)
        .set({
          clientId: null,
          status: "AVAILABLE",
          /* Free by the record rather than by somebody's decision, so the
             money is allowed to move it again if a contract is written. */
          statusByHandAt: null,
          statusByHandById: null,
          updatedAt: new Date(),
        })
        .where(
          inArray(
            units.id,
            held.map((one) => one.id),
          ),
        );

      for (const project of new Set(held.map((one) => one.projectId))) {
        await followTheApartments(project, user);
      }

      await recordAudit({
        action: "unit.released",
        entity: "client",
        detail: `${held.map((one) => one.code).join(", ")} back on the market`,
        userId: user.id,
        userEmail: user.email,
      });
    }

    await offerUndo({ kind: "client.deleted", was: removable.map((id) => ({ id })) });
  }

  await recordAudit({
    action: "client.binned.bulk",
    entity: "client",
    detail: `${removable.length} moved to the bin, ${cancelled} contract${cancelled === 1 ? "" : "s"} cancelled with the commission taken back, ${locked.size} kept because they have a completed sale or a land exchange`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash(
    removable.length === 0
      ? "said.clientHasContract"
      : cancelled > 0
        ? `said.movedToBinSaleOff|${cancelled}`
        : "said.movedToBin",
    removable.length > 0 ? "good" : "bad",
  );
  revalidatePath("/clients");
  if (cancelled > 0) {
    revalidatePath("/contracts");
    revalidatePath("/commissions");
    revalidatePath("/agents");
  }
}

/* ---------------------------------------------------------------------------
   Closing a client who walked away

   The office's case, in their words: the client paid the reservation and is
   not interested any more. Close him, release the apartment, and put him
   somewhere. Deleting is wrong for this, because money was received and the
   record of it has to stay; leaving him as he is is wrong too, because the
   apartment is sitting there held by somebody who is not buying it.
   --------------------------------------------------------------------------- */

/**
 * A client who is no longer buying: what that undoes.
 *
 * Shared by closing a client and by putting one in the bin, because the office
 * means the same thing by both as far as the sale goes: the contract is off,
 * the agent's commission on it is taken back, and the apartment is free.
 */
async function walkAway(clientId: string, user: { id: string; email: string }) {
  /* 1. Their contracts are marked cancelled, not deleted. The schedule and
        every payment stay exactly as they were, because they are the record
        of money that really moved. A completed contract is left alone: a
        client who has finished paying is not somebody walking away. */
  const theirs = await db
    .select({
      id: contracts.id,
      unitId: contracts.unitId,
      status: contracts.status,
      kind: contracts.kind,
    })
    .from(contracts)
    .where(eq(contracts.clientId, clientId));

  /* Sales only. A land exchange is an agreement over land that has already
     been given, so a landowner is never "walking away" from it here, and the
     apartments they receive for it stay theirs. */
  const open = theirs.filter(
    (one) => one.kind === "SALE" && one.status !== "COMPLETED" && one.status !== "CANCELLED",
  );

  const exchanged = theirs.filter((one) => one.kind === "LAND_EXCHANGE").map((one) => one.id);
  const ownersShare = new Set(
    exchanged.length > 0
      ? (
          await db
            .select({ unitId: contractUnits.unitId })
            .from(contractUnits)
            .where(inArray(contractUnits.contractId, exchanged))
        ).map((row) => row.unitId)
      : [],
  );
  if (open.length > 0) {
    await db
      .update(contracts)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(
        inArray(
          contracts.id,
          open.map((one) => one.id),
        ),
      );
  }

  /* 1b. And the agent's commission on those sales is taken back, and on any
         sale of theirs cancelled before the CRM did this by itself. */
  for (const one of theirs) {
    if (one.kind === "SALE" && one.status !== "COMPLETED") await revertCommission(one.id);
  }

  /* 2. The apartments go back on the market: the ones assigned to them, and
        the ones on the contracts that were just cancelled. */
  const assigned = await db
    .select({ id: units.id, projectId: units.projectId, code: units.code })
    .from(units)
    .where(eq(units.clientId, clientId));

  const onContracts = open.map((one) => one.unitId).filter(Boolean) as string[];
  const fromContracts =
    onContracts.length > 0
      ? await db
          .select({ id: units.id, projectId: units.projectId, code: units.code })
          .from(units)
          .where(inArray(units.id, onContracts))
      : [];

  const released = [
    ...new Map([...assigned, ...fromContracts].map((one) => [one.id, one])).values(),
  ].filter((one) => !ownersShare.has(one.id));

  if (released.length > 0) {
    await db
      .update(units)
      .set({
        clientId: null,
        status: "AVAILABLE",
        statusByHandAt: null,
        statusByHandById: null,
        updatedAt: new Date(),
      })
      .where(
        inArray(
          units.id,
          released.map((one) => one.id),
        ),
      );
    for (const project of new Set(released.map((one) => one.projectId))) {
      await followTheApartments(project, user);
    }
  }

  return { open, released };
}

export async function closeClient(clientId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return;

  const { open, released } = await walkAway(clientId, user);

  /* 3. And the client moves to the Closed list, with the reason. */
  await db
    .update(clients)
    .set({ closedAt: new Date(), closedReason: reason, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  await recordAudit({
    action: "client.closed",
    entity: "client",
    entityId: clientId,
    detail: [
      reason,
      open.length > 0 ? `${open.length} contract${open.length === 1 ? "" : "s"} cancelled` : null,
      released.length > 0 ? `${released.map((one) => one.code).join(", ")} back on the market` : null,
    ]
      .filter(Boolean)
      .join(". "),
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.clientClosed");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/contracts");
}

/**
 * Back from the Closed list.
 *
 * The client comes back, their contracts stay cancelled, and their apartments
 * are not taken back: somebody else may have been sold them in the meantime.
 * If the deal is on again, the office assigns the apartment and writes the
 * contract afresh, which is the honest record of what happened.
 */
export async function reopenClient(clientId: string) {
  const user = await requireUser(["ADMIN"]);

  await db
    .update(clients)
    .set({ closedAt: null, closedReason: null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  await recordAudit({
    action: "client.reopened",
    entity: "client",
    entityId: clientId,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.clientReopened");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}
