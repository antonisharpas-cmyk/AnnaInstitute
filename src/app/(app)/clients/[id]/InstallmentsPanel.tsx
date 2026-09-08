"use client";

import { useState } from "react";

/**
 * The installments of one contract, folded away until somebody asks for them.
 * Kept as a client component only so the button can open and close it without
 * leaving the page.
 */
export default function InstallmentsPanel({
  showLabel,
  hideLabel,
  children,
}: {
  showLabel: string;
  hideLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="btn btn-secondary !px-3 !py-1 !text-xs"
      >
        {open ? hideLabel : showLabel}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </>
  );
}
