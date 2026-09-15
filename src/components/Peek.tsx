import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrow, IconClose, IconDown, IconUp } from "@/components/icons";
import PeekKeys from "@/components/PeekKeys";

export type PeekLabels = {
  close: string;
  previous: string;
  next: string;
  open: string;
  position: string;
};

/**
 * A record read beside its list, rather than instead of it.
 *
 * Opening a record used to mean leaving the list, losing the filters and the
 * scroll, reading two lines, and coming back. Here the record arrives in a
 * panel next to the table, the row it belongs to stays lit, and the header says
 * where it sits in the filtered set. Previous and next walk that set, so
 * checking twenty enquiries is twenty keystrokes rather than forty page loads.
 *
 * It is an ordinary part of the address, so the panel survives a reload and can
 * be sent to somebody else as a link.
 */
export default function Peek({
  title,
  subtitle,
  at,
  of,
  previousHref,
  nextHref,
  closeHref,
  openHref,
  labels,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  at: number;
  of: number;
  previousHref: string | null;
  nextHref: string | null;
  closeHref: string;
  openHref: string;
  labels: PeekLabels;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <aside className="peek no-print" aria-label={title}>
      <PeekKeys previousHref={previousHref} nextHref={nextHref} closeHref={closeHref} />

      <header className="peekhead">
        {/*
          Closing, and walking to the record before or after, are the same page
          with a different query string. They are plain links on purpose: it is
          the one kind of move the app router sometimes fetches and then fails
          to show, and a dead arrow key in a list is unforgivable.
        */}
        <a href={closeHref} className="iconbtn" aria-label={labels.close} title={labels.close}>
          <IconClose size={16} />
        </a>

        <span className="peekwhere">
          {at} {labels.position} {of}
        </span>

        <span className="ml-auto flex items-center gap-1">
          {previousHref ? (
            <a
              href={previousHref}
              className="iconbtn"
              aria-label={labels.previous}
              title={`${labels.previous} (k)`}
            >
              <IconUp size={16} />
            </a>
          ) : (
            <span className="iconbtn opacity-30">
              <IconUp size={16} />
            </span>
          )}
          {nextHref ? (
            <a
              href={nextHref}
              className="iconbtn"
              aria-label={labels.next}
              title={`${labels.next} (j)`}
            >
              <IconDown size={16} />
            </a>
          ) : (
            <span className="iconbtn opacity-30">
              <IconDown size={16} />
            </span>
          )}
          <Link
            href={openHref}
            className="btn btn-secondary !px-2 !py-1 !text-xs"
            title={labels.open}
          >
            {labels.open}
            <IconArrow size={13} />
          </Link>
        </span>
      </header>

      <div className="peekbody">
        <h2 className="text-base font-semibold text-brand-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-brand-graphite/70">{subtitle}</p> : null}

        <dl className="mt-3">{children}</dl>

        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </aside>
  );
}

/** One line of the panel: what it is, and what it says. */
export function PeekLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="peekrow">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
