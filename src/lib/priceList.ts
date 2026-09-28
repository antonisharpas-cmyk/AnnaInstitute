import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull, or, gt } from "drizzle-orm";
import { db } from "@/db";
import { projects, shareLinks, units } from "@/db/schema";
import { appUrl } from "./unsubscribe";
import { recordAudit } from "./audit";

/**
 * The monthly price list for agents.
 *
 * It is a link to a live page rather than a file, so the prices an agent quotes
 * are the prices in the system on the day they look, not the prices on the day
 * the file was made. A link can be given an expiry date and can be revoked.
 *
 * Only what can be bought today is on it: a reserved apartment is off the list
 * the moment its reservation is recorded.
 */
export async function availableForPriceList() {
  return db
    .select({ unit: units, project: projects })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(units.status, "AVAILABLE"))
    .orderBy(asc(projects.name), asc(units.code));
}

export async function createPriceListLink(options: {
  note?: string | null;
  days?: number | null;
  createdByEmail: string;
}) {
  const token = randomBytes(16).toString("base64url");
  const expiresAt = options.days ? new Date(Date.now() + options.days * 24 * 60 * 60 * 1000) : null;

  const inserted = await db
    .insert(shareLinks)
    .values({
      token,
      kind: "PRICE_LIST",
      note: options.note ?? null,
      expiresAt,
      createdByEmail: options.createdByEmail,
    })
    .returning({ id: shareLinks.id, token: shareLinks.token });

  await recordAudit({
    action: "priceList.link.create",
    entity: "shareLink",
    entityId: inserted[0].id,
    detail: options.note ?? "",
    userEmail: options.createdByEmail,
  });

  return inserted[0];
}

export async function activePriceListLinks() {
  return db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.kind, "PRICE_LIST"),
        isNull(shareLinks.revokedAt),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, new Date())),
      ),
    )
    .orderBy(asc(shareLinks.createdAt));
}

export async function resolvePriceListToken(token: string) {
  const rows = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.token, token), eq(shareLinks.kind, "PRICE_LIST")))
    .limit(1);

  const link = rows[0];
  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  return link;
}

export function priceListUrl(token: string): string {
  return `${appUrl()}/price-list/${token}`;
}
