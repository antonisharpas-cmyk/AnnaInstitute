"use client";

import { useState } from "react";
import { COUNTRIES, joinPhone, splitPhone } from "@/lib/countries";

/**
 * A telephone number with its country: the country is chosen from the list,
 * its code is put in front by itself, and the number is typed after it. What
 * is saved is the whole number, "+357 99 123456", in the field's own name, so
 * every form and every SMS reads it as before. A number typed with its own +
 * is kept as typed, whatever country is chosen.
 */
export default function PhoneField({
  name,
  id,
  defaultValue,
  required,
  className = "",
  placeholder = "99 123456",
  otherLabel = "Other (type the + code)",
}: {
  name: string;
  id?: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
  placeholder?: string;
  otherLabel?: string;
}) {
  const start = splitPhone(defaultValue);
  const [iso, setIso] = useState(start.iso);
  const [rest, setRest] = useState(start.rest);
  const value = joinPhone(iso, rest);
  return (
    <div className={`flex gap-2 ${className}`} data-phone-field={name}>
      <select
        aria-label="Country"
        value={iso}
        onChange={(event) => setIso(event.target.value)}
        className="select !w-auto max-w-[9.5rem] shrink-0"
        data-phone-country
      >
        {COUNTRIES.map((one) => (
          <option key={one.iso} value={one.iso}>
            {one.name} {one.code}
          </option>
        ))}
        <option value="OTHER">{otherLabel}</option>
      </select>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={rest}
        onChange={(event) => setRest(event.target.value)}
        required={required}
        placeholder={iso === "OTHER" ? "+44 7700 900123" : placeholder}
        className="input min-w-0 flex-1"
        data-phone-number
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
