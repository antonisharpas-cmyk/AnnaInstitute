import { distributeCents } from "./money";

/**
 * The VAT setup of a contract. Cyprus frequently charges two rates on the same
 * property: the reduced rate on part of it and the standard rate on the rest.
 * Both bases and both rates are stored per contract and are always editable.
 * Nothing here is hard coded, because the law changes.
 */
export type VatSetup = {
  netCents: number;
  reducedBaseCents: number;
  reducedRate: number;
  standardBaseCents: number;
  standardRate: number;
};

export type InstallmentPlanItem = {
  seq: number;
  label: string;
  percentage: number;
  /** An installment with a receipt against it is locked and never recalculated. */
  locked: boolean;
  lockedNetCents?: number;
  lockedVatCents?: number;
  lockedRate?: number;
};

export type ScheduleLine = {
  seq: number;
  label: string;
  percentage: number;
  netCents: number;
  vatCents: number;
  totalCents: number;
  rateApplied: number;
  locked: boolean;
};

export function vatOnBases(setup: VatSetup): number {
  const reduced = Math.round((setup.reducedBaseCents * setup.reducedRate) / 100);
  const standard = Math.round((setup.standardBaseCents * setup.standardRate) / 100);
  return reduced + standard;
}

/** The blended rate that the two bases produce, as a percentage. */
export function effectiveVatRate(setup: VatSetup): number {
  if (setup.netCents <= 0) return 0;
  return (vatOnBases(setup) / setup.netCents) * 100;
}

export function basesAreConsistent(setup: VatSetup): boolean {
  return setup.reducedBaseCents + setup.standardBaseCents === setup.netCents;
}

/** Put the whole net price on one rate. Used when a contract has a single rate. */
export function singleRateSetup(netCents: number, rate: number, reduced = true): VatSetup {
  return reduced
    ? { netCents, reducedBaseCents: netCents, reducedRate: rate, standardBaseCents: 0, standardRate: 19 }
    : { netCents, reducedBaseCents: 0, reducedRate: 5, standardBaseCents: netCents, standardRate: rate };
}

/**
 * Build the payment schedule.
 *
 * Rules, in the client's words:
 *  1. Changing the VAT applies the new rate to the installments that are still open.
 *  2. Anything already paid keeps the figures it was actually invoiced at, for ever.
 *
 * So locked lines are copied through untouched. The remaining net price is spread
 * across the open lines by their percentages, to the cent, and each open line is
 * charged VAT at the blended rate of the current setup.
 */
export function buildSchedule(setup: VatSetup, plan: InstallmentPlanItem[]): ScheduleLine[] {
  const rate = effectiveVatRate(setup);
  const locked = plan.filter((p) => p.locked);
  const open = plan.filter((p) => !p.locked);

  const lockedNet = locked.reduce((a, p) => a + (p.lockedNetCents ?? 0), 0);
  const remainingNet = setup.netCents - lockedNet;

  const openNet = distributeCents(
    Math.max(remainingNet, 0),
    open.map((p) => p.percentage),
  );

  const byLine = new Map<number, ScheduleLine>();

  locked.forEach((p) => {
    const netCents = p.lockedNetCents ?? 0;
    const vatCents = p.lockedVatCents ?? 0;
    byLine.set(p.seq, {
      seq: p.seq,
      label: p.label,
      percentage: p.percentage,
      netCents,
      vatCents,
      totalCents: netCents + vatCents,
      rateApplied: p.lockedRate ?? (netCents > 0 ? (vatCents / netCents) * 100 : 0),
      locked: true,
    });
  });

  open.forEach((p, i) => {
    const netCents = openNet[i] ?? 0;
    const vatCents = Math.round((netCents * rate) / 100);
    byLine.set(p.seq, {
      seq: p.seq,
      label: p.label,
      percentage: p.percentage,
      netCents,
      vatCents,
      totalCents: netCents + vatCents,
      rateApplied: rate,
      locked: false,
    });
  });

  return plan.map((p) => byLine.get(p.seq)!).sort((a, b) => a.seq - b.seq);
}

export function scheduleTotals(lines: ScheduleLine[]) {
  return lines.reduce(
    (acc, l) => ({
      netCents: acc.netCents + l.netCents,
      vatCents: acc.vatCents + l.vatCents,
      totalCents: acc.totalCents + l.totalCents,
    }),
    { netCents: 0, vatCents: 0, totalCents: 0 },
  );
}

/** A sensible starting plan. The office can rename, add and remove stages. */
export const DEFAULT_STAGES: { label: string; labelEl: string; percentage: number }[] = [
  { label: "Reservation", labelEl: "Κράτηση", percentage: 5 },
  { label: "On signing of contract", labelEl: "Υπογραφή συμβολαίου", percentage: 25 },
  { label: "Foundations", labelEl: "Θεμέλια", percentage: 20 },
  { label: "Frame", labelEl: "Σκελετός", percentage: 20 },
  { label: "Plastering", labelEl: "Σοβάντισμα", percentage: 20 },
  { label: "On delivery", labelEl: "Παράδοση", percentage: 10 },
];
