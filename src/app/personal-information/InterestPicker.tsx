"use client";

import { useEffect, useRef, useState } from "react";

export type Development = {
  id: string;
  name: string;
  /** The apartments still available, as a visitor would want to read them. */
  units: { id: string; label: string }[];
};

/**
 * Which developments, and which apartments in them.
 *
 * One dropdown with a tick for each development; under each one ticked, a
 * second dropdown of its apartments still available, any number of them. A
 * development with no apartment ticked means any apartment there, which is
 * what most visitors mean. What is ticked travels as plain form fields, so the
 * form still works the same way it always did.
 */
export default function InterestPicker({ developments }: { developments: Development[] }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [openUnits, setOpenUnits] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  /* A tap anywhere else closes whatever is open. */
  useEffect(() => {
    const away = (event: MouseEvent | TouchEvent) => {
      if (box.current?.contains(event.target as Node)) return;
      setOpen(false);
      setOpenUnits(null);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("touchstart", away);
    };
  }, []);

  const toggleProject = (id: string) => {
    if (projects.includes(id)) {
      /* Untick a development and its apartments go with it. */
      const theirs = developments.find((one) => one.id === id)?.units.map((unit) => unit.id) ?? [];
      setProjects(projects.filter((one) => one !== id));
      setUnits(units.filter((unit) => !theirs.includes(unit)));
    } else {
      setProjects([...projects, id]);
    }
  };
  const toggleUnit = (id: string) =>
    setUnits((now) => (now.includes(id) ? now.filter((one) => one !== id) : [...now, id]));

  const chosen = developments.filter((one) => projects.includes(one.id));
  const says =
    chosen.length === 0
      ? "Any of our developments"
      : chosen.length <= 2
        ? chosen.map((one) => one.name).join(", ")
        : `${chosen.length} developments`;

  return (
    <div ref={box} className="space-y-2" data-interest-picker>
      {projects.map((id) => (
        <input key={id} type="hidden" name="projects" value={id} />
      ))}
      {units.map((id) => (
        <input key={id} type="hidden" name="units" value={id} />
      ))}

      <div className="relative">
        <button
          type="button"
          id="interest"
          className="select w-full text-left"
          aria-expanded={open}
          onClick={() => setOpen((now) => !now)}
          data-interest-button
        >
          <span className="block truncate pr-6">{says}</span>
        </button>
        {open ? (
          <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-brand-line bg-white p-1 shadow-lg" role="group">
            {developments.map((one) => (
              <label key={one.id} className="flex cursor-pointer items-center gap-3 rounded px-3 py-2.5 text-base hover:bg-brand-surface">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={projects.includes(one.id)}
                  onChange={() => toggleProject(one.id)}
                  data-development={one.name}
                />
                {one.name}
              </label>
            ))}
            <button
              type="button"
              className="mt-1 w-full rounded px-3 py-2 text-sm font-semibold text-brand-teal-dark hover:bg-brand-surface"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        ) : null}
      </div>

      {/* For each development ticked, its apartments still available. */}
      {chosen.map((one) => {
        const mine = one.units.filter((unit) => units.includes(unit.id));
        const label =
          one.units.length === 0
            ? "No apartment is available right now"
            : mine.length === 0
              ? "Any apartment"
              : mine.length <= 3
                ? mine.map((unit) => unit.label.split(",")[0]).join(", ")
                : `${mine.length} apartments`;
        return (
          <div key={one.id} className="rounded-lg border border-brand-line bg-brand-surface p-3" data-units-for={one.name}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite/70">
              {one.name}: apartments
            </p>
            <div className="relative">
              <button
                type="button"
                className="select w-full bg-white text-left"
                disabled={one.units.length === 0}
                aria-expanded={openUnits === one.id}
                onClick={() => setOpenUnits((now) => (now === one.id ? null : one.id))}
                data-units-button
              >
                <span className="block truncate pr-6">{label}</span>
              </button>
              {openUnits === one.id ? (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-brand-line bg-white p-1 shadow-lg" role="group">
                  {one.units.map((unit) => (
                    <label key={unit.id} className="flex cursor-pointer items-center gap-3 rounded px-3 py-2.5 text-base hover:bg-brand-surface">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={units.includes(unit.id)}
                        onChange={() => toggleUnit(unit.id)}
                        data-unit={unit.label}
                      />
                      {unit.label}
                    </label>
                  ))}
                  <button
                    type="button"
                    className="mt-1 w-full rounded px-3 py-2 text-sm font-semibold text-brand-teal-dark hover:bg-brand-surface"
                    onClick={() => setOpenUnits(null)}
                  >
                    Done
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
