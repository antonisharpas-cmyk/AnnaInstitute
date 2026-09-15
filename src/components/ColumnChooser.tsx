"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconEye, IconEyeOff } from "@/components/icons";
import { saveListColumns } from "@/app/(app)/listActions";
import type { ListKey } from "@/lib/lists";

/**
 * Which columns this person wants to read.
 *
 * A property CRM has wide tables and nobody needs every column every day, so
 * each person keeps their own choice and it is remembered against their
 * account rather than the browser. The identifying column cannot be put away,
 * because a row with no name is not a row.
 */
export default function ColumnChooser({
  list,
  columns,
  hidden,
  labels,
}: {
  list: ListKey;
  columns: { key: string; label: string; fixed: boolean }[];
  hidden: string[];
  labels: { columns: string; hint: string; done: string; always: string };
}) {
  const [open, setOpen] = useState(false);
  const [away, setAway] = useState<string[]>(hidden);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setAway(hidden), [hidden]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = (key: string) =>
    setAway((current) =>
      current.includes(key) ? current.filter((one) => one !== key) : [...current, key],
    );

  const count = columns.length - away.length;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className="btn btn-secondary !px-2.5 !py-1 !text-xs"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {labels.columns}
        <span className="tabular-nums text-brand-graphite/60">
          {count}/{columns.length}
        </span>
      </button>

      {open ? (
        <form
          action={async (data: FormData) => {
            setOpen(false);
            await saveListColumns(data);
          }}
          className="menu columnmenu"
        >
          <input type="hidden" name="list" value={list} />
          <p className="palette-group">{labels.hint}</p>

          {columns.map((column) => {
            const off = away.includes(column.key);
            return (
              <button
                key={column.key}
                type="button"
                className="columnrow"
                data-off={off}
                disabled={column.fixed}
                aria-pressed={!off}
                onClick={() => toggle(column.key)}
              >
                <span className="flex items-center gap-2">
                  {off ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                  {column.label}
                </span>
                {column.fixed ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-brand-graphite/50">
                    {labels.always}
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    checked={!off}
                    readOnly
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none"
                  />
                )}
              </button>
            );
          })}

          {away.map((key) => (
            <input key={key} type="hidden" name="hidden" value={key} />
          ))}

          <button type="submit" className="btn btn-primary mt-2 w-full !py-1 !text-xs">
            <IconCheck size={14} />
            {labels.done}
          </button>
        </form>
      ) : null}
    </div>
  );
}
