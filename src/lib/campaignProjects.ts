import "server-only";
import { and, asc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { documents, projects } from "@/db/schema";
import { formatAmount, toCents } from "@/lib/money";
import { availableForPriceList } from "@/lib/priceList";

/*
 * A campaign that shows one or more developments.
 *
 * {{projects}} becomes, for each development chosen, its name, where it is, its
 * Google Maps link, when it is ready, a line about it, and every apartment still
 * available with its price before VAT, read at the moment the message goes. The
 * development's brochure, specification and architectural drawings travel with
 * the email as attachments; its pictures are on the campaign's own page, opened
 * from a link, because a dozen photographs make an email nobody receives.
 */

/** A JSON list of ids as a column holds it, read forgivingly. */
export function idsOf(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((one) => typeof one === "string" && one) : [];
  } catch {
    return [];
  }
}

/** The kinds of project paper that go as attachments, and the kind that goes by link. */
export const ATTACHED_KINDS = ["BROCHURE", "TECHNICAL_SPEC", "ARCHITECTURAL"] as const;
export const GALLERY_KINDS = ["PICTURES"] as const;

export async function projectsBlock(projectIds: string[]): Promise<{ text: string; names: string } | null> {
  if (projectIds.length === 0) return null;
  const [rows, available] = await Promise.all([
    db.select().from(projects).where(inArray(projects.id, projectIds)).orderBy(asc(projects.name)),
    availableForPriceList(),
  ]);
  if (rows.length === 0) return null;

  const blocks = rows.map((project) => {
    const units = available.filter((row) => row.project.id === project.id);
    const where = [project.location, project.completionBy ? `Ready ${project.completionBy}.` : null]
      .filter(Boolean)
      .join(". ");
    const lines = units.map(({ unit }) => {
      const bits = [
        unit.floor ? `floor ${unit.floor}` : null,
        unit.bedrooms ? `${unit.bedrooms} ${unit.bedrooms === 1 ? "bedroom" : "bedrooms"}` : null,
        unit.coveredArea ? `${Number(unit.coveredArea)} m2 covered` : null,
        unit.verandaArea ? `${Number(unit.verandaArea)} m2 veranda` : null,
      ].filter(Boolean);
      return `   ${unit.code}${bits.length ? `, ${bits.join(", ")}` : ""}: ${formatAmount(toCents(unit.netPrice), "en")}`;
    });
    return [
      project.name,
      where || null,
      project.mapsUrl ? `On the map: ${project.mapsUrl}` : null,
      project.description ? project.description.trim() : null,
      units.length > 0 ? "Available apartments, prices before VAT:" : "Nothing is available at the moment.",
      ...lines,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return { text: blocks.join("\n\n"), names: rows.map((one) => one.name).join(", ") };
}

/** The developments' own papers: the ones that are attached, and the pictures. */
export async function projectPapers(projectIds: string[]) {
  if (projectIds.length === 0) return { attached: [], gallery: [] };
  const rows = await db
    .select()
    .from(documents)
    .where(and(inArray(documents.projectId, projectIds), isNull(documents.unitId)))
    .orderBy(asc(documents.createdAt));
  return {
    attached: rows.filter((doc) => (ATTACHED_KINDS as readonly string[]).includes(doc.category)),
    gallery: rows.filter((doc) => (GALLERY_KINDS as readonly string[]).includes(doc.category)),
  };
}

/** Every development, for the picker. */
export async function projectChoices() {
  return db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name));
}

export const isPicture = (doc: { mimeType: string | null }) => (doc.mimeType ?? "").startsWith("image/");

