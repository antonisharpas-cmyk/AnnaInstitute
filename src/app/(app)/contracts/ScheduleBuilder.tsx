"use client";

import { useMemo, useState } from "react";
import DateField from "@/components/DateField";

/**
 * Building the installments of a contract.
 *
 * Two ways in, because the office writes two kinds of contract. A standard one
 * follows the classic stages of the build. A monthly or quarterly one is a
 * number of equal payments. Either way every line can be renamed, redated,
 * added to or removed afterwards, and the amounts have to add up to the price
 * before VAT, which the remaining figure keeps in front of the user.
 */
export type Row = {
  key: string;
  label: string;
  labelEl?: string | null;
  amount: string;
  dueDate: string;
};

/** The stages offered in the dropdown on every line. */
const CHOICES: { label: string; labelEl: string }[] = [
  { label: "Reservation", labelEl: "Κράτηση" },
  { label: "On signing of contract", labelEl: "Υπογραφή συμβολαίου" },
  { label: "Foundations", labelEl: "Θεμέλια" },
  { label: "Frame", labelEl: "Σκελετός" },
  { label: "Plastering", labelEl: "Σοβάντισμα" },
  { label: "On completion of the apartment", labelEl: "Ολοκλήρωση διαμερίσματος" },
  { label: "On delivery", labelEl: "Παράδοση" },
  { label: "On the title deed", labelEl: "Τίτλος ιδιοκτησίας" },
];

const greekFor = (label: string) =>
  CHOICES.find((c) => c.label.toLowerCase() === label.trim().toLowerCase())?.labelEl ?? null;

const STANDARD: { label: string; labelEl: string; percentage: number }[] = [
  { label: "Reservation", labelEl: "Κράτηση", percentage: 5 },
  { label: "On signing of contract", labelEl: "Υπογραφή συμβολαίου", percentage: 25 },
  { label: "Foundations", labelEl: "Θεμέλια", percentage: 20 },
  { label: "Frame", labelEl: "Σκελετός", percentage: 20 },
  { label: "Plastering", labelEl: "Σοβάντισμα", percentage: 20 },
  { label: "On delivery", labelEl: "Παράδοση", percentage: 10 },
];

let counter = 0;
const nextKey = () => `row-${++counter}`;

