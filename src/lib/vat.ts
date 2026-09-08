import { distributeCents } from "./money";

/**
 * VAT on a contract: one rate on the whole price before VAT.
 *
 * Nothing is hard coded, because the law changes. Whether a sale attracts the
 * reduced rate or the standard one is a decision the office makes when it
 * writes the contract, and the rate it typed is what the schedule uses.
 */
export type VatSetup = {
  netCents: number;
  rate: number;
};

export type InstallmentPlanItem = {
  seq: number;
  label: string;
  labelEl?: string | null;
  percentage: number;
  dueDate?: Date | null;
  /** An installment with a receipt against it is locked and never recalculated. */
  locked: boolean;
  lockedNetCents?: number;
  lockedVatCents?: number;
  lockedRate?: number;
};

export type ScheduleLine = {
  seq: number;
  label: string;
  labelEl?: string | null;
  percentage: number;
  dueDate?: Date | null;
  netCents: number;
  vatCents: number;
  totalCents: number;
  rateApplied: number;
  locked: boolean;
};

export function vatOn(netCents: number, rate: number): number {
  return Math.round((netCents * rate) / 100);
}

export function vatOfSetup(setup: VatSetup): number {
  return vatOn(setup.netCents, setup.rate);
}

/**
 * Build the payment schedule.
 *
 * Rules, in the client's words:
 *  1. Changing the VAT applies the new rate to the installments that are still open.
 *  2. Anything already paid keeps the figures it was actually invoiced at, for ever.
 *
 * So locked lines are copied through untouched. The remaining net price is spread
 * across the open lines by their percentages, to the cent.
 */
export function buildSchedule(setup: VatSetup, plan: InstallmentPlanItem[]): ScheduleLine[] {
  const locked = plan.filter((p) => p.locked);
  const open = plan.filter((p) => !p.locked);

  const lockedNet = locked.reduce((a, p) => a + (p.lockedNetCents ?? 0), 0);
  const remainingNet = setup.netCents - lockedNet;

  const openNet = distributeCents(
    Math.max(remainingNet, 0),
    open.map((p) => p.percentage),
  );

  // The VAT of the whole open part is worked out once and then split over the
  // lines, so the schedule adds up to the VAT on the price exactly rather than
  // drifting a cent or two through rounding each line on its own.
  const openVat = distributeCents(vatOn(Math.max(remainingNet, 0), setup.rate), openNet);

  const byLine = new Map<number, ScheduleLine>();

  locked.forEach((p) => {
    const netCents = p.lockedNetCents ?? 0;
    const vatCents = p.lockedVatCents ?? 0;
    byLine.set(p.seq, {
      seq: p.seq,
      label: p.label,
      labelEl: p.labelEl ?? null,
      percentage: p.percentage,
      dueDate: p.dueDate ?? null,
      netCents,
      vatCents,
      totalCents: netCents + vatCents,
      rateApplied: p.lockedRate ?? (netCents > 0 ? (vatCents / netCents) * 100 : 0),
      locked: true,
    });
  });

  open.forEach((p, i) => {
    const netCents = openNet[i] ?? 0;
    const vatCents = openVat[i] ?? 0;
    byLine.set(p.seq, {
      seq: p.seq,
      label: p.label,
      labelEl: p.labelEl ?? null,
      percentage: p.percentage,
      dueDate: p.dueDate ?? null,
      netCents,
      vatCents,
      totalCents: netCents + vatCents,
      rateApplied: setup.rate,
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

/** The classic stages of a Cyprus development contract. */
export const DEFAULT_STAGES: {
  label: string;
  labelEl: string;
  percentage: number;
}[] = [
  { label: "Reservation", labelEl: "Κράτηση", percentage: 5 },
  {
    label: "On signing of contract",
    labelEl: "Υπογραφή συμβολαίου",
    percentage: 25,
  },
  { label: "Foundations", labelEl: "Θεμέλια", percentage: 20 },
  { label: "Frame", labelEl: "Σκελετός", percentage: 20 },
  { label: "Plastering", labelEl: "Σοβάντισμα", percentage: 20 },
  { label: "On delivery", labelEl: "Παράδοση", percentage: 10 },
];

/**
 * The same day of the month, n months on, clamped to the end of a short month:
 * the 31st of January plus one month is the 28th of February, not the 3rd of
 * March, which is what a naive date would give.
 */
export function addMonths(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const target = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1, 12, 0, 0),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12, 0, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * Equal periodic payments: twelve monthly, eight quarterly, whatever they ask
 * for. The amounts are split to the cent, so the parts always add up.
 */
export function periodicPlan(
  netCents: number,
  count: number,
  periodMonths: number,
  startDate: Date | null,
): { label: string; labelEl: string; percentage: number; dueDate: Date | null }[] {
  const safeCount = Math.max(1, Math.min(count, 240));
  const parts = distributeCents(netCents, Array(safeCount).fill(1));

  return parts.map((cents, i) => {
    const dueDate = startDate ? addMonths(startDate, i * Math.max(1, periodMonths)) : null;
    return {
      label: `Installment ${i + 1}`,
      labelEl: `Δόση ${i + 1}`,
      percentage: netCents > 0 ? (cents / netCents) * 100 : 100 / safeCount,
      dueDate,
    };
  });
}
