import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, partners, projects, units } from "@/db/schema";
import { aboutOf } from "@/lib/campaignAbout";
import { baseOf, listEntries } from "@/lib/choices";
import { titleWord } from "@/lib/titles";

/**
 * The buyers a campaign writes to, each with their own apartment.
 *
 * A buyer is a client holding a reserved, sold or delivered apartment. Which
 * apartments count is what the campaign is about: a development means its
 * buyers, an apartment means the buyer of that apartment, nothing means every
 * buyer. Each one's letter names their own apartment and development, so a
 * letter to every buyer of Magnum Opus Uno says "Apartment 101" to the buyer of
 * 101 and "Apartment 204" to the buyer of 204.
 */

const HELD = ["RESERVED", "SOLD", "DELIVERED"] as const;

export type Buyer = {
  clientId: string;
  name: string;
  firstName: string;
  /** "Mrs.", "Mr.", "Ms." or nothing. */
  title: string;
  email: string | null;
  phone: string | null;
  /** Their apartments in what the campaign is about. */
  units: { unitId: string; code: string; projectId: string; projectName: string }[];
  /** {{unit}} and {{project}} for this buyer. */
  own: Record<string, string>;
};

/** "A", "A and B", "A, B and C". */
const together = (items: string[]) => {
  const list = [...new Set(items.filter(Boolean))];
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

/** Every buyer of what a campaign is about, in surname order. */
export async function buyersOf(campaign: { aboutIds?: string | null; projectId: string | null; unitId: string | null }): Promise<Buyer[]> {
  const about = aboutOf(campaign);
  const projectIds = about.filter((one) => one.startsWith("project:")).map((one) => one.slice(8));
  const unitIds = about.filter((one) => one.startsWith("unit:")).map((one) => one.slice(5));

  const rows = await db
    .select({ unit: units, project: projects, client: clients })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .innerJoin(clients, eq(clients.id, units.clientId))
    .where(and(isNotNull(units.clientId), inArray(units.status, [...HELD]), isNull(clients.deletedAt)))
    .orderBy(asc(clients.lastName), asc(clients.firstName), asc(projects.name), asc(units.code));

  const inScope = (row: (typeof rows)[number]) =>
    about.length === 0 || unitIds.includes(row.unit.id) || projectIds.includes(row.project.id);

  const byClient = new Map<string, Buyer>();
  for (const row of rows) {
    if (!inScope(row)) continue;
    let buyer = byClient.get(row.client.id);
    if (!buyer) {
      buyer = {
        clientId: row.client.id,
        name: `${row.client.firstName} ${row.client.lastName}`.trim(),
        firstName: row.client.firstName,
        title: titleWord(row.client.title),
        email: row.client.email,
        phone: row.client.phone,
        units: [],
        own: {},
      };
      byClient.set(row.client.id, buyer);
    }
    buyer.units.push({ unitId: row.unit.id, code: row.unit.code, projectId: row.project.id, projectName: row.project.name });
  }

  for (const buyer of byClient.values()) {
    const oneBuilding = new Set(buyer.units.map((one) => one.projectId)).size <= 1;
    buyer.own = {
      unit: together(buyer.units.map((one) => (oneBuilding ? one.code : `${one.code} at ${one.projectName}`))),
      project: together(buyer.units.map((one) => one.projectName)),
    };
  }
  return [...byClient.values()];
}

/** The buyers ticked on a campaign, or every buyer when none were. */
export function chosenBuyers(all: Buyer[], buyerIds: string | null | undefined): Buyer[] {
  let chosen: string[] = [];
  try {
    const list = JSON.parse(buyerIds ?? "[]");
    if (Array.isArray(list)) chosen = list.map(String);
  } catch {
    chosen = [];
  }
  return chosen.length === 0 ? all : all.filter((one) => chosen.includes(one.clientId));
}

/**
 * Every buyer, with every apartment they hold, for the form: the buyers shown
 * follow what the campaign is about as it is chosen.
 */
export async function buyerChoices(): Promise<{ id: string; label: string; hint: string; about: string[] }[]> {
  const all = await buyersOf({ aboutIds: null, projectId: null, unitId: null });
  return all.map((one) => ({
    id: one.clientId,
    label: one.name,
    hint: one.units.map((u) => `${u.projectName} ${u.code}`).join(", "),
    about: [...new Set(one.units.flatMap((u) => [`project:${u.projectId}`, `unit:${u.unitId}`]))],
  }));
}

/**
 * The partners a buyer chooses their materials with, for {{material_partners}}:
 * the Kitchens and the Bathrooms partners of the Partners directory, numbered,
 * each under its category as the Builder names it.
 *
 *   1. Kitchens: Ocriam Kitchens
 *      - Telephone: 24635554
 *      - Location: https://maps.app.goo.gl/...
 */
export async function materialPartners(): Promise<string> {
  const wanted = ["KITCHENS", "BATHROOMS"];
  let rows: (typeof partners.$inferSelect)[] = [];
  try {
    rows = await db.select().from(partners).orderBy(asc(partners.name));
  } catch {
    return "";
  }
  const entries = await listEntries("partnerCategory");
  const order = new Map(entries.map((one, index) => [one.code, index]));
  const word = new Map(entries.map((one) => [one.code, one.labelEn?.trim() || one.defaultEn]));
  const picked = rows
    .filter((one) => wanted.includes(baseOf(one.category)))
    .sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.name.localeCompare(b.name));
  return picked
    .map((one, index) =>
      [
        `${index + 1}. ${word.get(one.category) ?? one.category}: ${one.name}`,
        one.mobile ? `   - Telephone: ${one.mobile}` : null,
        one.locationUrl ? `   - Location: ${one.locationUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}