const euros = (cents: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Math.abs(cents) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: Math.abs(cents) % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

const toCents = (value: string) => {
  const n = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const whole = (cents: number) =>
  Math.abs(cents) % 100 === 0 ? String(Math.round(cents / 100)) : (cents / 100).toFixed(2);

/** Largest remainder, so the parts always add up to the total exactly. */
function split(total: number, parts: number): number[] {
  const even = Math.floor(total / parts);
  const out = Array(parts).fill(even);
  let left = total - even * parts;
  for (let i = 0; left > 0; i = (i + 1) % parts, left--) out[i] += 1;
  return out;
}

function addMonths(iso: string, months: number): string {
  if (!iso) return "";
  const from = new Date(`${iso}T12:00:00Z`);
  const day = from.getUTCDate();
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export default function ScheduleBuilder({
  netPrice,
  vatRate,
  initialRows,
  initialType,
  initialPeriodMonths,
  frozen,
  labels,
}: {
  netPrice: string;
  vatRate: string;
  initialRows: Row[];
  initialType: "STANDARD" | "PERIODIC";
  initialPeriodMonths: number | null;
  /** True when money has already been received, so the lines must stay put. */
  frozen?: boolean;
  labels: {
    title: string;
    standard: string;
    periodic: string;
    count: string;
    every: string;
    monthly: string;
    quarterly: string;
    startDate: string;
    generate: string;
    stage: string;
    amount: string;
    due: string;
    add: string;
    remove: string;
    total: string;
    remaining: string;
    spread: string;
    frozen: string;
  };
}) {
  const [type, setType] = useState<"STANDARD" | "PERIODIC">(initialType);
  const [rows, setRows] = useState<Row[]>(
    initialRows.length > 0
      ? initialRows
      : STANDARD.map((s) => ({
          key: nextKey(),
          label: s.label,
          labelEl: s.labelEl,
          amount: "",
          dueDate: "",
        })),
  );
  const [count, setCount] = useState(initialPeriodMonths ? initialRows.length || 12 : 12);
  const [period, setPeriod] = useState(initialPeriodMonths ?? 1);
  const [start, setStart] = useState("");

  const netCents = toCents(netPrice);
  const rate = Number(vatRate) || 0;

  const sum = useMemo(() => rows.reduce((a, r) => a + toCents(r.amount), 0), [rows]);
  const remaining = netCents - sum;
  const vat = Math.round((sum * rate) / 100);

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const useStandard = () => {
    setType("STANDARD");
    const amounts =
      netCents > 0 ? STANDARD.map((s) => Math.round((netCents * s.percentage) / 100)) : [];
    // The percentages are exact, but rounding can still leave a cent over.
    if (amounts.length > 0) {
      const drift = netCents - amounts.reduce((a, b) => a + b, 0);
      amounts[amounts.length - 1] += drift;
    }
    setRows(
      STANDARD.map((s, i) => ({
        key: nextKey(),
        label: s.label,
        labelEl: s.labelEl,
        amount: netCents > 0 ? whole(amounts[i]) : "",
        // The stages take dates too when a start date is given, since a buyer
        // signs in a particular month and the stages follow from there.
        dueDate: start ? addMonths(start, i * period) : "",
      })),
    );
  };

  const usePeriodic = () => {
    setType("PERIODIC");
    const safe = Math.max(1, Math.min(Number(count) || 1, 240));
    const parts = netCents > 0 ? split(netCents, safe) : Array(safe).fill(0);
    setRows(
      parts.map((cents, i) => ({
        key: nextKey(),
        label: `Installment ${i + 1}`,
        labelEl: `Δόση ${i + 1}`,
        amount: netCents > 0 ? whole(cents) : "",
        dueDate: start ? addMonths(start, i * period) : "",
      })),
    );
  };

  const spreadRest = () => {
    setRows((current) => {
      if (current.length === 0) return current;
      const parts = split(Math.max(netCents, 0), current.length);
      return current.map((r, i) => ({ ...r, amount: whole(parts[i]) }));
    });
  };

  const addRow = () =>
    setRows((current) => [
      ...current,
      {
        key: nextKey(),
        label: `Installment ${current.length + 1}`,
        amount: remaining > 0 ? whole(remaining) : "",
        dueDate: "",
      },
    ]);

  const removeRow = (key: string) =>
    setRows((current) => (current.length <= 1 ? current : current.filter((r) => r.key !== key)));

  const payload = JSON.stringify(
    rows.map((r) => ({
      label: r.label,
      labelEl: r.labelEl ?? null,
      amount: r.amount || "0",
      dueDate: r.dueDate || null,
    })),
  );

  return (
    <fieldset className="rounded border border-brand-line p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
        {labels.title}
      </legend>

      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="scheduleType" value={type} />
      <input type="hidden" name="periodMonths" value={type === "PERIODIC" ? period : ""} />

      {frozen ? (
        <p className="mb-3 text-xs text-[color:var(--color-negative)]">{labels.frozen}</p>
      ) : (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={useStandard}
            className="btn btn-secondary !px-3 !py-1 !text-xs"
          >
            {labels.standard}
          </button>
          <div className="flex items-end gap-2 rounded border border-brand-line bg-brand-surface px-2 py-1.5">
            <div>
              <label className="label" htmlFor="periodicCount">
                {labels.count}
              </label>
              <input
                id="periodicCount"
                type="number"
                min={1}
                max={240}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="input !w-20 !py-1 !text-xs"
              />
            </div>
            <div>
              <label className="label" htmlFor="periodicEvery">
                {labels.every}
              </label>
              <select
                id="periodicEvery"
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="select !w-32 !py-1 !text-xs"
              >
                <option value={1}>{labels.monthly}</option>
                <option value={3}>{labels.quarterly}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="periodicStart">
                {labels.startDate}
              </label>
              <DateField
                id="periodicStart"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="!py-1 !text-xs"
              />
            </div>
            <button
              type="button"
              onClick={usePeriodic}
              className="btn btn-secondary !px-3 !py-1 !text-xs"
            >
              {labels.periodic}
            </button>
          </div>
        </div>
      )}

      <datalist id="stage-choices">
        {CHOICES.map((c) => (
          <option key={c.label} value={c.label} />
        ))}
      </datalist>

      <div className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th className="ctr">#</th>
              <th>{labels.stage}</th>
              <th className="ctr">{labels.amount}</th>
              <th className="ctr">%</th>
              <th className="ctr">{labels.due}</th>
              <th className="ctr">{labels.remove}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const cents = toCents(row.amount);
              return (
                <tr key={row.key}>
                  <td className="ctr">{i + 1}</td>
                  <td>
                    <input
                      value={row.label}
                      list="stage-choices"
                      onChange={(e) =>
                        setRow(row.key, {
                          label: e.target.value,
                          labelEl: greekFor(e.target.value) ?? row.labelEl,
                        })
                      }
                      disabled={frozen}
                      className="input !w-56 !py-1 !text-xs"
                      aria-label={`${labels.stage} ${i + 1}`}
                    />
                  </td>
                  <td className="ctr">
                    <input
                      value={row.amount}
                      onChange={(e) => setRow(row.key, { amount: e.target.value })}
                      disabled={frozen}
                      inputMode="decimal"
                      className="input !w-28 !py-1 !text-xs"
                      aria-label={`${labels.amount} ${i + 1}`}
                    />
                  </td>
                  <td className="ctr text-xs text-brand-graphite/60">
                    {netCents > 0 ? `${((cents / netCents) * 100).toFixed(2)}%` : ""}
                  </td>
                  <td className="ctr">
                    <DateField
                      value={row.dueDate}
                      onChange={(e) => setRow(row.key, { dueDate: e.target.value })}
                      className="!py-1 !text-xs"
                      aria-label={`${labels.due} ${i + 1}`}
                    />
                  </td>
                  <td className="ctr">
                    {frozen ? null : (
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        className="btn btn-secondary !px-2 !py-1 !text-xs"
                      >
                        {labels.remove}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {frozen ? null : (
          <>
            <button
              type="button"
              onClick={addRow}
              className="btn btn-secondary !px-3 !py-1 !text-xs"
            >
              {labels.add}
            </button>
            <button
              type="button"
              onClick={spreadRest}
              className="btn btn-secondary !px-3 !py-1 !text-xs"
            >
              {labels.spread}
            </button>
          </>
        )}
        <span className="text-brand-graphite/70">
          {labels.total} {euros(sum)}
          {rate > 0 ? ` + ${euros(vat)} VAT = ${euros(sum + vat)}` : ""}
        </span>
        <span
          className={
            remaining === 0
              ? "font-semibold text-[color:var(--color-positive)]"
              : "font-semibold text-[color:var(--color-negative)]"
          }
        >
          {labels.remaining} {euros(remaining)}
        </span>
      </div>
    </fieldset>
  );
}
