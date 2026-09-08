import Link from "next/link";

/**
 * A plain GET form, so a search is a normal address that can be bookmarked,
 * shared or reloaded. No client side state to go stale.
 */
export default function SearchBox({
  action,
  query,
  placeholder,
  searchLabel,
  clearLabel,
  children,
}: {
  action: string;
  query: string;
  placeholder: string;
  searchLabel: string;
  clearLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={action} method="get">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">
            {searchLabel}
          </label>
          <input id="q" name="q" defaultValue={query} placeholder={placeholder} className="input" />
        </div>
        {children}
        <button type="submit" className="btn btn-primary">
          {searchLabel}
        </button>
        {query ? (
          <Link href={action} className="btn btn-secondary">
            {clearLabel}
          </Link>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-brand-graphite/60">
        Type and press Enter, or use the Search button.
      </p>
    </form>
  );
}
