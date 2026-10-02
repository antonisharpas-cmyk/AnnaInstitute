"use client";

import { useMemo, useState } from "react";
import type { HistoryEvent, HistoryKind } from "@/lib/clientHistory";

/**
 * The client's whole story, newest first, grouped by day.
 *
 * Each line is a title, a short note when there is one, the time and the
 * status. The chips at the top narrow it to one kind of thing, the emails or
 * the money, say, without losing the order.
 */
const KINDS: HistoryKind[] = ["lead", "client", "apartment", "contract", "appointment", "followUp", "payment", "paper", "email", "document"];

const DOT: Record<HistoryKind, string> = {
  lead: "#86888b",
  client: "#3d8397",
  apartment: "#4da1b9",
  contract: "#3d8397",
  appointment: "#b7791f",
  followUp: "#d08a2c",
  payment: "#2f8f5b",
  paper: "#4da1b9",
  email: "#6b5bb5",
  document: "#86888b",
};

const TONE: Record<string, string> = {
  good: "pill pill-good",
  warn: "pill pill-warn",
  bad: "pill pill-bad",
  teal: "pill pill-teal",
  neutral: "pill",
};

export default function ClientHistory({
  events,
  locale,
  labels,
}: {
  events: HistoryEvent[];
  locale: string;
  labels: { title: string; all: string; none: string; kinds: Record<HistoryKind, string>; open: string; by: string };
}) {
  const [only, setOnly] = useState<HistoryKind | "">("");
  const tag = locale === "el" ? "el-GR" : "en-GB";

  const shown = useMemo(() => (only ? events.filter((one) => one.kind === only) : events), [events, only]);
  const present = useMemo(() => new Set(events.map((one) => one.kind)), [events]);

  const days: { day: string; rows: HistoryEvent[] }[] = [];
  for (const event of shown) {
    const day = new Date(event.at).toLocaleDateString(tag, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
    const last = days[days.length - 1];
    if (last && last.day === day) last.rows.push(event);
    else days.push({ day, rows: [event] });
  }

  return (
    <div className="card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-graphite">{labels.title}</h2>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setOnly("")}
          className={only === "" ? "btn btn-primary !px-3 !py-1 !text-xs" : "btn btn-secondary !px-3 !py-1 !text-xs"}
        >
          {labels.all} ({events.length})
        </button>
        {KINDS.filter((kind) => present.has(kind)).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setOnly(kind)}
            className={only === kind ? "btn btn-primary !px-3 !py-1 !text-xs" : "btn btn-secondary !px-3 !py-1 !text-xs"}
          >
            {labels.kinds[kind]} ({events.filter((one) => one.kind === kind).length})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-brand-graphite/60">{labels.none}</p>
      ) : (
        <div className="space-y-5">
          {days.map(({ day, rows }) => (
            <section key={day}>
              <h3 className="mb-2 text-xs font-semibold text-brand-graphite/60">{day}</h3>
              <ol className="relative space-y-3 border-l border-brand-line pl-5">
                {rows.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white"
                      style={{ background: DOT[event.kind] }}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold">{event.title}</span>
                        <span className="ml-2 text-xs text-brand-graphite/55">{labels.kinds[event.kind]}</span>
                      </div>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {event.status ? <span className={TONE[event.status.tone] ?? "pill"}>{event.status.label}</span> : null}
                        <span className="text-xs text-brand-graphite/60">
                          {new Date(event.at).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </span>
                      </div>
                    </div>
                    {event.note ? <p className="mt-0.5 max-w-prose text-xs text-brand-graphite/70">{event.note}</p> : null}
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs">
                      {event.by ? <span className="text-brand-graphite/45">{labels.by} {event.by}</span> : null}
                      {event.href ? (
                        <a href={event.href} className="text-brand-teal-dark hover:underline" target={event.href.startsWith("/api/") ? "_blank" : undefined} rel="noreferrer">
                          {labels.open}
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
