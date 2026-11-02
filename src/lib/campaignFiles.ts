import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, campaigns, documents, projects, shareLinks } from "@/db/schema";
import { idsOf, projectPapers } from "./campaignProjects";
import { aboutFromChoices, aboutOf } from "./campaignAbout";
import { appUrl } from "./unsubscribe";

/**
 * The files of a campaign go by link, never as attachments. Four developments'
 * brochures, drawings and specifications come to far more than an email can
 * carry, and a letter that carried part of them left the rest out without
 * saying so. The link opens one page with a folder for each development.
 *
 * Each person the campaign goes to has a link of their own, so the office can
 * see who opened the files and when. The campaign's own link, with no person
 * on it, is the one the office previews and tests with; opening it is not
 * counted.
 */

/** The campaign's own link, the one with nobody's name on it. */
export async function campaignFilesLink(campaignId: string) {
  const [found] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.kind, "CAMPAIGN_FILES"), eq(shareLinks.campaignId, campaignId), isNull(shareLinks.recipientKey)))
    .orderBy(asc(shareLinks.createdAt))
    .limit(1);
  return found ?? null;
}

export async function filesLinkFor(campaignId: string, createdByEmail: string) {
  const existing = await campaignFilesLink(campaignId);
  if (existing) return existing;

  const inserted = await db
    .insert(shareLinks)
    .values({
      token: randomBytes(16).toString("base64url"),
      kind: "CAMPAIGN_FILES",
      campaignId,
      createdByEmail,
    })
    .returning();

  return inserted[0];
}

export type FilesRecipient = {
  name: string;
  email?: string | null;
  phone?: string | null;
  clientId?: string | null;
  agentId?: string | null;
  subownerId?: string | null;
  leadId?: string | null;
};

/** Who a link is for, the same for their email and their SMS. */
export function recipientKeyOf(one: FilesRecipient): string | null {
  if (one.clientId) return `client:${one.clientId}`;
  if (one.agentId) return `agent:${one.agentId}`;
  if (one.subownerId) return `company:${one.subownerId}`;
  if (one.leadId) return `lead:${one.leadId}`;
  const address = (one.email ?? one.phone ?? "").trim().toLowerCase();
  return address ? `address:${address}` : null;
}

/** One person's own link to a campaign's files, made the first time it is needed. */
export async function personalFilesLink(campaignId: string, recipient: FilesRecipient, createdByEmail: string) {
  const key = recipientKeyOf(recipient);
  if (!key) return filesLinkFor(campaignId, createdByEmail);
  const [existing] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.kind, "CAMPAIGN_FILES"), eq(shareLinks.campaignId, campaignId), eq(shareLinks.recipientKey, key)))
    .limit(1);
  if (existing) return existing;
  const inserted = await db
    .insert(shareLinks)
    .values({
      token: randomBytes(16).toString("base64url"),
      kind: "CAMPAIGN_FILES",
      campaignId,
      createdByEmail,
      recipientKey: key,
      recipientName: recipient.name || recipient.email || recipient.phone || null,
      clientId: recipient.clientId ?? null,
      agentId: recipient.agentId ?? null,
      subownerId: recipient.subownerId ?? null,
      leadId: recipient.leadId ?? null,
    })
    .returning();
  return inserted[0];
}

/**
 * Somebody opened their link: the first time is kept, the last moves on. A
 * visit counts once: opening it again, or refreshing, within half an hour is
 * the same visit, so "3 times" means three separate visits.
 */
export async function recordFilesOpen(link: { id: string; recipientKey: string | null }) {
  if (!link.recipientKey) return;
  const now = new Date();
  const visit = new Date(now.getTime() - 30 * 60 * 1000);
  await db
    .update(shareLinks)
    .set({
      firstOpenedAt: sql`coalesce(${shareLinks.firstOpenedAt}, ${now})`,
      openCount: sql`case when ${shareLinks.lastOpenedAt} is null or ${shareLinks.lastOpenedAt} < ${visit} then ${shareLinks.openCount} + 1 else ${shareLinks.openCount} end`,
      lastOpenedAt: now,
    })
    .where(eq(shareLinks.id, link.id));
}

