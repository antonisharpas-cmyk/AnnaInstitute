"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconClose } from "@/components/icons";

/**
 * The bar that appears once rows are chosen.
 *
 * The checkboxes are ordinary form fields in the rows themselves, drawn by the
 * server, and this watches the form they sit in. That keeps the table plain
 * HTML while still giving the two things people expect from a list: shift click
 * to take a run of rows, and a bar that says in words how many are chosen and
 * what can be done with them.
 *
 * Choosing every matching record is deliberately a separate, spelled out step:
 * the page's own checkbox takes this page, and the link next to it escalates to
 * the whole filtered set, by sending the filters rather than a thousand ids.
 */
export default function BulkBar({
  total,
  labels,
  children,
}: {
  /** How many rows the current filters match, for the escalate line. */
  total: number;
  labels: {
    chosen: string;
    page: string;
    everyMatching: string;
    clear: string;
    scopeAll: string;
  };
  children: React.ReactNode;
}) {
  const [count, setCount] = useState(0);
  const [wholeSet, setWholeSet] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  // The form this bar lives in, whatever the markup around it looks like.
  const formOf = useCallback(() => holder.current?.closest("form") ?? null, []);
  const boxes = useCallback(
    () => [...(formOf()?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? [])],
    [formOf],
  );

  useEffect(() => {
    const form = formOf();
    if (!form) return;

    const recount = () => {
      const chosen = boxes().filter((box) => box.checked);
      setCount(chosen.length);
      if (chosen.length === 0) setWholeSet(false);
      for (const row of form.querySelectorAll("tr[data-id]")) {
        const box = row.querySelector<HTMLInputElement>('input[name="ids"]');
        row.setAttribute("data-chosen", box?.checked ? "true" : "false");
      }
    };

    /** Shift click takes everything between the last row touched and this one. */
    let anchor = -1;
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!(target instanceof HTMLInputElement) || target.name !== "ids") return;
      const all = boxes();
      const index = all.indexOf(target);

      if ((event as MouseEvent).shiftKey && anchor >= 0 && index >= 0) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (let at = from; at <= to; at += 1) all[at].checked = target.checked;
      }
      anchor = index;
      recount();
    };

    const onPageBox = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!(target instanceof HTMLInputElement) || target.dataset.pagebox === undefined) return;
      for (const box of boxes()) box.checked = target.checked;
      recount();
    };

    form.addEventListener("click", onClick);
    form.addEventListener("change", onPageBox);
    form.addEventListener("change", recount);
    recount();

    return () => {
      form.removeEventListener("click", onClick);
      form.removeEventListener("change", onPageBox);
      form.removeEventListener("change", recount);
    };
  }, [boxes, formOf]);

  const clear = () => {
    for (const box of boxes()) box.checked = false;
    const page = formOf()?.querySelector<HTMLInputElement>("input[data-pagebox]");
    if (page) page.checked = false;
    setWholeSet(false);
    setCount(0);
    for (const row of formOf()?.querySelectorAll("tr[data-id]") ?? []) {
      row.setAttribute("data-chosen", "false");
    }
  };

  return (
    <div ref={holder}>
      {count > 0 ? (
        <div className="bulkbar no-print">
          <input type="hidden" name="scope" value={wholeSet ? "all" : "page"} />

          <span className="bulkcount">
            {wholeSet ? total : count} {labels.chosen}
          </span>

          {total > count && !wholeSet ? (
            <button type="button" className="bulklink" onClick={() => setWholeSet(true)}>
              {labels.everyMatching.replace("{n}", String(total))}
            </button>
          ) : null}

          {wholeSet ? <span className="bulkscope">{labels.scopeAll}</span> : null}

          <span className="ml-auto flex flex-wrap items-center gap-2">{children}</span>

          <button
            type="button"
            onClick={clear}
            className="iconbtn"
            aria-label={labels.clear}
            title={labels.clear}
          >
            <IconClose size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
