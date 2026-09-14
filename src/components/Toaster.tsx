"use client";

import { useEffect, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";

/**
 * The line that says a save worked.
 *
 * It appears for a few seconds and takes its own cookie with it, so a reload
 * does not show the same message twice. Clicking it dismisses it early.
 */
export default function Toaster({ message, tone }: { message: string; tone: "good" | "bad" }) {
  const [shown, setShown] = useState(true);

  useEffect(() => {
    document.cookie = "oe_said=; path=/; max-age=0";
    const timer = setTimeout(() => setShown(false), 4200);
    return () => clearTimeout(timer);
  }, [message]);

  if (!shown) return null;

  return (
    <output
      className={`toast no-print ${tone === "bad" ? "toast-bad" : "toast-good"}`}
      onClick={() => setShown(false)}
    >
      {tone === "bad" ? <IconAlert size={17} /> : <IconCheck size={17} />}
      <span>{message}</span>
    </output>
  );
}
