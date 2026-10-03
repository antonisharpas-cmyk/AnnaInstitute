"use client";

import { useState } from "react";
import DateField from "@/components/DateField";

/**
 * The money part of a refund or penalty, with a way to say none was paid.
 *
 * Sometimes the agreement is that nothing goes back: the reservation is
 * cancelled and the deposit kept, or a delay is settled without compensation.
 * Ticking the box, or typing 0, records exactly that. The amount reads 0 and
 * the date, the method and the reference of a payment are greyed out, because
 * there was no payment.
 */
export default function RefundMoneyFields({
  today,
  methods,
  labels,
}: {
  today: string;
  methods: { value: string; label: string }[];
  labels: { nothing: string; nothingHint: string; amount: string; paidOn: string; method: string; reference: string };
}) {
  const [nothing, setNothing] = useState(false);
  const [amount, setAmount] = useState("");
  const zero = nothing || /^\s*0+([.,]0*)?\s*$/.test(amount);
  const off = zero ? "opacity-50" : "";

  return (
    <>
      <label className="flex items-start gap-2 text-sm sm:col-span-2" data-refund-nothing>
        <input
          type="checkbox"
          name="nothingBack"
          checked={nothing}
          onChange={(event) => {
            setNothing(event.target.checked);
            if (event.target.checked) setAmount("0");
          }}
          className="mt-0.5"
        />
        <span>
          {labels.nothing}
          <span className="block text-xs text-brand-graphite/60">{labels.nothingHint}</span>
        </span>
      </label>
      <div>
        <label className="label" htmlFor="refundAmount">
          {labels.amount}
        </label>
        <input
          id="refundAmount"
          name="amount"
          inputMode="decimal"
          required={!nothing}
          readOnly={nothing}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="input"
          placeholder="3000"
        />
      </div>
      <div className={off}>
        <label className="label" htmlFor="refundPaidOn">
          {labels.paidOn}
        </label>
        <DateField id="refundPaidOn" name="paidOn" defaultValue={today} required={!zero} disabled={zero} />
      </div>
      <div className={off}>
        <label className="label" htmlFor="refundMethod">
          {labels.method}
        </label>
        <select id="refundMethod" name="method" className="select" defaultValue="BANK" disabled={zero}>
          {methods.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </select>
      </div>
      <div className={off}>
        <label className="label" htmlFor="refundReference">
          {labels.reference}
        </label>
        <input id="refundReference" name="reference" className="input" disabled={zero} />
      </div>
    </>
  );
}
