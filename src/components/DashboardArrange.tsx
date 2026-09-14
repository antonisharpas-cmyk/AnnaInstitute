"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconClose,
  IconDown,
  IconEye,
  IconEyeOff,
  IconGrip,
  IconLayout,
  IconUp,
} from "@/components/icons";
import SubmitButton from "@/components/SubmitButton";
import type { Panel, PanelKey, PanelWidth } from "@/lib/dashboard";

export type ArrangeLabels = {
  arrange: string;
  title: string;
  note: string;
  save: string;
  close: string;
  reset: string;
  up: string;
  down: string;
  show: string;
  hide: string;
  width: string;
  hidden: string;
  onShow: string;
  dragHint: string;
  preview: string;
  names: Record<string, string>;
  notes: Record<string, string>;
  widths: Record<string, string>;
};

/**
 * The dashboard, arranged by the person who has to look at it.
 *
 * Three ways to move a panel, because a list that can only be dragged is a list
 * some people cannot use: the handle drags, the arrows move it a step at a time
 * from the keyboard, and the eye takes a panel off the screen without losing
 * where it was. Nothing is written until Save, and the standard screen is one
 * button away, so there is no arrangement anybody can get stuck in.
 */
export default function DashboardArrange({
  layout,
  labels,
  save,
  reset,
  widthChoices,
}: {
  layout: Panel[];
  labels: ArrangeLabels;
  save: (formData: FormData) => Promise<void>;
  reset: () => Promise<void>;
  widthChoices: PanelWidth[];
}) {
  const [open, setOpen] = useState(false);
  const [panels, setPanels] = useState<Panel[]>(layout);
  const [dragging, setDragging] = useState<PanelKey | null>(null);
  const [over, setOver] = useState<PanelKey | null>(null);
  const [hover, setHover] = useState<PanelKey | null>(null);
  const list = useRef<HTMLOListElement>(null);

  const shownCount = useMemo(() => panels.filter((panel) => panel.shown).length, [panels]);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes it, as it closes everything else in the CRM.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /** A block on the map points at its own row in the list. */
  const reveal = (key: PanelKey) => {
    setHover(key);
    const row = list.current?.querySelector(`[data-key="${key}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= panels.length) return;
    const next = [...panels];
    const [taken] = next.splice(from, 1);
    next.splice(to, 0, taken);
    setPanels(next);
  };

  const setWidth = (key: PanelKey, width: PanelWidth) =>
    setPanels((current) =>
      current.map((panel) => (panel.key === key ? { ...panel, width } : panel)),
    );

  const toggle = (key: PanelKey) =>
    setPanels((current) =>
      current.map((panel) => (panel.key === key ? { ...panel, shown: !panel.shown } : panel)),
    );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary">
        <IconLayout size={15} />
        {labels.arrange}
      </button>
    );
  }

  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="arrange">
        <header className="flex items-start justify-between gap-3 border-b border-brand-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-brand-ink">{labels.title}</h2>
            <p className="mt-0.5 text-xs text-brand-graphite/70">{labels.note}</p>
          </div>
          <button type="button" onClick={close} className="iconbtn" aria-label={labels.close}>
            <IconClose size={17} />
          </button>
        </header>

        <div className="arrange-preview">
          <p className="statlabel mb-1.5">{labels.preview}</p>
          <div className="grid grid-cols-6 gap-1">
            {panels
              .filter((panel) => panel.shown)
              .map((panel) => (
                <button
                  key={panel.key}
                  type="button"
                  className="preview-block"
                  style={{ gridColumn: `span ${panel.width}` }}
                  data-lit={hover === panel.key}
                  onMouseEnter={() => setHover(panel.key)}
                  onClick={() => reveal(panel.key)}
                >
                  <span className="truncate">{labels.names[panel.key] ?? panel.key}</span>
                </button>
              ))}
          </div>
        </div>

        <ol ref={list} className="arrange-list">
          {panels.map((panel, index) => (
            <li
              key={panel.key}
              data-key={panel.key}
              draggable
              onDragStart={() => setDragging(panel.key)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (panel.key !== over) setOver(panel.key);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!dragging) return;
                const from = panels.findIndex((item) => item.key === dragging);
                move(from, index);
                setDragging(null);
                setOver(null);
              }}
              data-dragging={dragging === panel.key}
              data-over={over === panel.key && dragging !== panel.key}
              data-off={!panel.shown}
              onMouseEnter={() => setHover(panel.key)}
              onMouseLeave={() => setHover((current) => (current === panel.key ? null : current))}
              onFocus={() => setHover(panel.key)}
              className="arrange-row"
            >
              <span className="arrange-grip" title={labels.dragHint} aria-hidden="true">
                <IconGrip size={16} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-brand-ink">
                  {labels.names[panel.key] ?? panel.key}
                  {panel.shown ? null : (
                    <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-brand-graphite/60">
                      {labels.hidden}
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-brand-graphite/65">
                  {labels.notes[panel.key] ?? ""}
                </span>
              </span>

              <label className="hidden items-center gap-1.5 sm:flex">
                <span className="sr-only">{labels.width}</span>
                <select
                  value={panel.width}
                  onChange={(event) =>
                    setWidth(panel.key, Number(event.target.value) as PanelWidth)
                  }
                  className="select !w-auto !py-1 !text-xs"
                  aria-label={labels.width}
                >
                  {widthChoices.map((width) => (
                    <option key={width} value={width}>
                      {labels.widths[String(width)] ?? width}
                    </option>
                  ))}
                </select>
              </label>

              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  className="iconbtn"
                  aria-label={labels.up}
                  title={labels.up}
                >
                  <IconUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === panels.length - 1}
                  className="iconbtn"
                  aria-label={labels.down}
                  title={labels.down}
                >
                  <IconDown size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => toggle(panel.key)}
                  className="iconbtn"
                  aria-label={panel.shown ? labels.hide : labels.show}
                  title={panel.shown ? labels.hide : labels.show}
                  aria-pressed={!panel.shown}
                >
                  {panel.shown ? <IconEye size={16} /> : <IconEyeOff size={16} />}
                </button>
              </span>
            </li>
          ))}
        </ol>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-line px-4 py-3">
          <span className="text-xs text-brand-graphite/70">
            {shownCount} {labels.onShow}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <form action={reset}>
              <SubmitButton className="btn btn-ghost !text-xs">{labels.reset}</SubmitButton>
            </form>
            <form action={save}>
              <input type="hidden" name="panels" value={JSON.stringify(panels)} />
              <SubmitButton>{labels.save}</SubmitButton>
            </form>
          </span>
        </footer>
      </div>
    </div>
  );
}
