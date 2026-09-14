"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  campaignDocuments,
  campaigns,
  clients,
  documents,
  emailTemplates,
  messages,
  shareLinks,
  subowners,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { storeDocument } from "@/lib/uploads";
import { resolveStored } from "@/lib/storage";
import { fillPlaceholders, sendAndRecord } from "@/lib/messaging";
import { createPriceListLink, priceListUrl } from "@/lib/priceList";
import { filesLinkFor, filesUrl } from "@/lib/campaignFiles";

export async function createCampaign(formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  // Three groups, any combination. The old single audience column is kept in
  // step with them so older campaigns and the two lists still read correctly.
  const toClients = String(formData.get("toClients") ?? "") === "on";
  const toAgents = String(formData.get("toAgents") ?? "") === "on";
  const toSubowners = String(formData.get("toSubowners") ?? "") === "on";
  if (!toClients && !toAgents && !toSubowners) {
    throw new Error("Choose at least one group to send it to.");
  }
  const audience = toClients ? "CLIENTS_CONSENTED" : toAgents ? "AGENTS" : "SUBOWNERS";

  const viaEmail = String(formData.get("viaEmail") ?? "") === "on";
  const viaWhatsapp = String(formData.get("viaWhatsapp") ?? "") === "on";
  if (!viaEmail && !viaWhatsapp) {
    throw new Error("Choose at least one way to send it, email or WhatsApp.");
  }

  const body = String(formData.get("body") ?? "").trim();
  const bodyWhatsapp = String(formData.get("bodyWhatsapp") ?? "").trim();
  if (viaEmail && !body) throw new Error("Write the email first.");
  if (viaWhatsapp && !bodyWhatsapp) throw new Error("Write the WhatsApp message first.");

  const inserted = await db
    .insert(campaigns)
    .values({
      title: String(formData.get("title") ?? "").trim() || "Untitled",
      // The log keeps a channel per message; this one only says what it started as.
      channel: viaEmail ? "EMAIL" : "WHATSAPP",
      viaEmail,
      viaWhatsapp,
      audience,
      toClients,
      toAgents,
      toSubowners,
      templateKey: String(formData.get("templateKey") ?? "") || null,
      subject: String(formData.get("subject") ?? "") || null,
      body: body || bodyWhatsapp,
      bodyWhatsapp: bodyWhatsapp || null,
      shareLinkId: String(formData.get("shareLinkId") ?? "") || null,
      createdByEmail: user.email,
    })
    .returning({ id: campaigns.id });

  const campaignId = inserted[0].id;

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  for (const [index, file] of files.entries()) {
    const documentId = await storeDocument({
      file,
      // The office recognises its own file names, so the upload keeps its name
      // rather than being listed as "Attachment 2".
      title: file.name.replace(/\.[^.]+$/, "").trim() || `Attachment ${index + 1}`,
      category: "OTHER",
      attachTo: {},
      user,
    });
    await db.insert(campaignDocuments).values({ campaignId, documentId });
  }

  // A WhatsApp message cannot carry the files, so they get a link of their own.
  if (files.length > 0 && viaWhatsapp) {
    await filesLinkFor(campaignId, user.email);
  }

  await recordAudit({
    action: "campaign.create",
    entity: "campaign",
    entityId: campaignId,
    detail: `${[viaEmail ? "email" : null, viaWhatsapp ? "whatsapp" : null]
      .filter(Boolean)
      .join(" and ")} to ${audience}, ${files.length} attachment(s)`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaignId}`);
}

export type CampaignGroups = {
  toClients?: boolean;
  toAgents?: boolean;
  toSubowners?: boolean;
  /** Older campaigns carried one audience rather than three flags. */
  audience?: "CLIENTS_CONSENTED" | "AGENTS" | "SUBOWNERS";
};

/**
 * Who a campaign goes to.
 *
 * Clients are the careful case: only those who are opted in and have never
 * unsubscribed, which is the whole point of the consent field. Agents and
 * partners are business contacts, so the list is everyone still active.
 */
export async function audienceFor(groups: CampaignGroups) {
  const wantsClients = groups.toClients ?? groups.audience === "CLIENTS_CONSENTED";
  const wantsAgents = groups.toAgents ?? groups.audience === "AGENTS";
  const wantsSubowners = groups.toSubowners ?? groups.audience === "SUBOWNERS";

  const people: {
    name: string;
    firstName: string;
    email: string | null;
    phone: string | null;
    clientId: string | null;
    agentId: string | null;
    subownerId: string | null;
    group: "CLIENTS" | "AGENTS" | "SUBOWNERS";
  }[] = [];

  if (wantsClients) {
    const rows = await db
      .select()
      .from(clients)
      .where(and(eq(clients.marketingOptIn, true), isNull(clients.unsubscribedAt)))
      .orderBy(asc(clients.lastName));

    for (const c of rows) {
      people.push({
        name: `${c.firstName} ${c.lastName}`.trim(),
        firstName: c.firstName,
        email: c.email,
        phone: c.phone,
        clientId: c.id,
        agentId: null,
        subownerId: null,
        group: "CLIENTS",
      });
    }
  }

  if (wantsAgents) {
    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.isActive, true))
      .orderBy(asc(agents.name));

    for (const a of rows) {
      people.push({
        name: a.name,
        firstName: a.name.split(" ")[0] ?? a.name,
        email: a.email,
        phone: a.phone,
        clientId: null,
        agentId: a.id,
        subownerId: null,
        group: "AGENTS",
      });
    }
  }

  if (wantsSubowners) {
    const rows = await db
      .select()
      .from(subowners)
      .where(and(eq(subowners.isActive, true), isNull(subowners.unsubscribedAt)))
      .orderBy(asc(subowners.name));

    for (const s of rows) {
      const contact = s.contactName?.trim() || s.name;
      people.push({
        name: contact,
        firstName: contact.split(" ")[0] ?? contact,
        email: s.email,
        phone: s.phone,
        clientId: null,
        agentId: null,
        subownerId: s.id,
        group: "SUBOWNERS",
      });
    }
  }

  return people;
}

export async function sendCampaign(campaignId: string) {
  const user = await requireUser(["ADMIN"]);

  const rows = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  const campaign = rows[0];
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "SENT" || campaign.status === "SENDING") {
    throw new Error("This campaign has already been sent.");
  }

  await db.update(campaigns).set({ status: "SENDING" }).where(eq(campaigns.id, campaignId));

  const attachmentRows = await db
    .select({ document: documents })
    .from(campaignDocuments)
    .innerJoin(documents, eq(documents.id, campaignDocuments.documentId))
    .where(eq(campaignDocuments.campaignId, campaignId));

  const attachments = attachmentRows.map((r) => ({
    filename: r.document.originalName ?? path.basename(r.document.filePath),
    path: resolveStored(r.document.filePath),
    contentType: r.document.mimeType ?? undefined,
  }));

  let url: string | undefined;
  if (campaign.shareLinkId) {
    const linkRows = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.id, campaign.shareLinkId))
      .limit(1);
    if (linkRows[0]) url = priceListUrl(linkRows[0].token);
  }

  // The files reach WhatsApp as a link, and the link is added to the end of the
  // message when the office has not put {{files_url}} in it itself.
  let files: string | undefined;
  if (attachmentRows.length > 0 && campaign.viaWhatsapp) {
    const link = await filesLinkFor(campaignId, user.email);
    files = filesUrl(link.token);
  }

  const recipients = await audienceFor(campaign);
  let sent = 0;
  let failed = 0;

  const whatsappBody = campaign.bodyWhatsapp ?? campaign.body;
  const withFilesLink =
    files && !whatsappBody.includes("{{files_url}}") ? `${whatsappBody}\n${files}` : whatsappBody;

  for (const recipient of recipients) {
    const values = { ...recipient, priceListUrl: url, filesUrl: files };

    if (campaign.viaEmail) {
      const result = await sendAndRecord({
        campaignId,
        channel: "EMAIL",
        recipient,
        subject: campaign.subject ? fillPlaceholders(campaign.subject, values) : null,
        body: fillPlaceholders(campaign.body, values),
        withOptOut: recipient.group === "CLIENTS",
        attachments,
      });
      if (result.status === "SENT" || result.status === "SIMULATED") sent += 1;
      else failed += 1;
    }

    if (campaign.viaWhatsapp) {
      const result = await sendAndRecord({
        campaignId,
        channel: "WHATSAPP",
        recipient,
        body: fillPlaceholders(withFilesLink, values),
        withOptOut: recipient.group === "CLIENTS",
      });
      if (result.status === "SENT" || result.status === "SIMULATED") sent += 1;
      else failed += 1;
    }
  }

  await db
    .update(campaigns)
    .set({
      status: failed === 0 ? "SENT" : sent === 0 ? "FAILED" : "PARTLY_FAILED",
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  await recordAudit({
    action: "campaign.send",
    entity: "campaign",
    entityId: campaignId,
    detail: `${sent} handled, ${failed} not sent, ${recipients.length} in the audience`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.campaignSent");
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

/** Rewrite one of the ready made messages. */
export async function saveTemplate(templateId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  await db
    .update(emailTemplates)
    .set({
      name: String(formData.get("name") ?? "").trim() || "Untitled",
      description: String(formData.get("description") ?? "").trim() || null,
      subject: String(formData.get("subject") ?? "").trim() || null,
      body: String(formData.get("body") ?? "").trim(),
      bodyWhatsapp: String(formData.get("bodyWhatsapp") ?? "").trim() || null,
      subjectEl: String(formData.get("subjectEl") ?? "").trim() || null,
      bodyEl: String(formData.get("bodyEl") ?? "").trim() || null,
      bodyWhatsappEl: String(formData.get("bodyWhatsappEl") ?? "").trim() || null,
      toClients: String(formData.get("toClients") ?? "") === "on",
      toAgents: String(formData.get("toAgents") ?? "") === "on",
      toSubowners: String(formData.get("toSubowners") ?? "") === "on",
      updatedAt: new Date(),
    })
    .where(eq(emailTemplates.id, templateId));

  await recordAudit({
    action: "template.update",
    entity: "email_template",
    entityId: templateId,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.templateSaved");
  revalidatePath("/campaigns/templates");
  revalidatePath("/campaigns");
}

export async function makePriceListLink(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const days = String(formData.get("days") ?? "").trim();

  await createPriceListLink({
    note: String(formData.get("note") ?? "") || null,
    days: days ? Number(days) : null,
    createdByEmail: user.email,
  });

  revalidatePath("/campaigns");
}

export async function revokePriceListLink(shareLinkId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, shareLinkId));

  await recordAudit({
    action: "priceList.link.revoke",
    entity: "shareLink",
    entityId: shareLinkId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/campaigns");
}

export async function messagesForCampaign(campaignId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.campaignId, campaignId))
    .orderBy(asc(messages.createdAt));
}
