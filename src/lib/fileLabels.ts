/**
 * How a file is named on screen.
 *
 * The title is what somebody typed, the extension is added so it is obvious what
 * kind of file it is, and the tail says what it belongs to:
 *
 *   Floor Plan 101.png - Apartment 101
 *   Site works May.png - For the whole Project
 */
export const CATEGORY_LABELS: Record<string, string> = {
  FLOOR_PLAN: "Floor Plan",
  PROGRESS_PHOTO: "Progress Photo",
  IDENTIFICATION: "Identification",
  CONTRACT: "Contract",
  RECEIPT: "Receipt",
  CHANGE_REQUEST: "Change Request",
  PRICE_LIST: "Price List",
  OTHER: "Other",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

export function extensionOf(source: { originalName?: string | null; filePath: string }): string {
  const from = source.originalName || source.filePath;
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(from);
  return match ? `.${match[1].toLowerCase()}` : "";
}

/** The title with its file type on the end, without doubling it up. */
export function titleWithExtension(doc: {
  title: string;
  originalName?: string | null;
  filePath: string;
}): string {
  const extension = extensionOf(doc);
  if (!extension) return doc.title;
  return doc.title.toLowerCase().endsWith(extension) ? doc.title : `${doc.title}${extension}`;
}

export function fileLabel(
  doc: { title: string; originalName?: string | null; filePath: string },
  unitCode?: string | null,
): string {
  const name = titleWithExtension(doc);
  return unitCode ? `${name} - Apartment ${unitCode}` : `${name} - For the whole Project`;
}

export function isImage(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && mimeType.startsWith("image/"));
}

/** "AGENT_REFERRAL" reads as "Agent Referral" rather than shouting or whispering. */
export function humanLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * A client's own file. The apartment is named when the file concerns one, since a
 * buyer of two apartments has two sets of paperwork.
 */
export function clientFileLabel(
  doc: { title: string; originalName?: string | null; filePath: string },
  unitCode?: string | null,
): string {
  const name = titleWithExtension(doc);
  return unitCode ? `${name} - Apartment ${unitCode}` : name;
}
