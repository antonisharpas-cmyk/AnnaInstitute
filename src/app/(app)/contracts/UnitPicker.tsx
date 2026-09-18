"use client";

import { useMemo, useState } from "react";

/**
 * The apartments a landowner receives under a land exchange.
 *
 * A sale is one apartment and a dropdown says so. Antiparochi is not: the owner
 * hands over a plot and is paid in a share of the finished building, which is
 * several apartments and sometimes a floor of them. So this asks the question
 * the agreement actually asks, which of them are theirs, and it asks it as a
 * list that can be searched, because a development with forty apartments in a
 * dropdown is a development nobody picks six from correctly.
 *
 * What is chosen is named back at the top, so the answer can be checked without
 * scrolling the list looking for ticks.
 */
export default function UnitPicker({
  units,
  chosen,
  labels,
}: {
  units: { id: string; label: string }[];
  chosen: string[];
  labels: { search: string; none: string; count: string; nothingFound: string };
}) {
  const [picked, setPicked] = useState<string[]>(chosen);
  const [term, setTerm] = useState("");

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return units;
    return units.filter((one) => one.label.toLowerCase().includes(q));
  }, [units, term]);

  const toggle = (id: string) =>
    setPicked((was) => (was.includes(id) ? was.filter((one) => one !== id) : [...was, id]));

  const names = units.filter((one) => picked.includes(one.id)).map((one) => one.label);

  return (
    <div>
      <p className="mb-2 text-xs">
        {picked.length === 0 ? (
          <span className="text-brand-graphite/60">{labels.none}</span>
        ) : (
          <>
            <span className="font-semibold">
              {picked.length} {labels.count}
            </span>
            <span className="text-brand-graphite/70"> . {names.join(", ")}</span>
          </>
        )}
      </p>

      <input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={labels.search}
        className="input mb-2 !py-1 !text-xs"
      />

      <div className="max-h-56 overflow-y-auto rounded border border-brand-line bg-brand-paper p-2">
        {matches.length === 0 ? (
          <p className="p-2 text-xs text-brand-graphite/60">{labels.nothingFound}</p>
        ) : (
          matches.map((one) => (
            <label
              key={one.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-brand-surface"
            >
              <input
                type="checkbox"
                name="unitIds"
                value={one.id}
                checked={picked.includes(one.id)}
                onChange={() => toggle(one.id)}
              />
              <span>{one.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
