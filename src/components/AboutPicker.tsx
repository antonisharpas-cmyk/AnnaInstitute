"use client";

import { useState } from "react";

export type AboutChoice = { value: string; label: string; group: string };

/**
 * What a campaign is about: any number of developments and apartments.
 *
 * Ticked from a list with a search, because there are dozens of apartments,
 * and what is chosen shows above it so the office can see the whole choice at
 * a glance and take one off with a click. Each choice goes to the form as its
 * own "about" value.
 */
export default function AboutPicker({
  choices,
  chosen: given,
  onChange,
  initial = [],
  labels,
}: {
  choices: AboutChoice[];
  /** Kept by the form around it; without it the picker keeps its own, starting from initial. */
  chosen?: string[];
  onChange?: (next: string[]) => void;
  initial?: string[];
  labels: { search: string; nothing: string; remove: string };
}) {
  const [term, setTerm] = useState("");
  const [own, setOwn] = useState<string[]>(initial);
  const chosen = given ?? own;
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = choices.filter((one) => words.every((word) => one.label.toLowerCase().includes(word)));
  const groups = [...new Set(shown.map((one) => one.group))];
  const byValue = new Map(choices.map((one) => [one.value, one]));
  const toggle = (value: string, on: boolean) => {
    const next = on ? [...new Set([...chosen, value])] : chosen.filter((one) => one !== value);
    if (onChange) onChange(next);
    else setOwn(next);
  };

  return (
    <div className="space-y-2" data-about-picker>
      {chosen.map((value) => (
        <input key={value} type="hidden" name="about" value={value} />
      ))}
      <div className="flex min-h-8 flex-wrap gap-1.5" data-about-chosen>
        {chosen.length === 0 ? (
          <span className="text-xs text-brand-graphite/60">{labels.nothing}</span>
        ) : (
          chosen.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value, false)}
              className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-brand-surface px-2.5 py-0.5 text-xs hover:border-[color:var(--color-negative)]"
              title={labels.remove}
            >
              {byValue.get(value)?.label ?? value}
              <span aria-hidden="true">×</span>
            </button>
          ))
        )}
      </div>
      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={labels.search}
        className="input"
        data-about-search
      />
      <div className="max-h-56 overflow-y-auto rounded border border-brand-line p-2">
        {groups.map((group) => (
          <div key={group} className="mb-2 last:mb-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite/60">{group}</p>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {shown
                .filter((one) => one.group === group)
                .map((one) => (
                  <label key={one.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.includes(one.value)}
                      onChange={(event) => toggle(one.value, event.target.checked)}
                      data-about-choice={one.label}
                      data-about-value={one.value}
                    />
                    <span>{one.label}</span>
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
