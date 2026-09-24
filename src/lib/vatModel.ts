/**
 * VAT on a sale, before and after the reduced rate is approved.
 *
 * Every sale starts at the standard rate on the whole price. When the buyer's
 * reduced rate is approved, a part of the price before VAT qualifies for it and
 * the rest stays at the standard rate: typically the first 130 m² or the first
 * €350,000. Each stage then carries the two rates in the same proportion as the
 * whole contract, so a stage that is 10% of the price has 10% of each part.
 *
 * The stages themselves never change: their amounts before VAT stay exactly as
 * the Contract of Sale has them. Only the VAT on them moves.
 */

export type VatModel = {
  /** The whole price before VAT, in cents. */
  totalNetCents: number;
  /** The single rate, when there is no approval yet. */
  rate: number;
  /** After approval: the part at the reduced rate, and the two rates. */
  reducedNetCents?: number | null;
  reducedRate?: number | null;
  standardRate?: number | null;
};

export type VatPart = { rate: number; netCents: number; vatCents: number };

const vatAt = (netCents: number, rate: number) => Math.round((netCents * rate) / 100);

export function isSplit(model: VatModel): boolean {
  return (
    model.reducedNetCents !== null &&
    model.reducedNetCents !== undefined &&
    model.reducedRate !== null &&
    model.reducedRate !== undefined &&
    model.totalNetCents > 0
  );
}

/** The VAT on an amount before VAT, in its one or two parts. */
export function vatForNet(netCents: number, model: VatModel): { vatCents: number; parts: VatPart[] } {
  if (!isSplit(model)) {
    const vat = vatAt(netCents, model.rate);
    return { vatCents: vat, parts: [{ rate: model.rate, netCents, vatCents: vat }] };
  }
  const reducedShare = Math.min(1, Math.max(0, (model.reducedNetCents as number) / model.totalNetCents));
  const reducedNet = Math.round(netCents * reducedShare);
  const standardNet = netCents - reducedNet;
  const reducedRate = model.reducedRate as number;
  const standardRate = model.standardRate ?? model.rate;
  const parts: VatPart[] = [];
  if (reducedNet !== 0) parts.push({ rate: reducedRate, netCents: reducedNet, vatCents: vatAt(reducedNet, reducedRate) });
  if (standardNet !== 0) parts.push({ rate: standardRate, netCents: standardNet, vatCents: vatAt(standardNet, standardRate) });
  return { vatCents: parts.reduce((sum, part) => sum + part.vatCents, 0), parts };
}

/**
 * Split an amount that includes VAT back into its parts, in the proportions of
 * a stage whose own figures are known. Used when a payment covers part of a
 * stage, so the invoice for it carries the same rates as the stage.
 */
export function splitGross(
  grossCents: number,
  line: { netCents: number; vatCents: number },
  model: VatModel,
): { netCents: number; vatCents: number; parts: VatPart[] } {
  const lineGross = line.netCents + line.vatCents;
  if (lineGross <= 0) {
    const rate = model.rate;
    const net = Math.round(grossCents / (1 + rate / 100));
    return { netCents: net, vatCents: grossCents - net, parts: [{ rate, netCents: net, vatCents: grossCents - net }] };
  }
  const netCents = Math.round((grossCents * line.netCents) / lineGross);
  const vatCents = grossCents - netCents;
  const { parts } = vatForNet(netCents, model);
  /* The parts are rounded on their own; the last one takes the cent so the
     parts always add up to the invoice's VAT exactly. */
  const sum = parts.reduce((all, part) => all + part.vatCents, 0);
  if (parts.length > 0) parts[parts.length - 1].vatCents += vatCents - sum;
  return { netCents, vatCents, parts };
}

/** One figure for the whole contract, for anything that needs a single rate. */
export function blendedRate(model: VatModel): number {
  if (!isSplit(model) || model.totalNetCents <= 0) return model.rate;
  const { vatCents } = vatForNet(model.totalNetCents, model);
  return Math.round((vatCents / model.totalNetCents) * 100 * 1000) / 1000;
}

/** How a contract row reads as a model. */
export function modelOf(contract: {
  netPrice: string;
  vatRate: string;
  reducedVatNet?: string | null;
  reducedVatRate?: string | null;
  standardVatRate?: string | null;
}): VatModel {
  const cents = (value: string) => Math.round(Number(value) * 100);
  return {
    totalNetCents: cents(contract.netPrice),
    rate: Number(contract.vatRate),
    reducedNetCents: contract.reducedVatNet ? cents(contract.reducedVatNet) : null,
    reducedRate: contract.reducedVatRate ? Number(contract.reducedVatRate) : null,
    standardRate: contract.standardVatRate ? Number(contract.standardVatRate) : null,
  };
}

/** "5%" or "5% and 19%", the way an invoice names the rates. */
export function ratesInWords(parts: VatPart[]): string {
  const pc = (rate: number) => `${Number.isInteger(rate) ? rate : rate.toFixed(2)}%`;
  return parts.map((part) => pc(part.rate)).join(" and ");
}
