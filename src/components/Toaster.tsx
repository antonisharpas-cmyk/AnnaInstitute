"use client";

import { useEffect, useState } from "react";
import { IconAlert, IconCheck, IconUp } from "@/components/icons";

/**
 * The line that says a save worked, and offers it back.
 *
 * It appears for a few seconds and takes its own cookie with it, so a reload
 * does not show the same message twice. When the action that caused it can be
 * undone, the line carries the button that does it, which is the only place
 * anybody has to look. Hovering keeps it on screen, so the offer is not lost
 * to somebody reading rather than reacting.
 */
export default function Toaster({
  message,
  tone,
  undo,
}: {
  message: string;
  tone: "good" | "bad";
  undo?: { label: string; action: () => Promise<void> };
}) {
  const [shown, setShown] = useState(true);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    document.cookie = "oe_said=; path=/; max-age=0";
    if (held) return;
    const timer = setTimeout(() => setShown(false), undo ? 9000 : 4200);
    return () => clearTimeout(timer);
  }, [message, held, undo]);

  if (!shown) return null;

  return (
    <output
      className={`toast no-print ${tone === "bad" ? "toast-bad" : "toast-good"}`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      {tone === "bad" ? <IconAlert size={17} /> : <IconCheck size={17} />}
      <span>{message}</span>
      {undo ? (
        <form action={undo.action} className="ml-1">
          <button type="submit" className="toast-undo" onClick={() => setShown(false)}>
            <IconUp size={14} />
            {undo.label}
          </button>
        </form>
      ) : null}
      <button
        type="button"
        onClick={() => setShown(false)}
        className="toast-close"
        aria-label="close"
      >
        &times;
      </button>
    </output>
  );
}
