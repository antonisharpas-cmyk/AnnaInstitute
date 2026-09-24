"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

/**
 * A time, typed or picked, in the office's own shorthand.
 *
 * The browser's own time control is a different shape on every machine, it is
 * narrow, and on Windows it reads as three tiny spinners. Nobody in an office
 * types 16:00 into three boxes: they say four, or four thirty, or 4pm.
 *
 * So this is a plain text box with a picker that opens beside it: the hours of
 * the working day, seven in the morning to nine at night, then the quarter. Whatever is
 * typed is understood and tidied on the way out: 9 becomes 09:00, 930 becomes
 * 09:30, 4pm becomes 16:00, 4.30 pm becomes 16:30. The value handed to the
 * server is always HH:MM, which is the only thing the server knows about.
 */

/** What somebody meant by what they typed. */
export function understand(raw: string): string {
  const text = raw.trim().toLowerCase();
  if (!text) return "";

  const pm = /p\.?m\.?$/.test(text);
  const am = /a\.?m\.?$/.test(text);
  const digits = text.replace(/[^0-9:.]/g, "").replace(/\./g, ":");

  let hour = 0;
  let minute = 0;

  if (digits.includes(":")) {
    const [h, m] = digits.split(":");
    hour = Number(h);
    minute = Number(m ?? 0);
  } else if (digits.length <= 2) {
    hour = Number(digits);
  } else {
    hour = Number(digits.slice(0, digits.length - 2));
    minute = Number(digits.slice(-2));
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** How it reads back to somebody in an English interface. */
function nicely(value: string, locale: string): string {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  if (locale === "el") return value;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The hours of a working day, and the quarters within each. */
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07 to 21
const QUARTERS = [0, 15, 30, 45];
const two = (n: number) => String(n).padStart(2, "0");

export default function TimeField({
  defaultValue,
  locale = "en",
  className = "",
  ...rest
}: Omit<ComponentPropsWithoutRef<"input">, "type" | "defaultValue"> & {
  defaultValue?: string;
  locale?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [typed, setTyped] = useState(nicely(defaultValue ?? "", locale));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /* Click anywhere else, or press Escape, and the picker folds away. */
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const [hour, minute] = value ? value.split(":").map(Number) : [NaN, NaN];

  const choose = (h: number, m: number, close: boolean) => {
    const next = `${two(h)}:${two(m)}`;
    setValue(next);
    setTyped(nicely(next, locale));
    if (close) setOpen(false);
  };

  const hourLabel = (h: number) =>
    locale === "el" ? two(h) : `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

  return (
    <div ref={box} className="relative">
      {/* What the server is given: always HH:MM, whatever was typed or picked. */}
      <input type="hidden" name={rest.name} value={value} />
      <div className="relative">
        <input
          {...rest}
          name={undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder="16:00"
          value={typed}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setTyped(event.target.value);
            setValue(understand(event.target.value));
          }}
          onBlur={(event) => {
            const understood = understand(typed);
            setValue(understood);
            setTyped(understood ? nicely(understood, locale) : "");
            /* Moving on to the next box folds the picker away, so it never
               sits over the button somebody is reaching for. */
            if (!box.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          className={`input pr-9 ${className}`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Pick a time"
          onClick={() => setOpen((was) => !was)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-brand-graphite/55 hover:text-brand-teal-dark"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        </button>
      </div>

      {/*
        The picker: the hour first, then the quarter. Picking an hour keeps the
        minutes already chosen, or sets it on the hour; picking the quarter
        finishes it and folds the panel away.
      */}
      {open ? (
        <div
          role="dialog"
          className="absolute left-0 z-40 mt-1 w-72 rounded-lg border border-brand-line bg-brand-paper p-3 shadow-lg"
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-graphite/55">
            {locale === "el" ? "Ώρα" : "Hour"}
          </p>
          <div className="grid grid-cols-5 gap-1">
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(h, Number.isFinite(minute) ? minute : 0, false)}
                className={`rounded px-1 py-1.5 text-xs font-medium transition-colors ${
                  h === hour
                    ? "bg-brand-teal text-white"
                    : "bg-brand-surface text-brand-graphite hover:bg-brand-teal/15"
                }`}
              >
                {hourLabel(h)}
              </button>
            ))}
          </div>
          <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-brand-graphite/55">
            {locale === "el" ? "Λεπτά" : "Minutes"}
          </p>
          <div className="grid grid-cols-4 gap-1">
            {QUARTERS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={!Number.isFinite(hour)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(hour, m, true)}
                className={`rounded py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                  m === minute && Number.isFinite(hour)
                    ? "bg-brand-teal text-white"
                    : "bg-brand-surface text-brand-graphite hover:bg-brand-teal/15"
                }`}
              >
                :{two(m)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-brand-line pt-2 text-xs">
            <span className="font-semibold text-brand-teal-dark">
              {value ? nicely(value, locale) : locale === "el" ? "Καμία ώρα" : "No time yet"}
            </span>
            <span className="flex gap-3">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setValue("");
                  setTyped("");
                }}
                className="text-brand-graphite/60 hover:underline"
              >
                {locale === "el" ? "Καθαρισμός" : "Clear"}
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setOpen(false)}
                className="font-semibold text-brand-teal-dark hover:underline"
              >
                {locale === "el" ? "Εντάξει" : "OK"}
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
