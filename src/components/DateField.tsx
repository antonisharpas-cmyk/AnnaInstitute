"use client";

import { useEffect, useId, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { createPortal } from "react-dom";

/**
 * A date, with a calendar of our own rather than the browser's.
 *
 * The browser's picker is a different shape, a different typeface and a
 * different set of colours on every machine in the office, and on Windows it
 * looks like a control panel. A CRM that people are in all day should not have
 * one piece of furniture from somebody else's house, so this draws the month
 * itself: the brand's teal for the day in hand, today ringed, the weekend in
 * lighter ink, the month walked with the arrows or the keyboard.
 *
 * What it does not do is take anything away. The field is still a real date
 * input as far as the form is concerned, its value is still the plain
 * YYYY-MM-DD the server expects, and it can still be typed into: somebody who
 * knows the date types it and never opens the calendar at all. The calendar is
 * held open by a click on the field or by pressing down, closed by Escape or by
 * clicking away, and the whole thing is one element in the tab order.
 */
type Props = Omit<ComponentPropsWithoutRef<"input">, "type" | "value" | "defaultValue"> & {
  defaultValue?: string;
  /**
   * Given by the few places that keep the date themselves, such as the payment
   * schedule builder, where a row's date belongs to the row rather than to the
   * field. Left out, the field keeps its own.
   */
  value?: string;
  /** Pinned open. For screenshots and for testing, never in normal use. */
  startOpen?: boolean;
};

/**
 * The few words the calendar says, in both languages.
 *
 * Read from the same cookie the rest of the CRM uses, rather than passed in by
 * every one of the twenty places that shows a date field. A calendar that says
 * "Today" in a Greek interface is exactly the kind of small wrongness that
 * makes software feel foreign.
 */
const WORDS = {
  en: { days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], today: "Today", clear: "Clear" },
  el: { days: ["Δε", "Τρ", "Τε", "Πε", "Πα", "Σα", "Κυ"], today: "Σήμερα", clear: "Καθαρισμός" },
};

function wordsFor(): (typeof WORDS)["en"] {
  try {
    return document.cookie.includes("oe_locale=el") ? WORDS.el : WORDS.en;
  } catch {
    return WORDS.en;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parse(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const made = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(made.getTime()) ? null : made;
}

/** The 42 days of a month grid, Monday first, with the neighbours greyed. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // getDay is Sunday based; the office reads a week as Monday to Sunday.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  return Array.from({ length: 42 }, (_, at) => {
    const day = new Date(start);
    day.setDate(start.getDate() + at);
    return day;
  });
}

export default function DateField({
  className = "",
  defaultValue = "",
  value: given,
  startOpen = false,
  onChange,
  ...rest
}: Props) {
  const [kept, setKept] = useState(defaultValue);
  const held = given !== undefined;
  const value = held ? given : kept;
  const [open, setOpen] = useState(startOpen);
  const [showing, setShowing] = useState(() => parse(given ?? defaultValue) ?? new Date());
  const box = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [words, setWords] = useState(WORDS.en);

  // The cookie is only there in the browser, so it is read after mounting,
  // which also keeps the first paint identical to what the server sent.
  useEffect(() => setWords(wordsFor()), []);

  const chosen = parse(value);
  const today = useMemo(() => iso(new Date()), []);
  const days = useMemo(() => monthGrid(showing.getFullYear(), showing.getMonth()), [showing]);

  // Clicking anywhere else, or pressing Escape, puts the calendar away.
  useEffect(() => {
    if (!open) return;

    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      /* The calendar is drawn at the end of the document now, so "inside the
         field" is no longer the whole test for "inside the calendar". */
      if (box.current?.contains(target)) return;
      if ((target as HTMLElement)?.closest?.(".calendar")) return;
      setOpen(false);
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

  /**
   * Where to draw the calendar, in the page's own coordinates.
   *
   * It used to be an absolutely positioned child of the field, which is fine
   * until the field sits in a table that scrolls sideways: a scrollbox clips
   * whatever hangs out of it, so on the payment schedule the calendar came out
   * with its bottom half cut off. It is now drawn at the end of the document,
   * over everything, at the place the field happens to be, and flipped above
   * the field when there is no room below it.
   */
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setAt(null);
      return;
    }

    const place = () => {
      const field = box.current?.querySelector("input");
      if (!field) return;
      const rect = field.getBoundingClientRect();
      const height = 320;
      const below = window.innerHeight - rect.bottom;
      const top = below < height && rect.top > height ? rect.top - height - 6 : rect.bottom + 6;
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 288));
      setAt({ top, left });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const monthName = showing.toLocaleDateString(words === WORDS.el ? "el-GR" : "en-GB", {
    month: "long",
    year: "numeric",
  });
  const step = (by: number) =>
    setShowing(new Date(showing.getFullYear(), showing.getMonth() + by, 1));

  /**
   * Choosing a day. When the date is kept by whoever placed the field, the
   * change is handed to them exactly as the browser would have handed it over,
   * so a controlled field and a plain one behave the same from the outside.
   */
  const take = (day: Date) => {
    const next = iso(day);
    if (!held) setKept(next);
    setShowing(day);
    setOpen(false);
    onChange?.({
      target: { value: next, name: rest.name ?? "" },
      currentTarget: { value: next, name: rest.name ?? "" },
    } as never);
  };

  return (
    <div className="datewrap" ref={box}>
      <input
        {...rest}
        type="date"
        value={value}
        onChange={(event) => {
          if (!held) setKept(event.target.value);
          const typed = parse(event.target.value);
          if (typed) setShowing(typed);
          onChange?.(event);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`input datefield ${className}`}
      />

      {open && at && typeof document !== "undefined" ? (
        createPortal(
        <div
          className="calendar floating"
          style={{ top: at.top, left: at.left }}
          role="dialog"
          aria-label={monthName}
          aria-describedby={labelId}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="calhead">
            <button
              type="button"
              className="calstep"
              onClick={() => step(-1)}
              aria-label="Previous month"
            >
              {"←"}
            </button>
            <span className="calmonth" id={labelId}>
              {monthName}
            </span>
            <button
              type="button"
              className="calstep"
              onClick={() => step(1)}
              aria-label="Next month"
            >
              {"→"}
            </button>
          </div>

          <div className="calnames" aria-hidden="true">
            {words.days.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>

          <div className="calgrid">
            {days.map((day) => {
              const stamp = iso(day);
              return (
                <button
                  key={stamp}
                  type="button"
                  className="calday"
                  data-other={day.getMonth() === showing.getMonth() ? "false" : "true"}
                  data-weekend={day.getDay() === 0 || day.getDay() === 6 ? "true" : "false"}
                  data-today={stamp === today ? "true" : "false"}
                  data-on={chosen && stamp === iso(chosen) ? "true" : "false"}
                  onClick={() => take(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="calfoot">
            <button type="button" className="calquick" onClick={() => take(new Date())}>
              {words.today}
            </button>
            <button
              type="button"
              className="calquick"
              onClick={() => {
                if (!held) setKept("");
                setOpen(false);
                onChange?.({
                  target: { value: "", name: rest.name ?? "" },
                  currentTarget: { value: "", name: rest.name ?? "" },
                } as never);
              }}
            >
              {words.clear}
            </button>
          </div>
        </div>,
        document.body,
        )
      ) : null}
    </div>
  );
}
