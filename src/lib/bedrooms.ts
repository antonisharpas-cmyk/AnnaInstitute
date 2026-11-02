/**
 * An apartment's bedrooms, as the office writes them: 1, 2, 3, or 2+1 for two
 * bedrooms and a further room, a study say, that can become a third. Kept as
 * it is typed and shown the same way everywhere: the apartment, the price
 * list, the campaigns and the reports. Kept as text, a 2+1 still sorts beside
 * the twos.
 *
 * This file has no server code in it, so the forms in the browser can use it.
 */

/** What the box accepts, for the browser's own check: "2", "2+1", "1 + 1". */
export const BEDROOMS_PATTERN = "\\s*\\d{1,2}(\\s*\\+\\s*\\d{1,2})?\\s*";

/** As it is kept: "2+1" without spaces. Empty is null; anything else is undefined, not a bedroom count. */
export function cleanBedrooms(value: unknown): string | null | undefined {
  const typed = String(value ?? "").replace(/\s+/g, "");
  if (!typed) return null;
  return /^\d{1,2}(\+\d{1,2})?$/.test(typed) ? typed.replace(/^0+(?=\d)/, "") : undefined;
}

/** "2 bedrooms", "1 bedroom", "2+1 bedrooms". */
export function bedroomsWords(value: string | number | null | undefined): string | null {
  const shown = value === null || value === undefined ? "" : String(value).trim();
  if (!shown) return null;
  return `${shown} ${shown === "1" ? "bedroom" : "bedrooms"}`;
}
