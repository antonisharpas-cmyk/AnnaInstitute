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
  messages,
  shareLinks,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { storeDocument } from "@/lib/uploads";
import { resolveStored } from "@/lib/storage";
import { fillPlaceholders, sendAndRecord } from "@/lib/messaging";
import { createPriceListLink, priceListUrl } from "@/lib/priceList";
import { filesLinkFor, filesUrl } from "@/lib/campaignFiles";

export async function createCampaign(formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const audience = String(formData.get("audience") ?? "CLIENTS_CONSENTED") as
    "CLIENTS_CONSENTED" | "AGENTS";

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
      title: files.length === 1 ? `Attachment` : `Attachment ${index + 1}`,
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

export async function audienceFor(audience: "CLIENTS_CONSENTED" | "AGENTS") {
  if (audience === "AGENTS") {
    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.isActive, true))
      .orderBy(asc(agents.name));
    return rows.map((a) => ({
      name: a.name,
      firstName: a.name.split(" ")[0] ?? a.name,
      email: a.email,
      phone: a.phone,
      agentId: a.id,
      clientId: null as string | null,
    }));
  }

  // Only clients who are opted in and have never unsubscribed. This is the whole
  // point of the consent field: the audience is built from it, never from
  // everybody in the database.
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.marketingOptIn, true), isNull(clients.unsubscribedAt)))
    .orderBy(asc(clients.lastName));

  return rows.map((c) => ({
    name: `${c.firstName} ${c.lastName}`.trim(),
    firstName: c.firstName,
    email: c.email,
    phone: c.phone,
    clientId: c.id,
    agentId: null as string | null,
  }));
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

  const recipients = await audienceFor(campaign.audience);
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
        withOptOut: campaign.audience === "CLIENTS_CONSENTED",
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
        withOptOut: campaign.audience === "CLIENTS_CONSENTED",
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

  revalidatePath(`/campaigns/${campaignId}`);
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
