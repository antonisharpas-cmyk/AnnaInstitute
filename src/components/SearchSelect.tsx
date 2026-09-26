"use client";

import { useMemo, useRef, useState } from "react";

/**
 * A long list of people, searched inside the field itself.
 *
 * Choosing one client out of two hundred by scrolling a dropdown is how the
 * wrong Georgiou ends up on a contract. So the field is one box: it shows who is
 * chosen, and typing in it narrows the list that opens under it, by name,
 * telephone or email, whatever is in the label. The first match is chosen as
 * you type, Enter or a click takes the one highlighted, and Escape puts back
 * the one chosen before.
 *
 * What the form sends is unchanged: a select with the field's name carries the
 * value, kept out of sight, so every action reads exactly what it always read.
 */
export type SearchOption = { value: string; label: string; hint?: string };

const matches = (option: SearchOption, words: string[]) => {
  const text = `${option.label} ${option.hint ?? ""}`.toLowerCase();
  return words.every((word) => text.includes(word));
};

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
  /** What the box says when nobody is chosen yet. */
  choose: string;
  searchPlaceholder: string;
  className?: string;
  onChange?: (value: string) => void;
  noMatch?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLInputElement>(null);

  const chosen = options.find((one) => one.value === value);
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(
    () => (words.length === 0 ? options : options.filter((one) => matches(one, words))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, term],
  );

  const pick = (next: string) => {
    setValue(next);
    onChange?.(next);
  };

  const take = (option: SearchOption | undefined) => {
    if (option) pick(option.value);
    setTerm("");
    setOpen(false);
  };

  const labelOf = (one: SearchOption) => `${one.label}${one.hint ? ` . ${one.hint}` : ""}`;

  return (
    <div className={`relative ${className}`}>
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
        ref={box}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${name}-options`}
        aria-autocomplete="list"
        aria-label={searchPlaceholder}
        autoComplete="off"
        data-search-for={name}
        value={open ? term : chosen ? chosen.label : ""}
        placeholder={open && chosen ? chosen.label : open ? searchPlaceholder : choose}
        onFocus={() => {
          setTerm("");
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => {
          /* A click on the list lands first, then this closes it. */
          setTimeout(() => setOpen(false), 120);
          setTerm("");
        }}
        onChange={(event) => {
          const next = event.target.value;
          setTerm(next);
          setOpen(true);
          setActive(0);
          const typed = next.toLowerCase().split(/\s+/).filter(Boolean);
          if (typed.length === 0) return;
          const found = options.filter((one) => matches(one, typed));
          if (!found.some((one) => one.value === value)) pick(found[0]?.value ?? "");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, Math.max(0, shown.length - 1)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (event.key === "Enter") {
            /* Enter chooses, it does not send the form. */
            event.preventDefault();
            if (open) take(shown[active]);
          } else if (event.key === "Escape") {
            setTerm("");
            setOpen(false);
          }
        }}
        className="select !pl-8"
      />

      {open ? (
        <ul
          id={`${name}-options`}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded border border-brand-line bg-white py-1 text-sm shadow-lg"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-brand-graphite/55">{noMatch}</li>
          ) : (
            shown.map((one, i) => (
              <li
                key={one.value}
                role="option"
                aria-selected={one.value === value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  take(one);
                  box.current?.blur();
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-1.5 ${
                  i === active ? "bg-brand-surface" : ""
                } ${one.value === value ? "font-semibold text-brand-teal-dark" : ""}`}
              >
                {labelOf(one)}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {/* What the form sends, out of sight. */}
      <select
        name={name}
        value={value}
        onChange={(event) => pick(event.target.value)}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      >
        <option value="" />
        {options.map((one) => (
          <option key={one.value} value={one.value}>
            {labelOf(one)}
          </option>
        ))}
      </select>

      {/* So an empty required field is refused with the browser's own note,
          placed on the box, rather than silently. */}
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          onFocus={() => box.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-8 h-px w-px opacity-0"
        />
      ) : null}
    </div>
  );
}
