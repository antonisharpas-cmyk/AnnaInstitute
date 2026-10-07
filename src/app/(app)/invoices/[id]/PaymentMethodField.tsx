"use client";

import { useState } from "react";

/**
 * How a payment was made. "Something else" asks what, in a box of its own,
 * and the words are kept with the payment and printed on the receipt.
 */
export default function PaymentMethodField({
  methods,
  labels,
}: {
  methods: { value: string; label: string }[];
  labels: { method: string; choose: string; other: string; otherHint: string };
}) {
  const [method, setMethod] = useState("");
  return (
    <div>
      <label className="label" htmlFor="method">
        {labels.method}
      </label>
      <select
        id="method"
        name="method"
        required
        value={method}
        onChange={(event) => setMethod(event.target.value)}
        className="select"
        data-payment-method
      >
        <option value="">{labels.choose}</option>
        {methods.map((one) => (
          <option key={one.value} value={one.value}>
            {one.label}
          </option>
        ))}
      </select>
      {method === "OTHER" ? (
        <input
          name="methodOther"
          required
          placeholder={labels.otherHint}
          aria-label={labels.other}
          className="input mt-2"
          data-method-other
          autoFocus
        />
      ) : null}
    </div>
  );
}
