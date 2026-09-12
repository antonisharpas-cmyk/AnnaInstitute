import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, documents, shareLinks } from "@/db/schema";
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

/** The documents attached to a campaign. */
export async function campaignAttachments(campaignId: string) {
  const rows = await db
    .select({ document: documents })
    .from(campaignDocuments)
    .innerJoin(documents, eq(documents.id, campaignDocuments.documentId))
    .where(eq(campaignDocuments.campaignId, campaignId));
  return rows.map((r) => r.document);
}

export function filesUrl(token: string): string {
  return `${appUrl()}/files/${token}`;
}
