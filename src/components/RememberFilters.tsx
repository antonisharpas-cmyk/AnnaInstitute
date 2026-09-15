"use client";

import { useEffect } from "react";
import type { ListKey } from "@/lib/lists";

/**
 * Remembering where somebody was in a list.
 *
 * The complaint people make about big CRMs is that a list forgets: you filter
 * it, you open a record, you come back, and it is showing everything again.
 * This writes the filters of the list being looked at into a short lived cookie
 * for this browser, and the list reads it when somebody arrives with no filters
 * at all, which is the only moment it can be sure nobody asked for something
 * else. Pressing All clears it, and says so on the bar.
 */
export default function RememberFilters({ list, query }: { list: ListKey; query: string }) {
  useEffect(() => {
    try {
      const value = encodeURIComponent(query);
      // A fortnight: long enough to survive a holiday, short enough to forget.
      document.cookie = `oe_list_${list}=${value}; path=/; max-age=${60 * 60 * 24 * 14}; samesite=lax`;
    } catch {
      // A browser with cookies switched off simply starts from the whole list.
    }
  }, [list, query]);

  return null;
}
