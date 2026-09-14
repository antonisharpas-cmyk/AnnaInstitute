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
  muted: "#c9d2d8",
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

const AXIS = "#8a949c";
const GRID = "#e8ecef";

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
}: {
  labels: string[];
  series: Series[];
  height?: number;
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

  // Enough ticks to read the scale, never so many that they crowd the plot.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => max * fraction);
  const everyOther = labels.length > 14;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={series.map((s) => s.label).join(" and ")}
        className="min-w-[640px] w-full"
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
                    x={x}
                    y={padTop + plotHeight - barHeight}
                    width={barWidth}
                    height={barHeight}
                    rx={barHeight > 6 ? 3 : 1}
                    fill={s.colour}
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
              className="h-2 rounded-full"
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
      {steps.map((step) => (
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
              className="h-3 rounded"
              style={{
                width: `${Math.max(2, (step.value / first) * 100)}%`,
                background: colour,
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
