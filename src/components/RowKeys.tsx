"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { goTo } from "@/components/GoTo";

/**
 * Moving down a list without the mouse.
 *
 * j and k, or the arrow keys, walk the rows; Enter opens the one in hand; x
 * takes it for a bulk action; Escape lets it go. This is the vocabulary people
 * bring with them from every other tool that respects the keyboard, so it is
 * worth matching exactly rather than inventing.
 *
 * Enter opens whatever the row's own name link points at, found on the page
 * rather than built here from a path. Every list therefore opens the same
 * record by keyboard as by mouse, and a list added later needs nothing from
 * this file beyond marking its name link.
 *
 * The row in hand is remembered by its own identifier rather than by a mark on
 * the page, because a list refreshes itself whenever something is saved and a
 * mark would be wiped by the refresh. Somebody who changes a status and carries
 * on with j and k stays exactly where they were.
 */
export default function RowKeys() {
  const router = useRouter();
  const hot = useRef<string | null>(null);

  useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLTableRowElement>("tr[data-id]")];

    const paint = () => {
      for (const row of rows()) {
        row.dataset.hot = row.dataset.id === hot.current ? "true" : "false";
      }
    };

    const light = (index: number) => {
      const all = rows();
      if (all.length === 0) return;
      const at = Math.max(0, Math.min(index, all.length - 1));
      hot.current = all[at].dataset.id ?? null;
      paint();
      all[at].scrollIntoView({ block: "nearest" });
    };

    const indexOfHot = () => rows().findIndex((row) => row.dataset.id === hot.current);

    const typing = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        node.isContentEditable ||
        node.closest("[role=dialog]") !== null
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing(event.target)) return;

      const all = rows();
      if (all.length === 0) return;
      const at = indexOfHot();

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        light(at < 0 ? 0 : at + 1);
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        light(at < 0 ? 0 : at - 1);
        return;
      }
      if (event.key === "x" && at >= 0) {
        const box = all[at].querySelector<HTMLInputElement>('input[name="ids"]');
        if (box) {
          event.preventDefault();
          box.checked = !box.checked;
          box.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      if (event.key === "Enter" && at >= 0) {
        const link = all[at].querySelector<HTMLAnchorElement>("a[data-open]");
        if (!link) return;
        event.preventDefault();
        goTo(router, link.getAttribute("href") ?? link.href);
        return;
      }
      if (event.key === "Escape") {
        hot.current = null;
        paint();
      }
    };

    /**
     * A saved change refreshes the list, which redraws the rows from the
     * server. This paints the row in hand again afterwards.
     */
    const body = document.querySelector("table.data tbody");
    const watcher = body
      ? new MutationObserver(() => {
          if (hot.current) paint();
        })
      : null;
    watcher?.observe(body as Node, { childList: true, subtree: true });

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      watcher?.disconnect();
    };
  }, [router]);

  return null;
}
