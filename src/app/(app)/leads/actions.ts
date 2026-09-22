"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, documents, leadNotes, leads } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { offerUndo } from "@/lib/undo";
import { listLeads } from "@/lib/leads";
import { removeDocument } from "@/lib/uploads";
import { createApiKey, revokeApiKey } from "@/lib/apiKeys";

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"] as const;
type LeadStatus = (typeof STATUSES)[number];

const SOURCES = ["WEBSITE", "ENQUIRY", "AGENT", "WHATSAPP", "OTHER"] as const;
type LeadSource = (typeof SOURCES)[number];

/**
 * A lead typed in by the office.
 *
 * The same record as one that arrives from the website, so an enquiry taken over
 * the phone or forwarded by an agent sits in the same list and follows the same
 * road to becoming a client.
 */
/**
 * What the enquiry form gets back when it cannot be saved as it stands.
 *
 * The message, and everything that was typed. React empties a form once its
 * action has run, so without carrying the answers back the office would be
 * told what was missing and handed a blank page to type again, which is worse
 * than the error page it replaced.
 */
export type LeadFormState = {
  error: string;
  values: Record<string, string>;
  /** Counted up on each try, so the form knows to redraw with what was typed. */
  attempt: number;
} | null;

export async function createLead(
  previous: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const user = await requireUser(["ADMIN"]);

  const firstName = String(formData.get("firstName") ?? "").trim() || null;
  const lastName = String(formData.get("lastName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const note = String(formData.get("message") ?? "").trim() || null;
  const chosen = String(formData.get("sourceKind") ?? "ENQUIRY");
  const sourceKind = (SOURCES as readonly string[]).includes(chosen)
    ? (chosen as LeadSource)
    : "ENQUIRY";
  const other = String(formData.get("sourceOther") ?? "").trim();

  /*
   * A foreseeable mistake is a message, not a crash.
   *
   * Forgetting both the email and the telephone number is the easiest thing in
   * the world to do, and the office was meeting a server error page for it,
   * which reads as the CRM being broken rather than as a field being empty. It
   * is answered on the form now, with what the office typed still in it.
   */
  if (!email && !phone) {
    const typed: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") typed[key] = value;
    }
    return {
      error:
        "Give the enquiry an email address or a telephone number, or there is no way to reply.",
      values: typed,
      attempt: (previous?.attempt ?? 0) + 1,
    };
  }

  /**
   * Consent said out loud is consent.
   *
   * Somebody who agrees on the telephone has agreed, and making the office go
   * to another screen afterwards to record it is how a campaign list ends up
   * with people on it who never said yes, or without people who did. It is
   * written on the enquiry with a note saying where it came from, and it
   * travels to the client record when the enquiry becomes a buyer.
   */
  const consented = String(formData.get("consent") ?? "") === "on";
  const agentId = String(formData.get("agentId") ?? "").trim() || null;

  const inserted = await db
    .insert(leads)
    .values({
      firstName,
      lastName,
      email,
      phone,
      message: note,
      sourceKind,
      source: sourceKind === "OTHER" ? other || "other" : sourceKind.toLowerCase(),
      projectName: String(formData.get("projectName") ?? "").trim() || null,
      // Only meaningful when the enquiry came from an agent, and ignored
      // otherwise, so changing the source does not leave a stray name behind.
      agentId: sourceKind === "AGENT" ? agentId : null,
      consent: consented,
      consentText: consented ? "Given to the office when the enquiry was taken" : null,
      status: "NEW",
    })
    .returning({ id: leads.id });

  await recordAudit({
    action: "lead.create",
    entity: "lead",
    entityId: inserted[0].id,
    detail: [firstName, lastName].filter(Boolean).join(" "),
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.leadCreated");
  revalidatePath("/leads");
  redirect(`/leads/${inserted[0].id}`);
}

export async function setLeadStatus(leadId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status as LeadStatus)) return;

  /**
   * Became a client is not a status, it is a move.
   *
   * Setting it here does what the button on the enquiry does: the client record
   * is created from everything the enquiry knows, the enquiry leaves the
   * enquiries list, and the office lands on the new profile ready to assign an
   * apartment. Anything already converted is left alone rather than doubled.
   */
  if (status === "CONVERTED") {
    const clientId = await makeClient(leadId, user);
    if (clientId) {
      await flash("said.leadConverted");
      redirect(`/clients/${clientId}`);
    }
    return;
  }

  await db
    .update(leads)
    .set({ status: status as LeadStatus, updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  await recordAudit({
    action: "lead.status",
    entity: "lead",
    entityId: leadId,
    detail: status,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

/**
 * Add one note to an enquiry's record.
 *
 * Notes are added, never overwritten: "contacted", then "contacted again, he
 * asked for the plans", then "meeting agreed for Tuesday" is the history the
 * office works from, and a single box that the next person types over destroys
 * exactly the part that was worth keeping. The enquiry's own updated stamp
 * moves too, so a list sorted by activity puts it where it belongs.
 */
export async function addLeadNote(leadId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    await flash("said.noteEmpty", "bad");
    revalidatePath(`/leads/${leadId}`);
    return;
  }

  await db.insert(leadNotes).values({ leadId, body, writtenById: user.id });
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));

  await recordAudit({
    action: "lead.note",
    entity: "lead",
    entityId: leadId,
    detail: body.slice(0, 120),
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.noteAdded");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

/**
 * Take one note back off the record.
 *
 * Kept deliberately plain: a note written by mistake goes, and the audit log
 * remembers that it was written and that it was removed, which is the honest
 * way round for a record somebody may have acted on.
 */
export async function removeLeadNote(leadId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const noteId = String(formData.get("noteId") ?? "").trim();
  if (!noteId) return;

  await db.delete(leadNotes).where(eq(leadNotes.id, noteId));

  await recordAudit({
    action: "lead.note.remove",
    entity: "lead",
    entityId: leadId,
    detail: `note ${noteId}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/leads/${leadId}`);
}

/**
 * A lead becomes a client.
 *
 * The consent box on a website form is not marketing consent on its own, so it
 * is carried over only when the office confirms it here. Everything else the
 * form said is copied into the client's notes rather than thrown away.
 */
/**
 * Make a client out of an enquiry.
 *
 * Written once and called from two places, because the office asked for both:
 * the button on the enquiry, where the name can be corrected and consent
 * confirmed first, and the status "Became a client", which is the way somebody
 * working down a list thinks about it. Whichever is used, the same thing
 * happens, and the enquiry leaves the enquiries list the moment it does.
 *
 * Everything the enquiry knew goes with it: the name, the contact details, what
 * they asked about, consent if it was given, and the agent who introduced them,
 * which the contract later picks up so the commission has an owner.
 */
async function makeClient(
  leadId: string,
  who: { id: string; email: string },
  chosen?: { firstName?: string; lastName?: string; optIn?: boolean },
): Promise<string | null> {
  const rows = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  const lead = rows[0];
  if (!lead) return null;
  if (lead.clientId) return lead.clientId;

  const firstName = chosen?.firstName?.trim() || lead.firstName || "Enquiry";
  const lastName = chosen?.lastName?.trim() || lead.lastName || "";

  /**
   * Consent carries over, and can only be added by somebody saying so.
   *
   * The enquiry may already carry it, from the website's own box or from the
   * office ticking it while taking the call. The conversion form can confirm it
   * as well. Neither can take it away silently, and nothing here invents it.
   */
  const optIn = chosen?.optIn ?? lead.consent;

  const notes = [
    lead.message ? `From the enquiry: ${lead.message}` : null,
    lead.projectName ? `Asked about ${lead.projectName}` : null,
    lead.pageUrl ? `Page: ${lead.pageUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const inserted = await db
    .insert(clients)
    .values({
      firstName,
      lastName,
      email: lead.email,
      phone: lead.phone,
      country: lead.country,
      /*
        The source carries over as it stands.
        
        It used to be flattened to "Enquiry" unless an agent had brought it,
        which threw away the one thing the office knew about where the buyer
        came from. A WhatsApp enquiry is now a WhatsApp client.
      */
      source:
        lead.sourceKind === "AGENT"
          ? "AGENT_REFERRAL"
          : lead.sourceKind === "WHATSAPP"
            ? "WHATSAPP"
            : lead.sourceKind === "WEBSITE"
              ? "WEBSITE"
              : lead.sourceKind === "OTHER"
                ? "OTHER"
                : "ENQUIRY",
      marketingOptIn: optIn,
      marketingOptInAt: optIn ? new Date() : null,
      marketingOptInSource: optIn ? (lead.consentText ?? "the enquiry") : null,
      notes: notes || null,
    })
    .returning({ id: clients.id });

  await db
    .update(leads)
    .set({ status: "CONVERTED", clientId: inserted[0].id, updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  await recordAudit({
    action: "lead.converted",
    entity: "lead",
    entityId: leadId,
    detail: `${firstName} ${lastName}`.trim(),
    userId: who.id,
    userEmail: who.email,
  });

  revalidatePath("/leads");
  revalidatePath("/clients");
  return inserted[0].id;
}

export async function convertLead(leadId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const clientId = await makeClient(leadId, user, {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    optIn: String(formData.get("optIn") ?? "") === "on",
  });

  if (!clientId) return;

  await flash("said.leadConverted");
  redirect(`/clients/${clientId}`);
}

/**
 * Undo a conversion.
 *
 * Pressed by mistake, or the buyer changed their mind before anything was
 * signed: the client record goes and the enquiry returns to the leads list where
 * it can be picked up again. A client who already has a contract is never
 * removed this way, because that would take the contract with it. Cancel the
 * contract first, and the office keeps the choice rather than losing the record.
 */
export async function undoConversion(clientId: string) {
  const user = await requireUser(["ADMIN"]);

  const [signed] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(contracts)
    .where(eq(contracts.clientId, clientId));

  if ((signed?.total ?? 0) > 0) {
    redirect(`/clients/${clientId}?undo=contract`);
  }

  const found = await db.select().from(leads).where(eq(leads.clientId, clientId)).limit(1);
  const lead = found[0];

  // Their files go properly, so nothing is left on disk without a row.
  const filed = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.clientId, clientId));
  for (const doc of filed) await removeDocument(doc.id, user);

  if (lead) {
    await db
      .update(leads)
      .set({ clientId: null, status: "QUALIFIED", updatedAt: new Date() })
      .where(eq(leads.id, lead.id));
  }

  await db.delete(clients).where(eq(clients.id, clientId));

  await recordAudit({
    action: "lead.conversion.undone",
    entity: "client",
    entityId: clientId,
    detail: lead ? `back to lead ${lead.id}` : "no lead behind this client",
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.leadReturned");
  revalidatePath("/clients");
  revalidatePath("/leads");
  redirect(lead ? `/leads/${lead.id}` : "/leads");
}

/**
 * Deleting an enquiry, which is not the same as destroying it.
 *
 * It goes to the recycle bin, disappears from every list and count, and can be
 * put back from the line at the bottom of the screen or from the bin itself for
 * the next thirty days.
 */
export async function deleteLead(leadId: string) {
  const user = await requireUser(["ADMIN"]);

  await db
    .update(leads)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  await recordAudit({
    action: "lead.binned",
    entity: "lead",
    entityId: leadId,
    userId: user.id,
    userEmail: user.email,
  });

  await offerUndo({ kind: "lead.deleted", was: [{ id: leadId }] });
  await flash("said.movedToBin");
  revalidatePath("/leads");
  redirect("/leads");
}

/**
 * The status changed from the list itself.
 *
 * It answers with an error rather than throwing, because the cell that called
 * it shows the reason under itself and puts the old value back.
 */
export async function setLeadStatusInline(
  leadId: string,
  status: string,
): Promise<{ error?: string }> {
  const user = await requireUser(["ADMIN"]);
  if (!STATUSES.includes(status as LeadStatus)) return { error: "Unknown status" };

  const [before] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!before) return { error: "That enquiry is gone" };

  if (before.status === "CONVERTED" && status !== "CONVERTED" && before.clientId) {
    // Undoing a conversion is its own action, with its own checks.
    return { error: "Use undo the conversion on the client" };
  }

  /**
   * Chosen from the list itself, Became a client does the same move, and the
   * row disappears from the list because a client is not an enquiry any more.
   */
  if (status === "CONVERTED") {
    const clientId = await makeClient(leadId, user);
    if (!clientId) return { error: "That enquiry is gone" };
    await flash("said.leadConverted");
    revalidatePath("/leads");
    revalidatePath("/clients");
    return {};
  }

  await db
    .update(leads)
    .set({ status: status as LeadStatus, updatedAt: new Date() })
    .where(eq(leads.id, leadId));

  await recordAudit({
    action: "lead.status",
    entity: "lead",
    entityId: leadId,
    detail: status,
    userId: user.id,
    userEmail: user.email,
  });

  await offerUndo({ kind: "lead.status", was: [{ id: leadId, value: before.status }] });
  await flash("said.statusSet");
  revalidatePath("/leads");
  return {};
}

/**
 * The same two things, done to everything chosen.
 *
 * The bar sends either the ticked ids or, when somebody escalated to the whole
 * filtered set, the filters themselves. Sending the filters rather than three
 * thousand ids is what makes "all matching" honest: the server works out the
 * set the same way the list did.
 */
async function chosenLeadIds(formData: FormData): Promise<string[]> {
  if (String(formData.get("scope") ?? "page") === "all") {
    const { rows } = await listLeads({
      query: String(formData.get("q") ?? ""),
      status: String(formData.get("status") ?? ""),
      source: String(formData.get("source") ?? ""),
      limit: 5000,
      offset: 0,
    });
    return rows.map((row) => row.lead.id);
  }
  return formData.getAll("ids").map(String).filter(Boolean);
}

export async function bulkLeadStatus(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const status = String(formData.get("newStatus") ?? "");
  const ids = await chosenLeadIds(formData);

  if (!STATUSES.includes(status as LeadStatus) || ids.length === 0) {
    await flash("said.nothingChosen", "bad");
    revalidatePath("/leads");
    return;
  }

  // What each one was, so the whole change can be taken back in one go.
  const before = await db.select().from(leads).where(inArray(leads.id, ids));
  const movable = before.filter((row) => row.status !== "CONVERTED");

  await db
    .update(leads)
    .set({ status: status as LeadStatus, updatedAt: new Date() })
    .where(
      inArray(
        leads.id,
        movable.map((row) => row.id),
      ),
    );

  await recordAudit({
    action: "lead.status.bulk",
    entity: "lead",
    detail: `${movable.length} set to ${status}, ${before.length - movable.length} left alone`,
    userId: user.id,
    userEmail: user.email,
  });

  await offerUndo({
    kind: "lead.status",
    was: movable.map((row) => ({ id: row.id, value: row.status })),
  });
  await flash("said.statusSet");
  revalidatePath("/leads");
}

export async function bulkLeadBin(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const ids = await chosenLeadIds(formData);

  if (ids.length === 0) {
    await flash("said.nothingChosen", "bad");
    revalidatePath("/leads");
    return;
  }

  await db
    .update(leads)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(inArray(leads.id, ids));

  await recordAudit({
    action: "lead.binned.bulk",
    entity: "lead",
    detail: `${ids.length} moved to the bin`,
    userId: user.id,
    userEmail: user.email,
  });

  await offerUndo({ kind: "lead.deleted", was: ids.map((id) => ({ id })) });
  await flash("said.movedToBin");
  revalidatePath("/leads");
}

/**
 * A new key for the website.
 *
 * It is shown once, on the page that follows, and never again. The key itself is
 * not stored, only a hash of it, so nobody can read it back out of the database.
 */
export async function makeApiKey(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const name = String(formData.get("name") ?? "").trim() || "Website";

  const { key } = await createApiKey(name, user.email);

  await recordAudit({
    action: "apikey.create",
    entity: "api_key",
    detail: name,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.keyMade");
  revalidatePath("/leads/api");
  redirect(`/leads/api?key=${encodeURIComponent(key)}`);
}

export async function killApiKey(keyId: string) {
  const user = await requireUser(["ADMIN"]);
  await revokeApiKey(keyId);
  await recordAudit({
    action: "apikey.revoke",
    entity: "api_key",
    entityId: keyId,
    userId: user.id,
    userEmail: user.email,
  });
  revalidatePath("/leads/api");
}
