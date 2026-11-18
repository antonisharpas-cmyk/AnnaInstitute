/**
 * An apartment's total area: the covered area, the verandas and the roof
 * garden added together, as every price list shows it. Nothing when none of
 * the three is known. This file has no server code in it.
 */
export function totalArea(unit: {
  coveredArea: string | number | null;
  verandaArea: string | number | null;
  roofGardenArea: string | number | null;
}): number | null {
  const parts = [unit.coveredArea, unit.verandaArea, unit.roofGardenArea]
    .map((one) => (one === null || one === undefined || one === "" ? null : Number(one)))
    .filter((one): one is number => one !== null && Number.isFinite(one));
  if (parts.length === 0) return null;
  return Math.round(parts.reduce((sum, one) => sum + one, 0) * 100) / 100;
}

/** "84 m2", "84.5 m2", or nothing. */
export const squareMetres = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === "" || !Number(value) ? "" : `${Number(value)} m2`;
