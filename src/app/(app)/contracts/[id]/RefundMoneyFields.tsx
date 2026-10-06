"use client";

import { useState } from "react";
import DateField from "@/components/DateField";

/**
 * The form of a refund or a delay penalty, which changes with what it is.
 *
 * A refund can be nothing paid back: the reservation cancelled and the
 * deposit kept. Ticking the box, or typing 0, records exactly that, and the
 * date and the method are greyed out because there was no payment. A refund
 * can also cancel the reservation.
 *
 * A delay penalty is always money paid, so it has neither of those.
 */
export default function RefundMoneyFields({
  today,
  methods,
  labels,
}: {
  today: string;
  methods: { value: string; label: string }[];
  labels: {
    purpose: string;
    penalty: string;
    refund: string;
    nothing: string;
    nothingHint: string;
    amount: string;
    paidOn: string;
    method: string;
    note: string;
    noteHint: string;
    cancel: string;
    cancelHint: string;
  };
}) {
  const [purpose, setPurpose] = useState("PENALTY");
  const refund = purpose === "REFUND";
  const [nothingTicked, setNothing] = useState(false);
  const [amount, setAmount] = useState("");
  const nothing = refund && nothingTicked;
  const zero = refund && (nothing || /^\s*0+([.,]0*)?\s*$/.test(amount));
  const off = zero ? "opacity-50" : "";

  return (
    <>
      <div>
        <label className="label" htmlFor="refundPurpose">
          {labels.purpose}
        </label>
        <select id="refundPurpose" name="purpose" className="select" value={purpose} onChange={(event) => setPurpose(event.target.value)}>
          <option value="PENALTY">{labels.penalty}</option>
          <option value="REFUND">{labels.refund}</option>
        </select>
      </div>
      {refund ? (
        <label className="flex items-start gap-2 text-sm sm:col-span-2" data-refund-nothing>
          <input
            type="checkbox"
            name="nothingBack"
            checked={nothingTicked}
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
      ) : null}
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
      <div className="sm:col-span-2">
        <label className="label" htmlFor="refundNote">
          {labels.note}
        </label>
        <input id="refundNote" name="note" className="input" placeholder={labels.noteHint} />
      </div>
      {refund ? (
        <label className="flex items-start gap-2 text-sm sm:col-span-2" data-refund-cancel>
          <input type="checkbox" name="cancelContract" className="mt-0.5" />
          <span>
            {labels.cancel}
            <span className="block text-xs text-brand-graphite/60">{labels.cancelHint}</span>
          </span>
        </label>
      ) : null}
    </>
  );
}
