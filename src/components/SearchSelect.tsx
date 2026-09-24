"use client";

import { useMemo, useState } from "react";

/**
 * A long list of people, with a search box on top.
 *
 * Choosing one client out of two hundred by scrolling a dropdown is how the
 * wrong Georgiou ends up on a contract. So a few letters typed above the list
 * narrow it as they are typed, by name, telephone or email, whatever is in the
 * label, and the first match is chosen for you if the one chosen before is no
 * longer among them. The list itself is still an ordinary select, so the form
 * sends exactly what it always sent.
 */
export type SearchOption = { value: string; label: string; hint?: string };

export default function SearchSelect({
  id,
  name,
  options,
  defaultValue = "",
  required,
  choose,
  searchPlaceholder,
  className = "",
  onChange,
  noMatch = "No match",
}: {
  id?: string;
  name: string;
  options: SearchOption[];
  defaultValue?: string;
  required?: boolean;
  /** The empty first line, "Choose". */
  choose: string;
  searchPlaceholder: string;
  className?: string;
  onChange?: (value: string) => void;
  noMatch?: string;
}) {
  const [term, setTerm] = useState("");
  const [value, setValue] = useState(defaultValue);

  /* Every word typed has to appear somewhere in the line, in any order. */
  const shown = useMemo(() => {
    const words = term.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return options;
    return options.filter((one) => {
      const text = `${one.label} ${one.hint ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [options, term]);

  const pick = (next: string) => {
    setValue(next);
    onChange?.(next);
  };

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="relative">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-graphite/45"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
        <input
          type="search"
          value={term}
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          autoComplete="off"
          data-search-for={name}
          onChange={(event) => {
            const next = event.target.value;
            setTerm(next);
            const words = next.toLowerCase().split(/\s+/).filter(Boolean);
            const matching = options.filter((one) => {
              const text = `${one.label} ${one.hint ?? ""}`.toLowerCase();
              return words.every((word) => text.includes(word));
            });
            if (words.length > 0 && !matching.some((one) => one.value === value)) {
              pick(matching[0]?.value ?? "");
            }
          }}
          onKeyDown={(event) => {
            /* Enter in the search box chooses, it does not send the form. */
            if (event.key === "Enter") event.preventDefault();
          }}
          className="input !py-1.5 !pl-8 text-sm"
        />
      </div>
      <select
        id={id}
        name={name}
        required={required}
        value={value}
        onChange={(event) => pick(event.target.value)}
        className="select"
      >
        <option value="">
          {term && shown.length === 0 ? noMatch : choose}
        </option>
        {shown.map((one) => (
          <option key={one.value} value={one.value}>
            {one.label}
            {one.hint ? ` . ${one.hint}` : ""}
          </option>
        ))}
        {/* The chosen one stays in the list even while a search hides it. */}
        {value && !shown.some((one) => one.value === value)
          ? options
              .filter((one) => one.value === value)
              .map((one) => (
                <option key={one.value} value={one.value}>
                  {one.label}
                </option>
              ))
          : null}
      </select>
    </div>
  );
}