/** Everybody who has a link to the campaign's files, and whether they opened it. */
export async function filesOpens(campaignId: string) {
  return db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.kind, "CAMPAIGN_FILES"), eq(shareLinks.campaignId, campaignId), isNotNull(shareLinks.recipientKey)))
    .orderBy(desc(shareLinks.lastOpenedAt));
}

export async function resolveFilesToken(token: string) {
  const rows = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.token, token), eq(shareLinks.kind, "CAMPAIGN_FILES")))
    .limit(1);

  const link = rows[0];
  if (!link || link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  return link;
}

/** The documents uploaded with the campaign itself. */
export async function ownAttachments(campaignId: string) {
  const rows = await db
    .select({ document: documents })
    .from(campaignDocuments)
    .innerJoin(documents, eq(documents.id, campaignDocuments.documentId))
    .where(eq(campaignDocuments.campaignId, campaignId));
  return rows.map((r) => r.document);
}

/**
 * Everything the campaign's own page shows: the files uploaded with it, and,
 * for a campaign that shows developments, each development's brochure,
 * specification, drawings and pictures.
 */
export async function campaignAttachments(campaignId: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  const own = await ownAttachments(campaignId);
  if (!campaign) return own;
  const papers = await projectPapers(await developmentsWithFiles(campaign));
  return [...own, ...papers.attached, ...papers.gallery];
}

/**
 * Whose papers and pictures a campaign carries.
 *
 * Always the developments it shows, ticked for {{projects}}. And the ones it
 * is about, chosen under "What it is about", whenever its message has the
 * files link, {{files_url}}: a letter that points at the files is a letter
 * that promises them, so the brochure, drawings, specifications and renders
 * are on the page the link opens. A letter about a development that never
 * mentions its files, a viewing invitation say, does not point at them.
 */
async function developmentsWithFiles(campaign: typeof campaigns.$inferSelect): Promise<string[]> {
  const shown = idsOf(campaign.projectIds);
  const words = `${campaign.subject ?? ""} ${campaign.body} ${campaign.bodyWhatsapp ?? ""}`;
  if (!/\{\{\s*files[ _]url\s*\}\}/i.test(words)) return shown;
  const about = (await aboutFromChoices(aboutOf(campaign))).projects;
  return [...new Set([...shown, ...about])];
}

export function filesUrl(token: string): string {
  return `${appUrl()}/files/${token}`;
}

type FileDoc = typeof documents.$inferSelect;

/** The folders inside each development, in the order a buyer reads them. */
export const FOLDERS = [
  { kind: "BROCHURE", label: "Brochure" },
  { kind: "ARCHITECTURAL", label: "Architectural drawings" },
  { kind: "TECHNICAL_SPEC", label: "Technical specifications" },
  { kind: "PICTURES", label: "Renders" },
] as const;

export type ProjectFolder = {
  projectId: string;
  name: string;
  groups: { kind: string; label: string; files: FileDoc[] }[];
  count: number;
};

/**
 * What the files page shows: a folder for each development, in the order the
 * campaign has them, each with its brochure, drawings, specifications and
 * renders; then the files uploaded with the campaign itself.
 */
export async function campaignFolders(campaignId: string): Promise<{ folders: ProjectFolder[]; other: FileDoc[] }> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  const other = await ownAttachments(campaignId);
  if (!campaign) return { folders: [], other };
  const ids = await developmentsWithFiles(campaign);
  if (ids.length === 0) return { folders: [], other };
  const [papers, names] = await Promise.all([
    projectPapers(ids),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, ids)),
  ]);
  const all = [...papers.attached, ...papers.gallery];
  const nameOf = new Map(names.map((one) => [one.id, one.name]));
  const folders = ids
    .map((projectId) => {
      const mine = all.filter((doc) => doc.projectId === projectId);
      const groups = FOLDERS.map((folder) => ({
        kind: folder.kind as string,
        label: folder.label as string,
        files: mine.filter((doc) => doc.category === folder.kind),
      })).filter((group) => group.files.length > 0);
      return { projectId, name: nameOf.get(projectId) ?? "Development", groups, count: mine.length };
    })
    .filter((folder) => folder.count > 0);
  return { folders, other };
}
