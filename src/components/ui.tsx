import Link from "next/link";
import type { ReactNode } from "react";
import CountUp from "@/components/CountUp";

/**
 * The handful of shapes every screen is built from.
 *
 * They hold no colours of their own: each one reads the brand variables in
 * globals.css, which is why the night theme needs nothing changed here.
 */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-[1.35rem] font-semibold tracking-tight text-brand-ink">
          {title}
        </h1>
        {subtitle ? <p className="mt-0.5 text-sm text-brand-graphite/75">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
  flush = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Let a table reach the edges of the card instead of sitting in padding. */
  flush?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-brand-line px-4 py-2.5">
          <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-brand-graphite/80">
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "teal",
  href,
  count,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "teal" | "good" | "warn" | "bad";
  href?: string;
  /**
   * The number behind the text, when it should count up to itself. Leave it
   * out and the figure is simply drawn, which is right for anything that is
   * not a quantity.
   */
  count?: { amount: number; locale: string; money?: boolean };
}) {
  const body = (
    <>
      <div className="statlabel">{label}</div>
      <div className="statvalue">
        {count ? (
          <CountUp value={count.amount} text={value} locale={count.locale} money={count.money} />
        ) : (
          value
        )}
      </div>
      {hint ? <div className="stathint">{hint}</div> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        data-tone={tone}
        className="card statcard transition hover:border-brand-teal"
      >
        {body}
      </Link>
    );
  }

  return (
    <div data-tone={tone} className="card statcard">
      {body}
    </div>
  );
}

export function Empty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-brand-graphite/60">{message}</p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "teal";
}) {
  const tones: Record<string, string> = {
    neutral: "",
    good: "pill-good",
    warn: "pill-warn",
    bad: "pill-bad",
    teal: "pill-teal",
  };
  return <span className={`pill ${tones[tone]}`}>{children}</span>;
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-brand-graphite/75 hover:text-brand-ink"
    >
      <span aria-hidden="true">&larr;</span>
      {label}
    </Link>
  );
}

/** A button sized tile for the things people press first thing in the morning. */
export function Tile({ href, label, icon }: { href: string; label: string; icon?: ReactNode }) {
  return (
    <Link href={href} className="tile">
      {icon ? <span className="tile-mark">{icon}</span> : null}
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

/** One line of the attention strip: a count, what it is, and where to see it. */
export function Attention({
  href,
  label,
  count,
  tone = "neutral",
}: {
  href: string;
  label: string;
  count: number;
  tone?: "neutral" | "warn" | "bad";
}) {
  return (
    <Link href={href} className="attention" data-tone={tone}>
      <span className="min-w-0">
        <span className="attention-count">{count}</span>{" "}
        <span className="text-brand-graphite">{label}</span>
      </span>
      <span aria-hidden="true" className="text-brand-graphite/60">
        &rarr;
      </span>
    </Link>
  );
}
