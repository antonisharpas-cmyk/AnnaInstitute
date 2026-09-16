/**
 * The four kinds of paper a development carries.
 *
 * The office was plain about this: a development has its pictures, its
 * architectural drawings, its brochure and its technical specification, and
 * nothing else. So the project page offers exactly these four and groups the
 * files under them in this order, which is also the order somebody looks in:
 * you show a buyer the pictures first and the specification last.
 *
 * Anything filed against an apartment rather than the development, a floor plan
 * for instance, keeps its own category and is gathered at the end under the
 * apartment it belongs to, because it is that apartment's paper and not the
 * building's.
 */
import type { DocumentCategory } from "@/lib/uploads";

export const PROJECT_FILE_CATEGORIES: DocumentCategory[] = [
  "PICTURES",
  "ARCHITECTURAL",
  "BROCHURE",
  "TECHNICAL_SPEC",
];

/** What a title for each kind usually looks like, so the form can suggest one. */
export const PROJECT_FILE_EXAMPLES: Record<string, string> = {
  PICTURES: "Exterior and interior",
  ARCHITECTURAL: "Architectural drawings",
  BROCHURE: "Brochure",
  TECHNICAL_SPEC: "Technical specifications",
};

export function isProjectFileCategory(value: string): value is DocumentCategory {
  return (PROJECT_FILE_CATEGORIES as readonly string[]).includes(value);
}
