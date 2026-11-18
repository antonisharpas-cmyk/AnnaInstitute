import Link from "next/link";

export type PageInfo = {
  page: number;
  perPage: number;
  total: number;
};

export function paginate(searchParams: Record<string, string | undefined>, perPage = 10) {
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  return { page, perPage, offset: (page - 1) * perPage };
}

/**
 * One page of a list already in hand, for a list that is never long enough to
 * be worth a second query: a person's notes, a partner directory. The page is
 * kept inside the list, so a page number left in the address after a delete
 * still shows the last page rather than an empty one.
 */
export function pageOf<T>(rows: T[], searchParams: Record<string, string | undefined>, perPage: number, pageKey = "page") {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const page = Math.min(pages, Math.max(1, Number(searchParams[pageKey] ?? 1) || 1));
  return { rows: rows.slice((page - 1) * perPage, page * perPage), info: { page, perPage, total: rows.length } };
}

/** The four words under every list, from the translator. */
export const pageWords = (t: (key: "common.previous" | "common.next" | "common.showing" | "common.of") => string) => ({
  previous: t("common.previous"),
  next: t("common.next"),
  showing: t("common.showing"),
  of: t("common.of"),
});

export default function Pagination({
  basePath,
  params,
  info,
  labels,
  pageKey = "page",
  anchor,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  info: PageInfo;
  labels: { previous: string; next: string; showing: string; of: string };
  /** The name of the page in the address, for a page with more than one list on it. */
  pageKey?: string;
  /** Where the page lands after turning, so a list lower down stays in view. */
  anchor?: string;
}) {
  const pages = Math.max(1, Math.ceil(info.total / info.perPage));
  if (info.total === 0) return null;

  const href = (page: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== pageKey) search.set(key, value);
    }
    if (page > 1) search.set(pageKey, String(page));
    const query = search.toString();
    return `${query ? `${basePath}?${query}` : basePath}${anchor ? `#${anchor}` : ""}`;
  };

  const first = (info.page - 1) * info.perPage + 1;
  const last = Math.min(info.page * info.perPage, info.total);

  // With many pages, show the ends and a window around the current one.
  const numbers: (number | "gap")[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - info.page) <= 1) numbers.push(n);
    else if (numbers[numbers.length - 1] !== "gap") numbers.push("gap");
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-brand-line pt-3 text-sm">
      <span className="text-brand-graphite/70">
        {labels.showing} {first} to {last} {labels.of} {info.total}
      </span>

      <div className="flex items-center gap-1">
        {info.page > 1 ? (
          <Link href={href(info.page - 1)} className="btn btn-secondary !px-3 !py-1 !text-xs">
            {labels.previous}
          </Link>
        ) : null}

        {numbers.map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-brand-graphite/50">
              ...
            </span>
          ) : n === info.page ? (
            <span
              key={n}
              className="rounded-full bg-brand-teal px-3 py-1 text-xs font-semibold text-white"
            >
              {n}
            </span>
          ) : (
            <Link
              key={n}
              href={href(n)}
              className="rounded-full px-3 py-1 text-xs font-semibold text-brand-graphite hover:bg-brand-teal-soft"
            >
              {n}
            </Link>
          ),
        )}

        {info.page < pages ? (
          <Link href={href(info.page + 1)} className="btn btn-secondary !px-3 !py-1 !text-xs">
            {labels.next}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
