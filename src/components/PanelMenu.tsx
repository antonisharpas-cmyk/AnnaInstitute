"use client";

import { useEffect, useRef, useState } from "react";
import { IconDown, IconEyeOff, IconGrip, IconUp } from "@/components/icons";

/**
 * The little menu every dashboard panel carries.
 *
 * Moving one box up should not need a dialog, so each panel has a handle that
 * appears when the pointer is near it: up, down, a width, or put it away. It is
 * a set of small forms, so each one is a server action and the screen is saved
 * the moment it is used, and none of it exists when the panel is printed.
 */
export default function PanelMenu({
  panelKey,
  width,
  first,
  last,
  widths,
  labels,
  move,
  hide,
  setWidth,
}: {
  panelKey: string;
  width: number;
  first: boolean;
  last: boolean;
  widths: number[];
  labels: {
    handle: string;
    up: string;
    down: string;
    hide: string;
    width: string;
    widths: Record<string, string>;
  };
  move: (key: string, direction: "up" | "down") => Promise<void>;
  hide: (key: string) => Promise<void>;
  setWidth: (key: string, width: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={box} className="panel-handle no-print" data-open={open}>
      <button
        type="button"
        className="panel-grip"
        onClick={() => setOpen((current) => !current)}
        aria-label={labels.handle}
        title={labels.handle}
        aria-expanded={open}
      >
        <IconGrip size={14} />
      </button>

      {open ? (
        <div className="menu panel-menu">
          <form action={move.bind(null, panelKey, "up")}>
            <button type="submit" className="menuitem w-full" disabled={first}>
              <IconUp size={15} />
              {labels.up}
            </button>
          </form>
          <form action={move.bind(null, panelKey, "down")}>
            <button type="submit" className="menuitem w-full" disabled={last}>
              <IconDown size={15} />
              {labels.down}
            </button>
          </form>

          <div className="my-1 border-t border-brand-line" />
          <p className="palette-group">{labels.width}</p>
          <div className="flex flex-wrap gap-1 px-2 pb-2">
            {widths.map((choice) => (
              <form key={choice} action={setWidth.bind(null, panelKey, choice)}>
                <button
                  type="submit"
                  className={`btn !px-2 !py-1 !text-[11px] ${
                    choice === width ? "btn-primary" : "btn-secondary"
                  }`}
                >
                  {labels.widths[String(choice)] ?? choice}
                </button>
              </form>
            ))}
          </div>

          <div className="my-1 border-t border-brand-line" />
          <form action={hide.bind(null, panelKey)}>
            <button type="submit" className="menuitem w-full">
              <IconEyeOff size={15} />
              {labels.hide}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
