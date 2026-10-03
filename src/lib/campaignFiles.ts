import "server-only";
import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { resolveStored } from "./storage";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, campaigns, documents, shareLinks } from "@/db/schema";
import { idsOf, projectPapers } from "./campaignProjects";
import { appUrl } from "./unsubscribe";

/**
 * A WhatsApp message cannot carry a PDF the way an email can, so the files of a
 * campaign get a link of their own: one page, no login, listing whatever was
 * attached. The email still carries the real attachments.
 */
export async function filesLinkFor(campaignId: string, createdByEmail: string) {
  const existing = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.kind, "CAMPAIGN_FILES"), eq(shareLinks.campaignId, campaignId)))
    .limit(1);
  if (existing[0]) return existing[0];

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
  const papers = await projectPapers(idsOf(campaign.projectIds));
  return [...own, ...papers.attached, ...papers.gallery];
}

/** What an email of this campaign carries: its own files and the developments' papers, never the pictures. */
export async function emailAttachments(campaignId: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  const own = await ownAttachments(campaignId);
  if (!campaign) return own;
  const papers = await projectPapers(idsOf(campaign.projectIds));
  return [...own, ...papers.attached];
}

export function filesUrl(token: string): string {
  return `${appUrl()}/files/${token}`;
}

/**
 * How much an email of a campaign can carry.
 *
 * Mail servers refuse a letter much over 25 MB, and files grow by a third on
 * the way, so the files an email carries are kept to 15 MB. A brochure,
 * a specification and the drawings of four developments easily come to a
 * hundred, and a campaign that tried to attach them all to every recipient
 * spent minutes uploading each letter only to have it refused. What fits is
 * attached, in order, and the rest reach the recipient by the campaign's files
 * link, which the email then carries.
 */
export const EMAIL_FILES_LIMIT = 15 * 1024 * 1024;

export type EmailFiles = {
  attached: { filename: string; path: string; contentType?: string }[];
  /** The files left out because they would not fit, by name. */
  linked: string[];
  /** All of them together, in bytes. */
  totalBytes: number;
};

export async function emailFilesWithin(campaignId: string, limit = EMAIL_FILES_LIMIT): Promise<EmailFiles> {
  const docs = await emailAttachments(campaignId);
  const attached: EmailFiles["attached"] = [];
  const linked: string[] = [];
  let used = 0;
  let totalBytes = 0;
  for (const doc of docs) {
    const where = resolveStored(doc.filePath);
    let size = doc.sizeBytes ?? 0;
    if (!size) {
      try {
        size = (await stat(where)).size;
      } catch {
        continue; /* Not on the disk: nothing to attach. */
      }
    }
    totalBytes += size;
    const name = doc.originalName ?? path.basename(doc.filePath);
    if (used + size <= limit) {
      used += size;
      attached.push({ filename: name, path: where, contentType: doc.mimeType ?? undefined });
    } else {
      linked.push(name);
    }
  }
  return { attached, linked, totalBytes };
}
