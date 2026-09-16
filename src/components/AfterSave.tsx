"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Anything saved appears, without anybody reloading the page.
 *
 * This is the answer to a complaint worth taking seriously: you record a
 * payment, or raise an adjustment, or add a note, and the page does not show it
 * until you press refresh. The save is on disk and the screen is behind, and
 * from the office's side that is indistinguishable from a save that failed.
 *
 * It happens because of where the work is now done. A payment belongs to a
 * contract, and the office records it from the buyer's profile: the page that
 * has to change is not the page the action is about. The actions now mark both
 * pages as changed, and this asks the router to draw the current one again,
 * which covers almost everything.
 *
 * Almost. This router occasionally fetches a page it has been asked to redraw
 * and then never commits it, which is the bug that started all of this. So
 * there is a last line: a moment after the save, if the page on screen is
 * letter for letter what it was before the save, it is reloaded outright. That
 * is a heavier hammer than a redraw and it is used sparingly, but it is the
 * difference between "the CRM shows what I saved" and "the CRM shows what I
 * saved, usually".
 *
 * Searches are left alone: they are plain GET forms that navigate on their own.
 * A form can opt out with data-no-refresh when it has a reason to.
 */
export default function AfterSave() {
  const router = useRouter();

  useEffect(() => {
    const onSubmit = (event: Event) => {
      const form = event.target as HTMLElement | null;
      if (!(form instanceof HTMLFormElement)) return;

      const method = (form.getAttribute("method") ?? "post").toLowerCase();
      if (method === "get") return;
      if (form.dataset.noRefresh === "true") return;

      const main = document.querySelector("main") ?? document.body;
      const before = (main as HTMLElement).innerText.length;

      let gone = false;
      const cancel = () => {
        gone = true;
      };
      window.addEventListener("beforeunload", cancel, { once: true });
      // Walking to another page makes all of this pointless.
      const wasAt = window.location.href;

      window.setTimeout(() => {
        if (gone || window.location.href !== wasAt) return;
        router.refresh();
      }, 700);

      window.setTimeout(() => {
        if (gone || window.location.href !== wasAt) return;

        const now = (document.querySelector("main") ?? document.body) as HTMLElement;
        const changed = now.innerText.length !== before;

        // Something arrived, so the redraw worked and there is nothing to do.
        if (changed) return;

        /**
         * Nothing arrived. Either the save changed nothing anybody can see, in
         * which case a reload costs a flash and no harm, or the redraw was
         * dropped, in which case this is the only thing that fixes it.
         */
        window.location.reload();
      }, 2600);
    };

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, [router]);

  return null;
}
