import type { ReactNode } from "react";

/**
 * Charts, drawn on the server.
 *
 * No library and no client JavaScript: a chart here is SVG the page already
 * carries, which means it prints, it works with the browser's own zoom, and it
 * cannot fail to load. Hovering a bar shows its exact figure through the SVG
 * title, the scale is written down the side, and the figures appear again beside
 * the bars or in the table under them, so nothing is readable only by colour.
 *
 * The two series colours were checked for colour blindness against the page
 * background rather than chosen by eye: teal and ochre keep a wide separation
 * under deuteranopia, protanopia and tritanopia, and both clear 3:1 contrast on
 * the surface.
 */

export const SERIES = {
  primary: "#0086A8",
  secondary: "#C4671F",
  third: "#6C5BAA",
  fourth: "#2E8B57",
  fifth: "#B8901E",
  /** A plain grey, for a reference line rather than a series of its own. */
  muted: "var(--chart-muted)",
} as const;

/**
 * Money on an axis, short enough to fit.
 *
 * Cents in, a few characters out: 12,345,600 reads as €123k rather than as a
 * number nobody can take in at a glance. The exact figure is always a hover
 * away, and it is written in full in the tables.
 */
export function shortMoney(cents: number): string {
  const euros = cents / 100;
  const sign = euros < 0 ? "-" : "";
  const value = Math.abs(euros);
  if (value >= 1_000_000) return `${sign}€${Math.round(value / 100_000) / 10}m`;
  if (value >= 1_000) return `${sign}€${Math.round(value / 1_000)}k`;
  return `${sign}€${Math.round(value)}`;
}

/**
 * The chrome of a chart reads from the theme rather than from a fixed grey, so
 * night gets a grid that sits one shade off its own surface instead of a set of
 * white lines.
 */
const AXIS = "var(--label-ink)";
const GRID = "var(--color-brand-line)";

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  for (const step of steps) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

export type Series = {
  label: string;
  colour: string;
  values: number[];
  /** How a value reads in a tooltip and on the axis. */
  format: (value: number) => string;
};

/**
 * Bars over time, one or two series side by side.
 *
 * One series needs no legend, because the card title already names it. Two get
 * a legend and a 2px gap between the pair, so the eye reads them as one month
 * rather than as four bars.
 */
