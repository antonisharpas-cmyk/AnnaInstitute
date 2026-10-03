import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, shareLinks } from "@/db/schema";
import { fillPlaceholders, placeholdersLeft } from "@/lib/messaging";
import { aboutFromChoices, aboutOf, aboutValues } from "@/lib/campaignAbout";
import { campaignAttachments, filesLinkFor, filesUrl } from "@/lib/campaignFiles";
import { idsOf, projectsBlock } from "@/lib/campaignProjects";
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
const ownNote = (campaign: Campaign) => `For the campaign "${campaign.title}"`;

/**
 * What a campaign's own price list shows: the developments it shows, or the
 * apartment or the development it is about, or everything.
 */
async function scopeOf(campaign: Campaign): Promise<{ projectId: string | null; unitId: string | null; projectIds: string | null }> {
  const shown = idsOf(campaign.projectIds);
  const about = aboutOf(campaign);
  /* About one apartment and showing no development: the list is about that apartment. */
  if (shown.length === 0 && about.length <= 1 && campaign.unitId) return { projectId: null, unitId: campaign.unitId, projectIds: null };
  /* Otherwise every development it shows and every development it is about, together.
     A campaign started from one development and then about two more shows all of them. */
  const aboutProjects = about.length > 0 ? (await aboutFromChoices(about)).projects : campaign.projectId ? [campaign.projectId] : [];
  const all = [...new Set([...shown, ...aboutProjects])];
  if (all.length > 1) return { projectId: null, unitId: null, projectIds: JSON.stringify(all) };
  if (all.length === 1) return { projectId: all[0], unitId: null, projectIds: null };
  return { projectId: null, unitId: null, projectIds: null };
}

export async function ensureCampaignLinks(campaign: Campaign, byEmail: string): Promise<Campaign> {
  let current = campaign;
  const words = `${campaign.subject ?? ""} ${campaign.body} ${campaign.bodyWhatsapp ?? ""}`;

  if (/\{\{\s*price[ _]list[ _]url\s*\}\}/i.test(words)) {
    let usable = false;
    if (campaign.shareLinkId) {
      const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, campaign.shareLinkId)).limit(1);
      usable = Boolean(link && (await resolvePriceListToken(link.token)));
      /* The campaign's own link follows what the campaign is about: choose
         apartment 101 and the link shows apartment 101, choose the development
         and it shows the development. The address stays the same. A link the
         office picked from its own list is left exactly as it is. */
      const own = link && (link.campaignId === campaign.id || link.note === ownNote(campaign));
      const scope = await scopeOf(campaign);
      if (
        usable &&
        own &&
        (link.projectId !== scope.projectId ||
          link.unitId !== scope.unitId ||
          (link.projectIds ?? null) !== scope.projectIds ||
          !link.campaignId)
      ) {
        await db
          .update(shareLinks)
          .set({ ...scope, campaignId: campaign.id })
          .where(eq(shareLinks.id, link.id));
      }
    }
    if (!usable) {
      const made = await createPriceListLink({
        note: ownNote(campaign),
        createdByEmail: byEmail,
        ...(await scopeOf(campaign)),
        campaignId: campaign.id,
      });
      await db.update(campaigns).set({ shareLinkId: made.id }).where(eq(campaigns.id, campaign.id));
      current = { ...current, shareLinkId: made.id };
    }
  }

  /* Its own files, or the developments' papers and pictures, get their page. */
  if ((await campaignAttachments(campaign.id)).length > 0) await filesLinkFor(campaign.id, byEmail);

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
  /* The developments it shows, each with its apartments and prices, for {{projects}}. */
  const shown = await projectsBlock(idsOf(campaign.projectIds));
  const showing: Record<string, string> = shown ? { projects: shown.text, project_names: shown.names } : {};
  return { ...(await aboutExtras(campaign, month)), ...showing };
}

async function aboutExtras(campaign: Campaign, month: string): Promise<Record<string, string>> {
  return { ...(await aboutValues(campaign, "en")), month };
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
  const hasFiles = (await campaignAttachments(campaign.id)).length > 0;

  /* The same steps as the real send: the files link on the end when the message
     does not place it itself, and the opt out line for clients. */
  const words = campaign.bodyWhatsapp ?? campaign.body;
  const withFiles =
    hasFiles && values.filesUrl && !words.includes("{{files_url}}") ? `${words}\n${values.filesUrl}` : words;
  let text = fillPlaceholders(withFiles, values);
  const clientsToo = campaign.toClients || campaign.toLeads || campaign.audience === "CLIENTS_CONSENTED";
  if (clientsToo && !/reply stop/i.test(text)) text = `${text}\nReply STOP to opt out.`;

  const phone = (await readSetting("campaigns.testPhone")).trim();
  const digits = phone.replace(/\D/g, "");
  const link = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  return { text, link, phone };
}
