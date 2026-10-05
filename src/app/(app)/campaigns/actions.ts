"use server";

import { sameEmail, samePhone } from "@/lib/samePerson";

import { aboutFromChoices } from "@/lib/campaignAbout";
import { agentWay } from "@/lib/agentWay";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  leads,
  campaignDocuments,
  campaigns,
  clients,
  emailTemplates,
  messages,
  shareLinks,
  subowners,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { storeDocument } from "@/lib/uploads";
import { addressFor, fillPlaceholders, letterHtml, sendAndRecord } from "@/lib/messaging";
import { sendEmail } from "@/lib/messaging/email";
import { normalisePhone } from "@/lib/messaging/text";
import { readSetting, writeSetting } from "@/lib/settings";
import { campaignExtras, ensureCampaignLinks, testValues, unfilledIn } from "@/lib/campaignTest";
import { createPriceListLink, priceListUrl } from "@/lib/priceList";
import { campaignAttachments, emailFilesWithin, filesLinkFor, filesUrl } from "@/lib/campaignFiles";
import { endRun, runOf, startRun, tickRun } from "@/lib/campaignProgress";

/** The line that takes the files too big to attach to the recipient. */
const FILES_LINE = "The brochures and drawings, too large to attach, are here:";
import { idsOf } from "@/lib/campaignProjects";

/**
 * What the campaign is about, from the form: "project:<id>", "unit:<id>" or nothing.
 * An apartment brings its development with it.
 */
async function aboutFrom(formData: FormData): Promise<{ projectId: string | null; unitId: string | null; aboutIds: string | null }> {
  /* Any number of developments and apartments, each its own "about" value. */
  const { projectId, unitId, aboutIds } = await aboutFromChoices(formData.getAll("about").map(String));
  return { projectId, unitId, aboutIds };
}

