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

/** What a price list link shows: everything, one development, or one apartment. */
export type PriceListScope = { projectId?: string | null; unitId?: string | null; projectIds?: string | null };

/**
 * The apartments a link shows, read at the moment the page is opened.
 *
 * An apartment link shows that apartment. Once it is reserved or sold it is no
 * longer offered, and the page says so and shows what is still available in the
 * same development instead, so a link sent in a campaign never goes blank.
 */
export async function priceListRows(scope: PriceListScope) {
  const all = await availableForPriceList();
  if (scope.unitId) {
    const [chosen] = await db
      .select({ unit: units, project: projects })
      .from(units)
      .innerJoin(projects, eq(projects.id, units.projectId))
      .where(eq(units.id, scope.unitId))
      .limit(1);
    if (chosen) {
      const stillThere = all.filter((row) => row.unit.id === chosen.unit.id);
      if (stillThere.length > 0) return { rows: stillThere, focus: chosen, gone: false };
      return { rows: all.filter((row) => row.project.id === chosen.project.id), focus: chosen, gone: true };
    }
  }
  const several = (() => {
    try {
      const list = JSON.parse(scope.projectIds ?? "[]");
      return Array.isArray(list) ? (list as string[]) : [];
    } catch {
      return [];
    }
  })();
  if (several.length > 0) {
    return { rows: all.filter((row) => several.includes(row.project.id)), focus: null, gone: false };
  }
  if (scope.projectId) {
    const [project] = await db.select().from(projects).where(eq(projects.id, scope.projectId)).limit(1);
    if (project) return { rows: all.filter((row) => row.project.id === project.id), focus: null, gone: false };
  }
  return { rows: all, focus: null, gone: false };
}

/** What a link shows, in words, for the list of links. */
export async function scopeWords(scope: PriceListScope): Promise<string> {
  if (scope.projectIds) {
    let ids: string[] = [];
    try {
      ids = JSON.parse(scope.projectIds);
    } catch {
      ids = [];
    }
    if (ids.length > 0) {
      const rows = await db.select({ id: projects.id, name: projects.name }).from(projects);
      return rows.filter((one) => ids.includes(one.id)).map((one) => one.name).join(", ");
    }
  }
  if (scope.unitId) {
    const [row] = await db
      .select({ code: units.code, project: projects.name })
      .from(units)
      .innerJoin(projects, eq(projects.id, units.projectId))
      .where(eq(units.id, scope.unitId))
      .limit(1);
    if (row) return `${row.project} ${row.code}`;
  }
  if (scope.projectId) {
    const [row] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, scope.projectId)).limit(1);
    if (row) return row.name;
  }
  return "";
}

export async function createPriceListLink(options: {
  note?: string | null;
  days?: number | null;
  createdByEmail: string;
  projectId?: string | null;
  unitId?: string | null;
  projectIds?: string | null;
  /** Set when the CRM makes the link for a campaign, so the link can follow it. */
  campaignId?: string | null;
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
      projectId: options.unitId ? null : (options.projectId ?? null),
      unitId: options.unitId ?? null,
      projectIds: options.projectIds ?? null,
      campaignId: options.campaignId ?? null,
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
