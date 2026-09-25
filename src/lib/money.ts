// All money maths happens in integer cents. Never in floats.

export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Math.round(value * 100);
  const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * An amount as a person types it, in cents.
 *
 * The office types in two styles: 12,500.50 the English way and 12.500,50 the
 * Greek way, and sometimes 1234,56 with a comma for the cents. Reading them all
 * with one rule turned 12.500 into twelve and a half euros and 1234,56 into
 * 123,456, which is how an installment typed by hand came out a different
 * number from the one on the screen. So: when both marks are there, the last
 * one is the decimal point; a comma alone is thousands only when every group
 * after it has three digits; a dot alone followed by exactly three digits is
 * thousands, since no amount of money has three decimals.
 */
export function parseAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : 0;
  let text = value.replace(/[^0-9.,-]/g, "");
  if (!text) return 0;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    text = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    text = /^-?\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.split(",").length === 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const dots = text.split(".").length - 1;
    if (dots > 1) text = text.replace(/\./g, "");
    else if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(text)) text = text.replace(".", "");
  }
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** The same amount written the one way the rest of the CRM reads, "12500.50". */
export function normalizeAmount(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || String(value).trim() === "") return undefined;
  return fromCents(parseAmount(value));
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
  return (
    new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(rate) + "%"
  );
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

/**
 * A price with its VAT on top.
 *
 * Cyprus charges five per cent on a buyer's first home and nineteen on
 * everything else, so the same apartment is quoted at two different totals
 * depending on who is buying. Working it out in one place means the project
 * page, the apartment page and the price list can never disagree about it.
 */
export function withVat(
  netCents: number,
  rate: string | number | null | undefined,
): { netCents: number; rate: number; vatCents: number; totalCents: number } {
  const percent = Number(rate ?? 0);
  const vatCents = Math.round((netCents * percent) / 100);
  return { netCents, rate: percent, vatCents, totalCents: netCents + vatCents };
}
