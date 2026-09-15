import Link from "next/link";
import type { ReactNode } from "react";
import { IconLeads, IconSearch } from "@/components/icons";

/**
 * The two empty screens, which are not the same screen.
 *
 * A list with no records at all needs to teach: what lives here, and the one
 * button that starts it. A list whose filters matched nothing needs the
 * opposite: it must not invite somebody to create a record they already have,
 * it must offer to clear the filter. Showing the same box for both is the most
 * common way a table wastes somebody's time.
 */
export function NothingYet({
  title,
  note,
  action,
  icon,
}: {
  title: string;
  note: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="nothing">
      <span className="nothing-mark">{icon ?? <IconLeads size={20} />}</span>
      <h3>{title}</h3>
      <p>{note}</p>
      {action ? <div className="nothing-actions">{action}</div> : null}
    </div>
  );
}

export function NoMatch({
  title,
  note,
  clearHref,
  clearLabel,
  extra,
}: {
  title: string;
  note: string;
  clearHref: string;
  clearLabel: string;
  extra?: ReactNode;
}) {
  return (
    <div className="nothing">
      <span className="nothing-mark">
        <IconSearch size={19} />
      </span>
      <h3>{title}</h3>
      <p>{note}</p>
      <div className="nothing-actions">
        <Link href={clearHref} className="btn btn-primary !py-1 !text-xs">
          {clearLabel}
        </Link>
        {extra}
      </div>
    </div>
  );
}
