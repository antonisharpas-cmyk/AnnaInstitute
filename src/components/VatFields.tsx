"use client";

import { useState } from "react";
import { formatAmount, parseAmount, withVat } from "@/lib/money";

/**
 * An amount before VAT and its VAT rate, with the VAT and the total worked out
 * as they are typed.
 *
 * Used wherever the office pays somebody: a commission, a payment to an agent,
 * a payment to a constructor. The amount and the rate are what is saved; the
 * VAT and the total are only shown here, because the database works them out
 * from the same two figures.
 */
export default function VatFields({
  idPrefix,
  defaultAmount = "",
  defaultRate,
  required = true,
  compact = false,
  locale,
  labels,
}: {
  idPrefix: string;
  defaultAmount?: string;
  defaultRate: number;
  required?: boolean;
  /** Small inputs, for the forms that sit in a row. */
  compact?: boolean;
  locale: string;
  labels: { amount: string; rate: string; vat: string; total: string };
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [rate, setRate] = useState(String(defaultRate));
  const netCents = parseAmount(amount);
  const percent = Number(rate.replace("%", "").replace(",", ".")) || 0;
  const { vatCents, totalCents } = withVat(netCents, percent);
  const small = compact ? " !py-1 !text-xs" : "";
  return (
    <>
      <div>
        <label className="label" htmlFor={`${idPrefix}-amount`}>
          {labels.amount}
        </label>
        <input
          id={`${idPrefix}-amount`}
          name="amount"
          inputMode="decimal"
          required={required}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={`input${compact ? " !w-28" : ""}${small}`}
          autoComplete="off"
        />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-rate`}>
          {labels.rate}
        </label>
        <input
          id={`${idPrefix}-rate`}
          name="vatRate"
          inputMode="decimal"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          className={`input${compact ? " !w-16" : ""}${small}`}
          autoComplete="off"
          data-vat-rate
        />
      </div>
      <div>
        <span className="label">{labels.vat}</span>
        <div className={`input bg-brand-surface${compact ? " !w-24" : ""}${small}`} data-vat-amount>
          {formatAmount(vatCents, locale)}
        </div>
      </div>
      <div>
        <span className="label">{labels.total}</span>
        <div className={`input bg-brand-surface font-semibold${compact ? " !w-28" : ""}${small}`} data-vat-total>
          {formatAmount(totalCents, locale)}
        </div>
      </div>
    </>
  );
}
