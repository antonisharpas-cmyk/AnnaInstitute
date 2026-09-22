"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A filter that takes more than one answer, and applies itself.
 *
 * Two complaints from the office, both fair. A status filter that only takes
 * one status cannot answer "show me the new ones and the ones we have
 * contacted", which is the actual question somebody asks before they start
 * telephoning. And having chosen, pressing Search as well is a second action
 * for a decision already made.
 *
 * So: tick as many as apply, and the list reloads itself the moment the panel
 * closes. What goes into the address is a comma separated list, which keeps a
 * filtered list a plain link that can be bookmarked, saved as a view or sent to
 * somebody, exactly as a single choice did.
 *
 * The button says what is chosen rather than how many: "New, Contacted" tells
 * you what you are looking at without opening anything, and only collapses to a
 * count when there are too many to read.
 */
export type Choice = { value: string; label: string };

export default function Pick({
  name,
  label,
  chosen,
  choices,
  anything,
  only = false,
}: {
  /** The parameter this writes into the address. */
  name: string;
  label: string;
  /** What is chosen now, as it arrived in the address. */
  chosen: string[];
  choices: Choice[];
  /** What the button says when nothing is chosen. */
  anything: string;
  /**
   * One at a time.
   *
   * Most of these filters answer "which of these", where ticking several is
   * the point. A few answer "which one", where two answers at once is not a
   * question anybody asks, so picking one replaces the other.
   */
  only?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(chosen);
  const box = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement | null>(null);

  // Whatever the server says is chosen wins, so the Back button and the reset
  // button both leave this showing the truth. Compared as one string, since the
  // array itself is new on every render even when the choice has not changed.
  const asGiven = chosen.join(",");
  useEffect(() => {
    setPicked(asGiven ? asGiven.split(",") : []);
  }, [asGiven]);

  useEffect(() => {
    if (!open) return;

    const away = (event: MouseEvent) => {
      if (box.current?.contains(event.target as Node)) return;
      setOpen(false);
      apply();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      apply();
    };

    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  });

  /** Ask the list for this selection, by submitting the search form it sits in. */
  const apply = () => {
    const owner = form.current ?? box.current?.closest("form") ?? null;
    if (!owner) return;
    if (picked.join(",") === chosen.join(",")) return;
    owner.requestSubmit();
  };

  const toggle = (value: string) =>
    setPicked((now) => {
      if (only) return now.includes(value) ? [] : [value];
      return now.includes(value) ? now.filter((v) => v !== value) : [...now, value];
    });

  const chosenLabels = choices.filter((c) => picked.includes(c.value)).map((c) => c.label);
  const says =
    chosenLabels.length === 0
      ? anything
      : chosenLabels.length <= 2
        ? chosenLabels.join(", ")
        : `${chosenLabels.length} chosen`;

  return (
    <div className="pick" ref={box}>
      <span className="label">{label}</span>

      {/* What the form sends. One field, comma separated, so the address stays
          readable and the server reads it the same way it reads one value. */}
      <input
        type="hidden"
        name={name}
        value={picked.join(",")}
        ref={(node) => {
          form.current = node?.form ?? null;
        }}
      />

      <button
        type="button"
        className="pickbutton"
        data-on={picked.length > 0 ? "true" : "false"}
        onClick={() => {
          if (open) {
            setOpen(false);
            apply();
          } else {
            setOpen(true);
          }
        }}
      >
        <span className="picksays">{says}</span>
        <span className="pickmark" aria-hidden="true">
          {"▾"}
        </span>
      </button>

      {open ? (
        <div className="pickmenu" role="group" aria-label={label}>
          {choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className="pickrow"
              data-on={picked.includes(choice.value) ? "true" : "false"}
              onClick={() => toggle(choice.value)}
            >
              <span className="pickbox" aria-hidden="true">
                {picked.includes(choice.value) ? "✓" : ""}
              </span>
              {choice.label}
            </button>
          ))}

          <div className="pickfoot">
            <button
              type="button"
              className="calquick"
              onClick={() => {
                setPicked([]);
              }}
            >
              {anything}
            </button>
            <button
              type="button"
              className="calquick"
              onClick={() => {
                setOpen(false);
                apply();
              }}
            >
              {"✓"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
