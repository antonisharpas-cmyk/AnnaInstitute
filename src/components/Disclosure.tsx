"use client";

import { useState, type ReactNode } from "react";

/**
 * A button that reveals a form underneath it. Used where a form would otherwise
 * sit on the page all the time: assigning an apartment, attaching a contract.
 */
export default function Disclosure({
  showLabel,
  hideLabel,
  children,
  tone = "primary",
}: {
  showLabel: string;
  hideLabel: string;
  children: ReactNode;
  tone?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`btn ${tone === "primary" ? "btn-primary" : "btn-secondary"} !px-3 !py-1 !text-xs`}
      >
        {open ? hideLabel : showLabel}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
