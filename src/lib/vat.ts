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
 * The stages the office actually writes on a contract.
 *
 * These are offered as a dropdown wherever a stage is named, so the same six
 * words are used on every contract and a line can still be typed by hand when a
 * deal needs something of its own. "On completion of the apartment" is the stage
 * that falls between the building being finished and the keys changing hands.
 */
export const STAGE_CHOICES: { label: string; labelEl: string }[] = [
  ...DEFAULT_STAGES.slice(0, 5).map((s) => ({ label: s.label, labelEl: s.labelEl })),
  { label: "On completion of the apartment", labelEl: "Ολοκλήρωση διαμερίσματος" },
  { label: "On delivery", labelEl: "Παράδοση" },
  { label: "On the title deed", labelEl: "Τίτλος ιδιοκτησίας" },
];

/**
 * A stage recognised in either language.
 *
 * The dropdown shows Greek to a Greek user, so what comes back from the form can
 * be either wording. Both are matched here and the pair is stored, which keeps
 * one contract readable in both languages whoever typed it.
 */
export function stageFromAnyLanguage(value: string): { label: string; labelEl: string } | null {
  const typed = value.trim().toLowerCase();
  return (
    STAGE_CHOICES.find(
      (s) => s.label.toLowerCase() === typed || s.labelEl.toLowerCase() === typed,
    ) ?? null
  );
}

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
 *
 * A monthly or quarterly contract does not really begin with the first
 * installment. The buyer reserves, then signs, and the installments are what is
 * left after those two, so both can be given here and both come off the price
 * before it is split. The reservation falls on the start date, the signing a
 * month after it, and the installments run every month or every quarter from
 * there. Give neither and it is a plain run of equal payments, which is what it
 * was before.
 */
export function periodicPlan(
  netCents: number,
  count: number,
  periodMonths: number,
  startDate: Date | null,
  opening?: { reservationCents?: number; onSigningCents?: number },
): { label: string; labelEl: string; percentage: number; dueDate: Date | null }[] {
  const safeCount = Math.max(1, Math.min(count, 240));
  const every = Math.max(1, periodMonths);
  const percent = (cents: number) => (netCents > 0 ? (cents / netCents) * 100 : 0);

  const reservationCents = Math.max(0, Math.round(opening?.reservationCents ?? 0));
  const onSigningCents = Math.max(0, Math.round(opening?.onSigningCents ?? 0));

  const head: { label: string; labelEl: string; percentage: number; dueDate: Date | null }[] = [];
  if (reservationCents > 0) {
    head.push({
      label: "Reservation",
      labelEl: "Κράτηση",
      percentage: percent(reservationCents),
      dueDate: startDate,
    });
  }
  if (onSigningCents > 0) {
    head.push({
      label: "On signing of contract",
      labelEl: "Υπογραφή συμβολαίου",
      percentage: percent(onSigningCents),
      dueDate: startDate ? addMonths(startDate, 1) : null,
    });
  }

  const left = Math.max(0, netCents - reservationCents - onSigningCents);
  const parts = distributeCents(left, Array(safeCount).fill(1));
  const from = startDate ? addMonths(startDate, head.length > 1 ? 1 : 0) : null;
  const shift = head.length > 0 ? 1 : 0;

  return [
    ...head,
    ...parts.map((cents, i) => ({
      label: `Installment ${i + 1}`,
      labelEl: `Δόση ${i + 1}`,
      percentage: left > 0 ? percent(cents) : 100 / safeCount,
      dueDate: from ? addMonths(from, (i + shift) * every) : null,
    })),
  ];
}
