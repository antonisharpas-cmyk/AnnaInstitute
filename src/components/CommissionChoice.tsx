"use client";

import { useState } from "react";
import { formatAmount, formatPercent, parseAmount } from "@/lib/money";
import type { CommissionMode } from "@/lib/commissionChoice";

/*
 * The agent's commission on one contract: their usual rate, another rate, or
 * a fixed amount before VAT, and whether it is paid in cash. Underneath, the
 * sum as it will come out, so nobody saves a figure they have not seen.
 */
export default function CommissionChoice({
  agentRate,
  baseCents,
  defaults,
  compact,
  locale,
  labels,
}: {
  /** The agent's usual rate, or null when no agent is chosen yet. */
  agentRate: number | null;
  /** The full value it is worked out on: the price and any cash agreed with it. */
  baseCents: number;
  defaults: { mode: CommissionMode; rate: string; fixed: string; inCash: boolean };
  compact?: boolean;
  locale: string;
  labels: Record<string, string>;
}) {
  const [mode, setMode] = useState<CommissionMode>(defaults.mode);
  const [rate, setRate] = useState(defaults.rate);
  const [fixed, setFixed] = useState(defaults.fixed);
  const [inCash, setInCash] = useState(defaults.inCash);

  const money = (cents: number) => formatAmount(cents, locale);
  const typedRate = Number(rate.replace(",", "."));
  const preview = (() => {
    if (mode === "FIXED") {
      const cents = parseAmount(fixed);
      return cents > 0 ? `${labels.fixedPreview} ${money(cents)}` : "";
    }
    const r = mode === "RATE" ? typedRate : agentRate;
    if (r === null || !Number.isFinite(r) || baseCents <= 0) return "";
    return `${formatPercent(r, locale)} ${labels.of} ${money(baseCents)} = ${money(Math.round((baseCents * r) / 100))}`;
  })();
  const tail = inCash ? labels.cashTail : labels.vatTail;

  const small = compact ? "!py-1 !text-xs" : "";
  return (
    <fieldset className="rounded border border-brand-line p-3" data-commission-choice>
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">{labels.title}</legend>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="commissionMode" value="STANDARD" checked={mode === "STANDARD"} onChange={() => setMode("STANDARD")} />
          <span>
            {labels.standard}
            {agentRate !== null ? ` (${formatPercent(agentRate, locale)})` : ""}
          </span>
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" name="commissionMode" value="RATE" checked={mode === "RATE"} onChange={() => setMode("RATE")} />
          <span>{labels.otherRate}</span>
          <input
            name="commissionRate"
            value={rate}
            onChange={(event) => {
              setRate(event.target.value);
              setMode("RATE");
            }}
            inputMode="decimal"
            placeholder="7"
            aria-label={labels.otherRate}
            className={`input !w-20 ${small}`}
            data-commission-rate
          />
          <span>%</span>
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" name="commissionMode" value="FIXED" checked={mode === "FIXED"} onChange={() => setMode("FIXED")} />
          <span>{labels.fixed}</span>
          <input
            name="commissionFixed"
            value={fixed}
            onChange={(event) => {
              setFixed(event.target.value);
              setMode("FIXED");
            }}
            inputMode="decimal"
            placeholder="5000"
            aria-label={labels.fixed}
            className={`input !w-28 ${small}`}
            data-commission-fixed
          />
          <span className="text-xs text-brand-graphite/60">{labels.beforeVat}</span>
        </label>
        <label className="mt-1 flex items-start gap-2 border-t border-brand-line pt-2">
          <input type="checkbox" name="commissionInCash" checked={inCash} onChange={(event) => setInCash(event.target.checked)} className="mt-0.5" />
          <span>
            {labels.inCash}
            <span className="block text-xs text-brand-graphite/60">{labels.inCashHint}</span>
          </span>
        </label>
        {preview ? (
          <p className="text-xs font-semibold" data-commission-preview>
            {preview}
            {tail ? `, ${tail}` : ""}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
