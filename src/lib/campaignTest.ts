import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, campaigns, shareLinks } from "@/db/schema";
import { fillPlaceholders, placeholdersLeft } from "@/lib/messaging";
import { detailsForProject, detailsForUnit } from "@/lib/templates";
import { filesLinkFor, filesUrl } from "@/lib/campaignFiles";
import { createPriceListLink, priceListUrl, resolvePriceListToken } from "@/lib/priceList";
import { readSetting } from "@/lib/settings";

/**
 * What a campaign looks like when the office tries it on itself.
 *
 * An example name in place of each recipient's, and the real links: the live
 * price list and the page with the campaign's files, exactly as the audience
 * will get them.
 */
type Campaign = typeof campaigns.$inferSelect;

/**
 * The links a campaign needs, made for it when the office has not chosen them.
 *
 * A template that says {{price_list_url}} gets a live price list link of its
 * own the first time it is saved, tested or sent without one, so the office
 * never has to make a link first and the page always shows today's prices. A
 * link that was revoked or has run out is replaced the same way. Files get
 * their page as soon as there are any, for WhatsApp and for {{files_url}} in
 * the email.
 */
export async function ensureCampaignLinks(campaign: Campaign, byEmail: string): Promise<Campaign> {
  let current = campaign;
  const words = `${campaign.subject ?? ""} ${campaign.body} ${campaign.bodyWhatsapp ?? ""}`;

  if (/\{\{\s*price[ _]list[ _]url\s*\}\}/i.test(words)) {
    let usable = false;
    if (campaign.shareLinkId) {
      const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, campaign.shareLinkId)).limit(1);
      usable = Boolean(link && (await resolvePriceListToken(link.token)));
    }
    if (!usable) {
      const made = await createPriceListLink({ note: `For the campaign "${campaign.title}"`, createdByEmail: byEmail });
      await db.update(campaigns).set({ shareLinkId: made.id }).where(eq(campaigns.id, campaign.id));
      current = { ...current, shareLinkId: made.id };
    }
  }

  const [hasFiles] = await db
    .select({ id: campaignDocuments.documentId })
    .from(campaignDocuments)
    .where(eq(campaignDocuments.campaignId, campaign.id))
    .limit(1);
  if (hasFiles) await filesLinkFor(campaign.id, byEmail);

  return current;
}

/**
 * The words about the development or the apartment the campaign is about.
 *
 * Filled when it is tested and when it is sent, so a template picked without
 * starting from a development still reads properly. The month is always known.
 * A campaign about a whole development has no apartment and no price, so those
 * two are left out and are caught as unfilled rather than sent as blanks.
 */
export async function campaignExtras(campaign: Campaign): Promise<Record<string, string>> {
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  if (campaign.unitId) {
    const unit = await detailsForUnit(campaign.unitId, "en");
    if (unit) return { ...unit, month };
  }
  if (campaign.projectId) {
    const project = await detailsForProject(campaign.projectId, "en");
    if (project) {
      const { unit: _unit, price: _price, ...rest } = project;
      void _unit;
      void _price;
      return { ...rest, month };
    }
  }
  return { month };
}

/**
 * The placeholders that would go out as they are, in the subject, the email or
 * the WhatsApp. Sending and testing both stop while there are any, and say which.
 */
export async function unfilledIn(campaign: Campaign): Promise<string[]> {
  const values = await testValues(campaign);
  return placeholdersLeft(
    campaign.viaEmail ? fillPlaceholders(campaign.subject ?? "", values) : "",
    campaign.viaEmail ? fillPlaceholders(campaign.body, values) : "",
    campaign.viaWhatsapp ? fillPlaceholders(campaign.bodyWhatsapp ?? campaign.body, values) : "",
  );
}

export async function testValues(campaign: Campaign) {
  let price: string | undefined;
  if (campaign.shareLinkId) {
    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, campaign.shareLinkId)).limit(1);
    if (link) price = priceListUrl(link.token);
  }
  const [files] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.kind, "CAMPAIGN_FILES"), eq(shareLinks.campaignId, campaign.id)))
    .limit(1);
  return {
    name: "Maria Georgiou",
    firstName: "Maria",
    priceListUrl: price,
    filesUrl: files ? filesUrl(files.token) : undefined,
    extras: await campaignExtras(campaign),
  };
}

/**
 * The WhatsApp message, finished, and a link that opens WhatsApp with it.
 *
 * The CRM cannot send WhatsApp itself until the SMS.to account and its number
 * are approved, so the test opens WhatsApp on this computer or phone with the
 * message already typed, addressed to the office's own number. Sending it to
 * yourself shows exactly what a client would see, links and all.
 */
export async function whatsappTest(campaign: Campaign): Promise<{ text: string; link: string; phone: string } | null> {
  if (!campaign.viaWhatsapp) return null;
  const values = await testValues(campaign);
  const [hasFiles] = await db
    .select({ id: campaignDocuments.documentId })
    .from(campaignDocuments)
    .where(eq(campaignDocuments.campaignId, campaign.id))
    .limit(1);

  /* The same steps as the real send: the files link on the end when the message
     does not place it itself, and the opt out line for clients. */
  const words = campaign.bodyWhatsapp ?? campaign.body;
  const withFiles =
    hasFiles && values.filesUrl && !words.includes("{{files_url}}") ? `${words}\n${values.filesUrl}` : words;
  let text = fillPlaceholders(withFiles, values);
  const clientsToo = campaign.toClients || campaign.audience === "CLIENTS_CONSENTED";
  if (clientsToo && !/reply stop/i.test(text)) text = `${text}\nReply STOP to opt out.`;

  const phone = (await readSetting("campaigns.testPhone")).trim();
  const digits = phone.replace(/\D/g, "");
  const link = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  return { text, link, phone };
}
