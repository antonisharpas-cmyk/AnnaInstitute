"use client";

import { useCallback, useEffect, useState } from "react";

export type Picture = {
  id: string;
  label: string;
  isImage: boolean;
};

/**
 * A viewer for the files kept against one apartment or project.
 *
 * Opens over the page, one picture at a time, with arrows and the keyboard for
 * moving between them. Anything that is not a picture, a PDF or a spreadsheet
 * for example, is offered as a link instead of being drawn.
 */
function Viewer({
  items,
  index,
  onClose,
  onMove,
}: {
  items: Picture[];
  index: number;
  onClose: () => void;
  onMove: (next: number) => void;
}) {
  const current = items[index];

  const move = useCallback(
    (step: number) => onMove((index + step + items.length) % items.length),
    [index, items.length, onMove],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, onClose]);

  if (!current) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={current.label}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{current.label}</div>
          <div className="text-xs text-white/60">
            {index + 1} of {items.length}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/files/${current.id}?download=1`}
            className="rounded-full border border-white/30 px-3 py-1 text-xs text-white hover:bg-white/10"
          >
            Download
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-white/30 px-3 py-1 text-xs text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-12 pb-6">
        {items.length > 1 ? (
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Previous"
            className="absolute left-2 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
          >
            ‹
          </button>
        ) : null}

        {current.isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${current.id}`}
            alt={current.label}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="max-w-sm rounded bg-white p-6 text-center text-sm">
            <p className="mb-3 font-semibold">{current.label}</p>
            <p className="mb-4 text-brand-graphite/70">
              This one is not a picture, so it opens in its own tab.
            </p>
            <a
              href={`/api/files/${current.id}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              Open the file
            </a>
          </div>
        )}

        {items.length > 1 ? (
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Next"
            className="absolute right-2 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
          >
            ›
          </button>
        ) : null}
      </div>

      {items.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onMove(i)}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded border-2 ${
                i === index ? "border-brand-teal" : "border-transparent opacity-70"
              }`}
              title={item.label}
            >
              {item.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/files/${item.id}`}
                  alt={item.label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center bg-white/10 text-[10px] text-white">
                  file
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A plain text trigger, for a table cell. */
export function LightboxLink({
  items,
  label,
  emptyLabel = "none",
}: {
  items: Picture[];
  label?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (items.length === 0) {
    return <span className="text-xs text-brand-graphite/40">{emptyLabel}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(0)}
        className="text-xs font-semibold text-brand-teal-dark hover:underline"
      >
        {label ?? (items.length === 1 ? "open" : `open (${items.length})`)}
      </button>
      {open !== null ? (
        <Viewer items={items} index={open} onClose={() => setOpen(null)} onMove={setOpen} />
      ) : null}
    </>
  );
}

/** A grid of thumbnails, for a card. */
export function LightboxGrid({ items }: { items: Picture[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpen(i)}
            className="block overflow-hidden rounded border border-brand-line hover:border-brand-teal"
            title={item.label}
          >
            {item.isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/files/${item.id}`}
                alt={item.label}
                className="h-20 w-full object-cover"
              />
            ) : (
              <span className="grid h-20 w-full place-items-center bg-brand-teal-soft px-1 text-center text-[10px] leading-tight text-brand-graphite">
                {item.label}
              </span>
            )}
          </button>
        ))}
      </div>
      {open !== null ? (
        <Viewer items={items} index={open} onClose={() => setOpen(null)} onMove={setOpen} />
      ) : null}
    </>
  );
}
