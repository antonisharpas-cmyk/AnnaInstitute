"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { goTo } from "@/components/GoTo";

/**
 * The keyboard while the side panel is open.
 *
 * j and k walk to the next and previous record in the filtered set, and Escape
 * closes the panel and gives the list back. The same letters mean the same
 * thing here as they do on the list itself, which is the point.
 */
export default function PeekKeys({
  previousHref,
  nextHref,
  closeHref,
}: {
  previousHref: string | null;
  nextHref: string | null;
  closeHref: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      return (
        node.tagName === "INPUT" ||
        node.tagName === "TEXTAREA" ||
        node.tagName === "SELECT" ||
        node.isContentEditable
      );
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;

      /**
       * The panel is in front, so it takes these keys rather than the list
       * behind it. Stopping the event here is what keeps the highlighted row
       * on the list from wandering off at the same time.
       */
      if ((event.key === "j" || event.key === "ArrowDown") && nextHref) {
        event.preventDefault();
        event.stopPropagation();
        goTo(router, nextHref);
      }
      if ((event.key === "k" || event.key === "ArrowUp") && previousHref) {
        event.preventDefault();
        event.stopPropagation();
        goTo(router, previousHref);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        goTo(router, closeHref);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [router, previousHref, nextHref, closeHref]);

  return null;
}
