/**
 * Sorting a list by one of its columns.
 *
 * Every table in the CRM can be sorted by clicking a heading, and the four big
 * lists do it on the server rather than in the browser, because they show one
 * page of a much longer list: sorting the twenty rows on screen would be a lie
 * about the other four hundred. So the chosen column lives in the address, the
 * database does the ordering, and the result can be bookmarked, saved as a view
 * or sent to somebody as a link exactly like a filter can.
 *
 * Clicking the heading you are already sorted by turns it round. Clicking any
 * other heading sorts by it, ascending, which is what people expect from a
 * spreadsheet.
 */

export type Dir = "asc" | "desc";

export type Sort = { key: string; dir: Dir };

/** The column and direction asked for, or the list's own default. */
export function readSort(
  params: Record<string, string | undefined>,
  allowed: readonly string[],
  fallback: Sort,
): Sort {
  const key = params.sort ?? "";
  const dir = params.dir === "desc" ? "desc" : params.dir === "asc" ? "asc" : null;

  if (!allowed.includes(key)) return fallback;
  return { key, dir: dir ?? "asc" };
}

/**
 * The address that sorts by one column.
 *
 * Paging is dropped on purpose: page four of the old order has nothing to do
 * with page four of the new one, so sorting always comes back to the top.
 */
export function sortHref(
  path: string,
  params: Record<string, string | undefined>,
  key: string,
  current: Sort,
): string {
  const search = new URLSearchParams();

  for (const [name, value] of Object.entries(params)) {
    if (!value || name === "sort" || name === "dir" || name === "page" || name === "saved")
      continue;
    search.set(name, String(value));
  }

  search.set("sort", key);
  search.set("dir", current.key === key && current.dir === "asc" ? "desc" : "asc");

  // A sorted list is never the bare list, so the marker that means "show
  // everything" has to survive, otherwise the remembered filters come back.
  if (!search.has("all")) search.set("all", "1");

  return `${path}?${search.toString()}`;
}
