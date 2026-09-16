import type { Sort } from "@/lib/sorting";

/**
 * A column heading that sorts the list.
 *
 * The whole heading is the target rather than a small arrow beside it, and the
 * arrow only appears on the column actually being sorted by, so a table with
 * nine sortable columns does not look like a cockpit. A plain link, because
 * these go to the same page with different search parameters, which is the one
 * navigation the router drops now and then.
 */
export default function SortTh({
  label,
  by,
  current,
  href,
  className,
}: {
  label: string;
  /** The key this column sorts by. */
  by: string;
  current: Sort;
  href: string;
  className?: string;
}) {
  const on = current.key === by;

  return (
    <th
      className={className}
      aria-sort={on ? (current.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <a href={href} className="sorter" data-sort={by} data-on={on ? "true" : "false"}>
        {label}
        <span className="sortmark" aria-hidden="true">
          {on ? (current.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </a>
    </th>
  );
}
