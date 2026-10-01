/*
 * The standard name of a contract.
 *
 * The buyer's initials, the initials of the building and the apartment's
 * number: Michalis Athanasiades buying 401 in MAGNUM OPUS QUATTRO is
 * MA-MOQ-401. The form fills it in as the buyer and the apartment are chosen,
 * and it can still be typed over. Used on the server and in the browser alike.
 */

const first = (word: string | null | undefined) => (word ?? "").trim().charAt(0).toUpperCase();

/** "MAGNUM OPUS QUATTRO" to MOQ. */
export function buildingInitials(name: string | null | undefined): string {
  return (name ?? "")
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .map((word) => first(word))
    .join("");
}

export function standardContractName(parts: {
  firstName?: string | null;
  lastName?: string | null;
  building?: string | null;
  unit?: string | null;
}): string {
  const person = `${first(parts.firstName)}${first(parts.lastName)}`;
  const building = buildingInitials(parts.building);
  const unit = (parts.unit ?? "").replace(/\s+/g, "").toUpperCase();
  return [person, building, unit].filter(Boolean).join("-");
}
