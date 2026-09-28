import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, campaigns, shareLinks } from "@/db/schema";
import { fillPlaceholders } from "@/lib/messaging";
import { filesUrl } from "@/lib/campaignFiles";
import { priceListUrl } from "@/lib/priceList";
import { readSetting } from "@/lib/settings";

/**
 * What a campaign looks like when the office tries it on itself.
 *
 * An example name in place of each recipient's, and the real links: the live
 * price list and the page with the campaign's files, exactly as the audience
 * will get them.
 */
type Campaign = typeof campaigns.$inferSelect;

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
