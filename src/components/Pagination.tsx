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

export default function Pagination({
  basePath,
  params,
  info,
  labels,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  info: PageInfo;
  labels: { previous: string; next: string; showing: string; of: string };
}) {
  const pages = Math.max(1, Math.ceil(info.total / info.perPage));
  if (info.total === 0) return null;

  const href = (page: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") search.set(key, value);
    }
    if (page > 1) search.set("page", String(page));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
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
