// All money maths happens in integer cents. Never in floats.

export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Math.round(value * 100);
  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMoney(cents: number, locale: string = "en"): string {
  const value = Math.round(cents) / 100;
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Prices of apartments are whole euros in practice, and a column of ,00 is just
 * noise. This shows the cents only when there actually are cents, so nothing is
 * ever hidden.
 */
export function formatAmount(cents: number, locale: string = "en"): string {
  const hasCents = Math.abs(Math.round(cents)) % 100 !== 0;
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(Math.round(cents) / 100);
}

/** The same, without the currency symbol, for filling a form field. */
export function amountForInput(value: string | number): string {
  const cents = toCents(value);
  return Math.abs(cents) % 100 === 0 ? String(Math.round(cents / 100)) : fromCents(cents);
}

export function formatPercent(rate: number, locale: string = "en"): string {
  return new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(rate) + "%";
}

/**
 * Split a total number of cents across weights so that the parts add up to the
 * total exactly. Uses the largest remainder method, so no cent is ever lost.
 */
export function distributeCents(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) {
    const even = Math.floor(total / weights.length);
    const parts = weights.map(() => even);
    let left = total - even * weights.length;
    for (let i = 0; left > 0; i = (i + 1) % weights.length, left--) parts[i] += 1;
    return parts;
  }
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    floors[order[k].i] += 1;
  }
  return floors;
}