export function BarSeries({
  labels,
  series,
  height = 180,
  /** A chart in a narrow card needs a narrower floor before it scrolls. */
  minWidth = 640,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  minWidth?: number;
}) {
  const width = 760;
  const padLeft = 56;
  const padRight = 12;
  const padTop = 10;
  const padBottom = 26;

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const slot = plotWidth / Math.max(labels.length, 1);
  const groupWidth = Math.min(slot * 0.7, 46);
  const barWidth = series.length > 1 ? (groupWidth - 2) / series.length : groupWidth;

  const y = (value: number) => padTop + plotHeight - (value / max) * plotHeight;

  /**
   * Three ticks: nothing, half, and the top. Quarters of a round number are
   * rarely round themselves, so they printed as €63k and €188k down the side,
   * and a count that tops out at two printed 1 twice.
   */
  const ticks: number[] = [];
  const seen = new Set<string>();
  for (const fraction of [0, 0.5, 1]) {
    const value = max * fraction;
    const label = series[0].format(value);
    if (seen.has(label)) continue;
    seen.add(label);
    ticks.push(value);
  }
  const everyOther = labels.length > 14;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={series.map((s) => s.label).join(" and ")}
        className="w-full"
        style={{ minWidth }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padLeft} x2={width - padRight} y1={y(tick)} y2={y(tick)} stroke={GRID} />
            <text
              x={padLeft - 8}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="10"
              fill={AXIS}
              fontFamily="inherit"
            >
              {series[0].format(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, index) => {
          const centre = padLeft + slot * index + slot / 2;
          return (
            <g key={label}>
              {series.map((s, seriesIndex) => {
                const value = s.values[index] ?? 0;
                const barHeight = Math.max(value > 0 ? 2 : 0, padTop + plotHeight - y(value));
                const x =
                  centre - groupWidth / 2 + seriesIndex * (barWidth + (series.length > 1 ? 2 : 0));
                return (
                  <rect
                    key={s.label}
                    className="bar"
                    x={x}
                    y={padTop + plotHeight - barHeight}
                    width={barWidth}
                    height={barHeight}
                    rx={barHeight > 6 ? 3 : 1}
                    fill={s.colour}
                    /*
                      Each month starts a beat after the one before it, so the
                      chart draws itself across rather than appearing whole. The
                      delay is capped, because the last bar of a long year should
                      not keep somebody waiting.
                    */
                    style={{ animationDelay: `${Math.min(index * 26, 420)}ms` }}
                  >
                    <title>{`${label} . ${s.label} . ${s.format(value)}`}</title>
                  </rect>
                );
              })}
              {everyOther && index % 2 === 1 ? null : (
                <text
                  x={centre}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fill={AXIS}
                  fontFamily="inherit"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}

        <line
          x1={padLeft}
          x2={width - padRight}
          y1={padTop + plotHeight}
          y2={padTop + plotHeight}
          stroke={AXIS}
        />
      </svg>

      {series.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-brand-graphite/70">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.colour }}
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type BreakdownRow = {
  label: string;
  value: number;
  display: string;
  note?: string;
  href?: string;
};

/**
 * A ranked list with a bar behind each figure.
 *
 * Magnitude down a list reads better than a pie: the order is the message, and
 * the label sits next to its own bar rather than in a legend.
 */
export function Breakdown({
  rows,
  colour = SERIES.primary,
  empty,
}: {
  rows: BreakdownRow[];
  colour?: string;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-brand-graphite/50">{empty}</p>;
  }

  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{row.label}</span>
            <span className="tabular-nums">
              {row.display}
              {row.note ? (
                <span className="ml-2 text-xs text-brand-graphite/60">{row.note}</span>
              ) : null}
            </span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-brand-line">
            <div
              className="meter-fill h-2 rounded-full"
              style={{
                width: `${Math.max(2, (row.value / max) * 100)}%`,
                background: colour,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A funnel, as steps that shrink.
 *
 * Each step carries its own share of the first one, because the drop between
 * two steps is the only thing anybody reads a funnel for.
 */
export function Funnel({
  steps,
  colour = SERIES.primary,
}: {
  steps: { label: string; value: number }[];
  colour?: string;
}) {
  const first = Math.max(steps[0]?.value ?? 0, 1);

  return (
    <ul className="space-y-2">
      {steps.map((step, index) => (
        <li key={step.label}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{step.label}</span>
            <span className="tabular-nums">
              {step.value}
              <span className="ml-2 text-xs text-brand-graphite/60">
                {Math.round((step.value / first) * 100)}%
              </span>
            </span>
          </div>
          <div className="mt-1 h-3 w-full rounded bg-brand-line">
            <div
              className="meter-fill h-3 rounded"
              style={{
                width: `${Math.max(2, (step.value / first) * 100)}%`,
                background: colour,
                animationDelay: `${index * 90}ms`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A figure with its own line of explanation, for the top of a report. */
export function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  const colour =
    tone === "good"
      ? "text-[color:var(--color-positive)]"
      : tone === "warn"
        ? "text-[color:var(--color-warning)]"
        : tone === "bad"
          ? "text-[color:var(--color-negative)]"
          : "text-brand-ink";

  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-brand-graphite/70">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-brand-graphite/60">{hint}</div> : null}
    </div>
  );
}

export type Segment = { label: string; value: number; colour: string; display?: string };

/**
 * One bar, split into its parts.
 *
 * Part of a whole at a glance, which is the only thing a pie was ever good for,
 * without the pie: the segments sit in a fixed order, a 2px gap of the page
 * behind them keeps two neighbours apart without an outline, and the legend
 * under it names every part with its own figure, so nothing is carried by the
 * colour alone. A part too narrow for its own label keeps it in the legend.
 */
export function StackedBar({
  segments,
  empty,
  height = 26,
}: {
  segments: Segment[];
  empty: string;
  height?: number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total <= 0) {
    return <p className="py-6 text-center text-sm text-brand-graphite/50">{empty}</p>;
  }

  const shown = segments.filter((segment) => segment.value > 0);

  return (
    <div>
      <div className="flex w-full gap-[2px]" style={{ height }}>
        {shown.map((segment, index) => {
          const share = (segment.value / total) * 100;
          const first = index === 0;
          const last = index === shown.length - 1;
          return (
            <div
              key={segment.label}
              title={`${segment.label}: ${segment.display ?? segment.value}`}
              className="stacked-part flex items-center justify-center overflow-hidden text-[11px] font-semibold"
              style={{
                animationDelay: `${index * 70}ms`,
                width: `${share}%`,
                background: segment.colour,
                color: "#ffffff",
                borderRadius: `${first ? "4px" : "0"} ${last ? "4px" : "0"} ${
                  last ? "4px" : "0"
                } ${first ? "4px" : "0"}`,
              }}
            >
              {share >= 12 ? segment.value : ""}
            </div>
          );
        })}
      </div>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-baseline gap-2 text-sm">
            <span
              aria-hidden="true"
              className="mt-1 inline-block size-2.5 shrink-0 rounded-sm"
              style={{ background: segment.colour }}
            />
            <span className="min-w-0 flex-1 truncate text-brand-graphite">{segment.label}</span>
            <span className="tabular-nums font-medium">{segment.display ?? segment.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-brand-graphite/60">
              {Math.round((segment.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How far along one number is towards another.
 *
 * Two figures and the share between them, which is how the office talks about
 * money collected against money owed. The colour carries the state, and the
 * words carry it as well, so the bar is never the only thing saying it.
 */
export function Meter({
  label,
  value,
  total,
  display,
  totalDisplay,
  tone = "teal",
}: {
  label: string;
  value: number;
  total: number;
  display: string;
  totalDisplay: string;
  tone?: "teal" | "good" | "warn" | "bad";
}) {
  const share = total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  const colour =
    tone === "good"
      ? "var(--color-positive)"
      : tone === "warn"
        ? "var(--color-warning)"
        : tone === "bad"
          ? "var(--color-negative)"
          : SERIES.primary;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="statlabel">{label}</span>
        <span className="text-sm">
          <span className="font-semibold tabular-nums">{display}</span>
          <span className="text-brand-graphite/60"> / {totalDisplay}</span>
          <span className="ml-2 font-semibold tabular-nums" style={{ color: colour }}>
            {Math.round(share)}%
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full rounded-full" style={{ background: "var(--pill-bg)" }}>
        <div
          className="meter-fill h-2.5 rounded-full"
          style={{ width: `${Math.max(1.5, share)}%`, background: colour }}
        />
      </div>
    </div>
  );
}
