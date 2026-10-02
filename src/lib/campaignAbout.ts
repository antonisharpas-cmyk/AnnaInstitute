import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { units } from "@/db/schema";
import { detailsForProject, detailsForUnit } from "@/lib/templates";
import { formatAmount, toCents } from "@/lib/money";

/**
 * What a campaign is about: one development, one apartment, or several of
 * either, mixed.
 *
 * With one, the placeholders read exactly as they always did. With several,
 * each placeholder reads naturally for all of them: {{project}} names every
 * development once, {{unit}} lists the apartments, {{price}} is the lowest
 * price, since the letters say "from {{price}}", and {{details}} gives one
 * line for each choice so nothing is lost.
 */

type AboutCampaign = { aboutIds?: string | null; projectId: string | null; unitId: string | null };

/** The choices, as "project:<id>" and "unit:<id>", from the list or the older two columns. */
export function aboutOf(campaign: AboutCampaign): string[] {
  try {
    const list = JSON.parse(campaign.aboutIds ?? "[]");
    if (Array.isArray(list) && list.length > 0) return list.map(String).filter((one) => /^(project|unit):/.test(one));
  } catch {
    /* Fall back to the two columns. */
  }
  if (campaign.unitId) return [`unit:${campaign.unitId}`];
  if (campaign.projectId) return [`project:${campaign.projectId}`];
  return [];
}

/** What the form sent, cleaned, with the first development and apartment for the two older columns. */
export async function aboutFromChoices(raw: string[]) {
  const list = [...new Set(raw.map((one) => one.trim()).filter((one) => /^(project|unit):.+/.test(one)))];
  const unitIds = list.filter((one) => one.startsWith("unit:")).map((one) => one.slice(5));
  const projectIds = list.filter((one) => one.startsWith("project:")).map((one) => one.slice(8));
  const found = unitIds.length ? await db.select({ id: units.id, projectId: units.projectId }).from(units).where(inArray(units.id, unitIds)) : [];
  const unitId = unitIds.find((id) => found.some((one) => one.id === id)) ?? null;
  const projectId = projectIds[0] ?? found.find((one) => one.id === unitId)?.projectId ?? null;
  return {
    projectId,
    unitId,
    aboutIds: list.length > 1 ? JSON.stringify(list) : null,
    /** Every development the choices touch, for a price list that shows them all. */
    projects: [...new Set([...projectIds, ...found.map((one) => one.projectId)])],
  };
}

/** "A", "A and B", "A, B and C". */
const together = (items: string[]) => {
  const list = [...new Set(items.filter(Boolean))];
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
};

/** The placeholder values for everything the campaign is about. */
export async function aboutValues(campaign: AboutCampaign, locale = "en"): Promise<Record<string, string>> {
  const chosen = aboutOf(campaign);
  if (chosen.length === 0) return {};

  const unitRows: NonNullable<Awaited<ReturnType<typeof detailsForUnit>>>[] = [];
  const projectRows: NonNullable<Awaited<ReturnType<typeof detailsForProject>>>[] = [];
  const unitPrices: number[] = [];
  for (const one of chosen) {
    if (one.startsWith("unit:")) {
      const found = await detailsForUnit(one.slice(5), locale);
      if (found) {
        unitRows.push(found);
        const [row] = await db.select({ netPrice: units.netPrice }).from(units).where(inArray(units.id, [one.slice(5)]));
        if (row) unitPrices.push(toCents(row.netPrice));
      }
    } else {
      const found = await detailsForProject(one.slice(8), locale);
      if (found) projectRows.push(found);
    }
  }

  /* One choice: exactly as it always read. */
  if (unitRows.length + projectRows.length === 1) {
    if (unitRows[0]) return { ...unitRows[0] };
    const { unit: _unit, price: _price, ...rest } = projectRows[0];
    void _unit;
    void _price;
    return rest;
  }

  const everything = [...unitRows, ...projectRows];
  const projectNames = everything.map((one) => one.project);
  /* Apartments in one development are named by their codes; across developments, with the development. */
  const oneBuilding = new Set(unitRows.map((one) => one.project)).size <= 1;
  const unitNames = unitRows.map((one) => (oneBuilding ? one.unit : `${one.unit} at ${one.project}`));
  const lines = [
    ...unitRows.map((one) => `${one.unit} at ${one.project}${one.details ? `: ${one.details}` : ""}${one.price ? `, ${one.price}` : ""}`),
    ...projectRows.map((one) => `${one.project}${one.location ? `, ${one.location}` : ""}${one.details ? `: ${one.details}` : ""}`),
  ];
  const maps = [...new Map(everything.filter((one) => "maps_url" in one && one.maps_url).map((one) => [one.project, (one as { maps_url?: string }).maps_url ?? ""]))];

  const values: Record<string, string> = {
    project: together(projectNames),
    location: together(everything.map((one) => one.location)),
    details: lines.join("\n"),
    completion: [...new Set(everything.map((one) => one.completion).filter(Boolean))].join(" "),
    month: everything[0]?.month ?? "",
  };
  if (unitRows.length > 0) {
    values.unit = together(unitNames);
    values.price = unitPrices.length ? formatAmount(Math.min(...unitPrices), locale) : "";
  }
  if (maps.length === 1) values.maps_url = maps[0][1];
  else if (maps.length > 1) values.maps_url = maps.map(([name, url]) => `${name}: ${url}`).join("\n");
  return values;
}
