"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CalendarItem } from "@/lib/calendar";

/*
 * The month itself, drawn like the calendar on a phone.
 *
 * On a wide screen each day shows what is on it, coloured by how it stands:
 * yellow still to happen, green done, red cancelled. On a phone the days are
 * too small for words, so each shows coloured dots, and pressing a day lists
 * it underneath. On both, the chosen day is listed in full under the month.
 *
 * It keeps itself up to date: every minute, and whenever the window is looked
 * at again, it asks the server for the page once more, so what somebody else
 * has just booked appears without anybody reloading.
 */

export type CalendarEntry = CalendarItem & { day: string; time: string };
export type CalendarDay = { key: string; number: number; inside: boolean; today: boolean; label: string };

type Labels = {
  appointment: string;
  followUp: string;
  nothing: string;
  more: string;
  late: string;
  with: string;
  nobody: string;
  kinds: Record<CalendarItem["whoKind"], string>;
  status: Record<CalendarItem["status"], string>;
};

const SHOWN_IN_A_DAY = 4;

export default function CalendarView({
  days,
  weekdays,
  entries,
  startOn,
  labels,
}: {
  days: CalendarDay[];
  weekdays: string[];
  entries: CalendarEntry[];
  startOn: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState(startOn);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  /* A different month or filter starts on its own first day. */
  useEffect(() => setChosen(startOn), [startOn]);

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const every = window.setInterval(again, 60_000);
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.clearInterval(every);
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [router]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const one of entries) {
      const list = map.get(one.day) ?? [];
      list.push(one);
      map.set(one.day, list);
    }
    return map;
  }, [entries]);

  const chosenDay = days.find((one) => one.key === chosen);
  const chosenEntries = byDay.get(chosen) ?? [];

  return (
    <div className="space-y-4" data-ready={ready ? "yes" : undefined}>
      <div className="card overflow-hidden" data-calendar>
        <div className="grid grid-cols-7 border-b border-brand-line bg-brand-surface">
          {weekdays.map((name) => (
            <div key={name} className="px-1 py-2 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-brand-graphite/70">
              {name}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const list = byDay.get(day.key) ?? [];
            const isChosen = day.key === chosen;
            return (
              <div
                key={day.key}
                role="button"
                tabIndex={0}
                onClick={() => setChosen(day.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setChosen(day.key);
                  }
                }}
                aria-label={day.label}
                aria-pressed={isChosen}
                data-day={day.key}
                data-count={list.length}
                className={`cal-day ${day.inside ? "" : "cal-outside"} ${isChosen ? "cal-chosen" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`cal-number ${day.today ? "cal-today" : ""}`}>{day.number}</span>
                  {list.length > 0 ? (
                    <span className="hidden text-[0.65rem] text-brand-graphite/60 sm:inline">{list.length}</span>
                  ) : null}
                </div>

                {/* A phone: dots only. */}
                <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                  {list.slice(0, 6).map((one) => (
                    <span key={one.id} className={`cal-dot cal-${one.status}`} />
                  ))}
                </div>

                {/* A wide screen: the lines themselves. */}
                <div className="mt-1 hidden space-y-0.5 sm:block">
                  {list.slice(0, SHOWN_IN_A_DAY).map((one) => (
                    <Link
                      key={one.id}
                      href={one.href}
                      prefetch={false}
                      onClick={(event) => event.stopPropagation()}
                      className={`cal-chip cal-${one.status}`}
                      title={`${one.time} ${one.kind === "appointment" ? labels.appointment : labels.followUp}: ${one.who}${one.what ? `, ${one.what}` : ""} (${labels.status[one.status]})`}
                      data-entry={one.kind}
                      data-status={one.status}
                    >
                      <span className="font-semibold">{one.time}</span>{" "}
                      <span aria-hidden="true">{one.kind === "appointment" ? "●" : "◆"}</span> {one.who}
                    </Link>
                  ))}
                  {list.length > SHOWN_IN_A_DAY ? (
                    <span className="block px-1 text-[0.68rem] text-brand-graphite/70">
                      +{list.length - SHOWN_IN_A_DAY} {labels.more}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The chosen day, in full. */}
      <div className="card p-4" data-calendar-day={chosen}>
        <h3 className="mb-3 text-sm font-semibold capitalize text-brand-ink">{chosenDay?.label ?? chosen}</h3>
        {chosenEntries.length === 0 ? (
          <p className="text-sm text-brand-graphite/60">{labels.nothing}</p>
        ) : (
          <ul className="space-y-2">
            {chosenEntries.map((one) => (
              <li key={one.id} className={`cal-line cal-${one.status}`} data-line={one.kind} data-status={one.status}>
                <div className="w-14 shrink-0 text-sm font-semibold">{one.time}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-wide opacity-80">
                      {one.kind === "appointment" ? labels.appointment : labels.followUp}
                    </span>
                    {one.whoHref ? (
                      <Link href={one.href} prefetch={false} className="font-semibold hover:underline">
                        {one.who}
                      </Link>
                    ) : (
                      <span className="font-semibold">{one.who}</span>
                    )}
                    <span className="text-xs opacity-75">{labels.kinds[one.whoKind]}</span>
                  </div>
                  {one.what ? <p className="text-sm">{one.what}</p> : null}
                  <p className="text-xs opacity-80">
                    {labels.with} {one.member ?? labels.nobody}
                  </p>
                </div>
                <span className="cal-status shrink-0">
                  {labels.status[one.status]}
                  {one.late ? `, ${labels.late}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
