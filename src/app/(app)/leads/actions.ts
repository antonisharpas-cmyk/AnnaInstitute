"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, documents, leads } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
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
export async function createLead(formData: FormData) {
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

  if (!email && !phone) {
    throw new Error("Give the lead an email or a phone number, or there is no way to reply.");
  }

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

  revalidatePath("/leads");
  redirect(`/leads/${inserted[0].id}`);
}

export async function setLeadStatus(leadId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status as LeadStatus)) return;

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

export async function saveLeadNotes(leadId: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await db.update(leads).set({ notes, updatedAt: new Date() }).where(eq(leads.id, leadId));
  revalidatePath(`/leads/${leadId}`);
}

/**
 * A lead becomes a client.
 *
 * The consent box on a website form is not marketing consent on its own, so it
 * is carried over only when the office confirms it here. Everything else the
 * form said is copied into the client's notes rather than thrown away.
 */
export async function convertLead(leadId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const rows = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  const lead = rows[0];
  if (!lead) return;
  if (lead.clientId) redirect(`/clients/${lead.clientId}`);

  const firstName = String(formData.get("firstName") ?? "").trim() || lead.firstName || "Enquiry";
  const lastName = String(formData.get("lastName") ?? "").trim() || lead.lastName || "";
  const optIn = String(formData.get("optIn") ?? "") === "on";

  const notes = [
    lead.message ? `From the website: ${lead.message}` : null,
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
      source: "ENQUIRY",
      marketingOptIn: optIn,
      marketingOptInAt: optIn ? new Date() : null,
      marketingOptInSource: optIn ? "website form" : null,
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
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/leads");
  revalidatePath("/clients");
  redirect(`/clients/${inserted[0].id}`);
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

  revalidatePath("/clients");
  revalidatePath("/leads");
  redirect(lead ? `/leads/${lead.id}` : "/leads");
}

export async function deleteLead(leadId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.delete(leads).where(eq(leads.id, leadId));
  await recordAudit({
    action: "lead.delete",
    entity: "lead",
    entityId: leadId,
    userId: user.id,
    userEmail: user.email,
  });
  revalidatePath("/leads");
  redirect("/leads");
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
