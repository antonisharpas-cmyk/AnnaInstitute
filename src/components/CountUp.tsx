"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts up to itself.
 *
 * The four numbers at the top of the dashboard are the first thing anybody
 * looks at in the morning, and a number that arrives rather than simply being
 * there is read rather than skipped. It takes half a second, it starts from
 * something close rather than from zero so the movement is a settle and not a
 * slot machine, and it only ever animates once per load.
 *
 * The final text is what the server rendered, in full, formatted the way the
 * office expects. This only redraws the digits on the way there, so nothing
 * about the actual figure depends on the browser being able to do it: with
 * scripting off, or with movement switched off in the operating system, the
 * number is simply correct from the first frame.
 */
export default function CountUp({
  value,
  text,
  locale,
  money,
}: {
  /** The number behind the text, in whatever unit the text is written in. */
  value: number;
  /** What it should read at the end, formatted by the server. */
  text: string;
  locale: string;
  /** Money keeps its symbol and its decimals while it counts. */
  money?: boolean;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quiet || !Number.isFinite(value) || value === 0) return;

    const from = value * 0.82;
    const start = performance.now();
    const run = 520;
    const format = new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
      maximumFractionDigits: 0,
    });

    let frame = 0;

    const tick = (now: number) => {
      const through = Math.min(1, (now - start) / run);
      // Slowing towards the end, so it lands rather than stops.
      const eased = 1 - (1 - through) ** 3;
      const at = from + (value - from) * eased;

      if (through >= 1) {
        setShown(null);
        return;
      }

      setShown(money ? `€${format.format(Math.round(at))}` : format.format(Math.round(at)));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, locale, money]);

  return <>{shown ?? text}</>;
}