/** Change what a draft is about, so its placeholders can be filled. */
export async function setCampaignAbout(campaignId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const about = await aboutFrom(formData);
  await db.update(campaigns).set({ ...about, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  const [changed] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (changed) await ensureCampaignLinks(changed, user.email);
  await recordAudit({
    action: "campaign.about",
    entity: "campaign",
    entityId: campaignId,
    detail: about.aboutIds ?? (about.unitId ? `unit ${about.unitId}` : about.projectId ? `project ${about.projectId}` : "nothing in particular"),
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  revalidatePath(`/campaigns/${campaignId}`);
}

/** Change the developments a draft shows, for {{projects}}. */
export async function setCampaignProjects(campaignId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const projectIds = formData.getAll("projectIds").map(String).filter(Boolean);
  await db
    .update(campaigns)
    .set({ projectIds: projectIds.length > 0 ? JSON.stringify(projectIds) : null, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
  const [changed] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (changed) await ensureCampaignLinks(changed, user.email);
  await recordAudit({
    action: "campaign.projects",
    entity: "campaign",
    entityId: campaignId,
    detail: `${projectIds.length} developments`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function createCampaign(formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  // Three groups, any combination. The old single audience column is kept in
  // step with them so older campaigns and the two lists still read correctly.
  const toClients = String(formData.get("toClients") ?? "") === "on";
  const toAgents = String(formData.get("toAgents") ?? "") === "on";
  const toSubowners = String(formData.get("toSubowners") ?? "") === "on";
  const toLeads = String(formData.get("toLeads") ?? "") === "on";
  if (!toClients && !toAgents && !toSubowners && !toLeads) {
    throw new Error("Choose at least one group to send it to.");
  }
  const audience = toClients ? "CLIENTS_CONSENTED" : toAgents ? "AGENTS" : "SUBOWNERS";
  /* Every lead, or only the ones ticked. Ticking none of them means every one. */
  const leadIds =
    toLeads && String(formData.get("leadMode") ?? "all") === "chosen"
      ? formData.getAll("leadIds").map(String).filter(Boolean)
      : [];
  const projectIds = formData.getAll("projectIds").map(String).filter(Boolean);

  const viaEmail = String(formData.get("viaEmail") ?? "") === "on";
  const viaWhatsapp = String(formData.get("viaWhatsapp") ?? "") === "on";
  /* For the agents who want both, the one way this campaign reaches them. */
  const bothRaw = String(formData.get("agentsBothVia") ?? "");
  const agentsBothVia = toAgents && (bothRaw === "EMAIL" || bothRaw === "WHATSAPP") ? bothRaw : null;
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
      agentsBothVia,
      audience,
      toClients,
      toAgents,
      toSubowners,
      toLeads,
      leadIds: leadIds.length > 0 ? JSON.stringify(leadIds) : null,
      projectIds: projectIds.length > 0 ? JSON.stringify(projectIds) : null,
      templateKey: String(formData.get("templateKey") ?? "") || null,
      subject: String(formData.get("subject") ?? "") || null,
      body: body || bodyWhatsapp,
      bodyWhatsapp: bodyWhatsapp || null,
      shareLinkId: String(formData.get("shareLinkId") ?? "") || null,
      ...(await aboutFrom(formData)),
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

  // The price list link and the files page, made now when the office has not chosen them.
  const [saved] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (saved) await ensureCampaignLinks(saved, user.email);

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
  toLeads?: boolean;
  /** JSON list of the leads chosen by hand; empty is every lead. */
  leadIds?: string | null;
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
    leadId?: string | null;
    group: "CLIENTS" | "AGENTS" | "SUBOWNERS" | "LEADS";
    /** An agent's own choice of how campaigns reach them: EMAIL, WHATSAPP or BOTH. */
    agentChannel?: string;
  }[] = [];

  if (wantsClients) {
    const rows = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.marketingOptIn, true),
          isNull(clients.unsubscribedAt),
          isNull(clients.deletedAt),
        ),
      )
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
        agentChannel: a.campaignChannel,
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

  if (groups.toLeads) {
    /* The leads still open: not deleted, not already a client. Chosen by
       hand when the office ticked some, every one of them otherwise. */
    const chosen = idsOf(groups.leadIds);
    const rows = await db
      .select()
      .from(leads)
      .where(
        and(
          isNull(leads.deletedAt),
          isNull(leads.clientId),
          chosen.length > 0 ? inArray(leads.id, chosen) : undefined,
        ),
      )
      .orderBy(asc(leads.createdAt));

    for (const l of rows) {
      const name = `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || l.email || l.phone || "";
      people.push({
        name,
        firstName: (l.firstName ?? "").trim() || name.split(" ")[0] || "",
        email: l.email,
        phone: l.phone,
        clientId: null,
        agentId: null,
        subownerId: null,
        leadId: l.id,
        group: "LEADS",
      });
    }
  }

  return people;
}

export async function sendCampaign(campaignId: string) {
  const user = await requireUser(["ADMIN"]);

  const rows = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!rows[0]) throw new Error("Campaign not found");
  const campaign = await ensureCampaignLinks(rows[0], user.email);
  if (campaign.status !== "DRAFT") {
    await flash("said.campaignAlreadySent", "bad");
    revalidatePath(`/campaigns/${campaignId}`);
    return;
  }

  /* Nothing goes out with {{project}} in it: the office is told which placeholders have no value. */
  const unfilled = await unfilledIn(campaign);
  if (unfilled.length > 0) {
    await flash(`said.placeholdersLeft|${unfilled.join(", ")}`, "bad");
    revalidatePath(`/campaigns/${campaignId}`);
    return;
  }

  await db.update(campaigns).set({ status: "SENDING", updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  await recordAudit({
    action: "campaign.send.start",
    entity: "campaign",
    entityId: campaignId,
    detail: campaign.title,
    userId: user.id,
    userEmail: user.email,
  });

  /*
   * Sent in the background.
   *
   * The button answers at once and the page shows how far it has got, rather
   * than the office watching a button say Sending for as long as the mail
   * server takes over every letter.
   */
  startRun(campaignId, 0);
  void runCampaign(campaignId, { id: user.id, email: user.email });

  await flash("said.campaignSending");
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

/**
 * Carry on with a campaign that stopped half way.
 *
 * When the CRM restarts in the middle of a send, the campaign is left saying
 * Sending with nothing sending it. This picks it up again, and only the people
 * not yet written to get it: nobody receives it twice.
 */
export async function resumeCampaign(campaignId: string) {
  const user = await requireUser(["ADMIN"]);
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign || campaign.status !== "SENDING" || runOf(campaignId)) {
    revalidatePath(`/campaigns/${campaignId}`);
    return;
  }
  await recordAudit({
    action: "campaign.send.resume",
    entity: "campaign",
    entityId: campaignId,
    detail: campaign.title,
    userId: user.id,
    userEmail: user.email,
  });
  startRun(campaignId, 0);
  void runCampaign(campaignId, { id: user.id, email: user.email });
  await flash("said.campaignSending");
  revalidatePath(`/campaigns/${campaignId}`);
}

/** Who a message went to, the same way whether it is being sent or was already. */
const whoKey = (
  channel: string,
  one: { clientId?: string | null; agentId?: string | null; subownerId?: string | null; leadId?: string | null; email?: string | null; phone?: string | null },
) => `${channel === "EMAIL" ? "EMAIL" : "TEXT"}|${one.clientId ?? one.agentId ?? one.subownerId ?? one.leadId ?? one.email ?? one.phone ?? ""}`;

/**
 * The send itself, one recipient after another.
 *
 * Everybody already written to for this campaign is skipped, so a run that
 * carries on after a restart never sends twice. Each letter has its own time
 * limit in the mail and WhatsApp code, so one that hangs is recorded as failed
 * and the rest carry on. Whatever happens, the campaign ends with a status.
 */
async function runCampaign(campaignId: string, who: { id: string; email: string }) {
  try {
    const [found] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!found) return;
    const campaign = await ensureCampaignLinks(found, who.email);

    /* What fits is attached; the rest, and the pictures, are on the campaign's files page. */
    const emailFiles = await emailFilesWithin(campaignId);
    const pageFiles = await campaignAttachments(campaignId);

    let url: string | undefined;
    if (campaign.shareLinkId) {
      const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, campaign.shareLinkId)).limit(1);
      if (link) url = priceListUrl(link.token);
    }
    let files: string | undefined;
    if (pageFiles.length > 0) {
      const link = await filesLinkFor(campaignId, who.email);
      files = filesUrl(link.token);
    }

    const recipients = await audienceFor(campaign);
    const extras = await campaignExtras(campaign);

    const whatsappBody = campaign.bodyWhatsapp ?? campaign.body;
    const withFilesLink = files && !whatsappBody.includes("{{files_url}}") ? `${whatsappBody}\n${files}` : whatsappBody;
    /* Files too big to attach reach the email as the files link. */
    const emailBody =
      emailFiles.linked.length > 0 && files && !campaign.body.includes("{{files_url}}")
        ? `${campaign.body}\n\n${FILES_LINE} ${files}`
        : campaign.body;

    const done = new Set(
      (
        await db
          .select({
            channel: messages.channel,
            clientId: messages.clientId,
            agentId: messages.agentId,
            subownerId: messages.subownerId,
            leadId: messages.leadId,
          })
          .from(messages)
          .where(eq(messages.campaignId, campaignId))
      ).map((one) => whoKey(one.channel, one)),
    );

    /* Every letter to go, worked out first, so the page can say how many. */
    const plan: { recipient: (typeof recipients)[number]; channel: "EMAIL" | "WHATSAPP" }[] = [];
    for (const recipient of recipients) {
      /* An agent hears once, the way they chose; everybody else on every way ticked. */
      const way = recipient.group === "AGENTS" ? agentWay(recipient.agentChannel, campaign) : null;
      if (campaign.viaEmail && (way === null || way === "EMAIL")) plan.push({ recipient, channel: "EMAIL" });
      if (campaign.viaWhatsapp && (way === null || way === "WHATSAPP")) plan.push({ recipient, channel: "WHATSAPP" });
    }
    const todo = plan.filter((one) => !done.has(whoKey(one.channel, one.recipient)));
    startRun(campaignId, todo.length);

    /*
     * Each address once. One person can be in the audience twice, a client who
     * is also an agent, or two records with the same email or mobile, and they
     * get the campaign once on each way. What already went for this campaign,
     * in an earlier run, counts too.
     */
    const addressKey = (channel: string, address: string | null | undefined) => {
      const key = channel === "EMAIL" ? sameEmail(address) : samePhone(address);
      return key ? `${channel === "EMAIL" ? "EMAIL" : "TEXT"}|${key}` : null;
    };
    const reached = new Set(
      (
        await db
          .select({ channel: messages.channel, toAddress: messages.toAddress })
          .from(messages)
          .where(eq(messages.campaignId, campaignId))
      )
        .map((one) => addressKey(one.channel, one.toAddress))
        .filter(Boolean) as string[],
    );

    for (const { recipient, channel } of todo) {
      const key = addressKey(channel, addressFor(channel, recipient));
      if (key && reached.has(key)) {
        tickRun(campaignId);
        continue;
      }
      if (key) reached.add(key);
      const values = { ...recipient, priceListUrl: url, filesUrl: files, extras };
      try {
        if (channel === "EMAIL") {
          await sendAndRecord({
            campaignId,
            channel: "EMAIL",
            recipient,
            subject: campaign.subject ? fillPlaceholders(campaign.subject, values) : null,
            body: fillPlaceholders(emailBody, values),
            withOptOut: recipient.group === "CLIENTS" || recipient.group === "LEADS",
            attachments: emailFiles.attached,
          });
        } else {
          await sendAndRecord({
            campaignId,
            channel: "WHATSAPP",
            recipient,
            body: fillPlaceholders(withFilesLink, values),
            withOptOut: recipient.group === "CLIENTS" || recipient.group === "LEADS",
          });
        }
      } catch (error) {
        console.error("[campaign] one message could not be handled", campaignId, error);
      }
      tickRun(campaignId);
    }

    /* The status from everything recorded for the campaign, this run and any before it. */
    const outcome = await db
      .select({ status: messages.status })
      .from(messages)
      .where(eq(messages.campaignId, campaignId));
    const sent = outcome.filter((one) => one.status === "SENT" || one.status === "SIMULATED").length;
    const failed = outcome.length - sent;
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
      detail: `${sent} handled, ${failed} not sent, ${recipients.length} in the audience${emailFiles.linked.length ? `, ${emailFiles.linked.length} file(s) sent as a link` : ""}`,
      userId: who.id,
      userEmail: who.email,
    });
  } catch (error) {
    /* Left Sending, so the page offers to carry on; the reason is in the log. */
    console.error("[campaign] the send stopped", campaignId, error);
    await recordAudit({
      action: "campaign.send.stopped",
      entity: "campaign",
      entityId: campaignId,
      detail: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      userId: who.id,
      userEmail: who.email,
    }).catch(() => {});
  } finally {
    endRun(campaignId);
  }
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
    ...(await aboutFrom(formData)),
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

/* ---------------------------------------------------------------------------
   Trying a campaign on yourself first
   --------------------------------------------------------------------------- */

/** Where the office's own tests go: the same address as the automatic emails, and a WhatsApp number. */
export async function saveCampaignTester(campaignId: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const to = String(formData.get("to") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    await flash("said.testAddressBad", "bad");
    return;
  }
  if (phone && phone.replace(/\D/g, "").length < 8) {
    await flash("said.testPhoneBad", "bad");
    return;
  }
  await writeSetting("emails.testAddress", to);
  await writeSetting("campaigns.testPhone", phone ? normalisePhone(phone) : "");
  await flash("said.saved");
  revalidatePath(`/campaigns/${campaignId}`);
}

/**
 * The campaign's email, once, to the office's own inbox.
 *
 * The same subject, words, attachments and links the audience will get, with
 * [Test] in front of the subject and a first line saying so. Nothing is written
 * to the campaign's log and the campaign stays a draft, so it can be tried as
 * often as it takes and then sent for real.
 */
export async function sendCampaignTest(campaignId: string) {
  const user = await requireUser(["ADMIN"]);
  const [found] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!found) return;
  const campaign = await ensureCampaignLinks(found, user.email);
  const to = (await readSetting("emails.testAddress"))?.trim() || user.email;

  /* The same files as the real letter: what fits attached, the rest by the files link. */
  const emailFiles = await emailFilesWithin(campaignId);
  const attachments = emailFiles.attached;

  const unfilled = await unfilledIn(campaign);
  if (unfilled.length > 0) {
    await flash(`said.placeholdersLeft|${unfilled.join(", ")}`, "bad");
    revalidatePath(`/campaigns/${campaignId}`);
    return;
  }
  const values = await testValues(campaign);
  const clientsToo = campaign.toClients || campaign.toLeads || campaign.audience === "CLIENTS_CONSENTED";
  const intro = `This is a test of the campaign "${campaign.title}". It is what the audience will receive, with example names.`;
  let body = `${intro}\n\n${fillPlaceholders(campaign.body, values)}`;
  if (emailFiles.linked.length > 0 && !campaign.body.includes("{{files_url}}") && values.filesUrl) {
    body += `\n\n${FILES_LINE} ${values.filesUrl}`;
  }
  if (clientsToo) body += "\n\nIf you would rather not receive these, unsubscribe here: (each client gets their own link)";

  const result = await sendEmail({
    to,
    subject: `[Test] ${campaign.subject ? fillPlaceholders(campaign.subject, values) : campaign.title}`,
    text: body,
    html: letterHtml(body),
    attachments,
    pastTheSwitch: true,
  });

  await recordAudit({
    action: "campaign.test",
    entity: "campaign",
    entityId: campaignId,
    detail: `${to}: ${result.status}${result.error ? `, ${result.error}` : ""}`.slice(0, 300),
    userId: user.id,
    userEmail: user.email,
  });
  await flash(
    result.status === "SENT"
      ? `said.testLetterSent|${campaign.title} went to ${to}`
      : `said.testLetterFailed|${String(result.error ?? "no answer").slice(0, 200)}`,
    result.status === "SENT" ? "good" : "bad",
  );
  revalidatePath(`/campaigns/${campaignId}`);
}
