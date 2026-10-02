import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { whoCanGo } from "@/lib/team";
import { calendarItems, calendarProjects } from "@/lib/calendar";
import { PageHeader } from "@/components/ui";
import DateField from "@/components/DateField";
import CalendarView, { type CalendarDay, type CalendarEntry } from "./CalendarView";

/**
 * The calendar: every appointment and follow up, on its day, like the
 * calendar on a phone.
 *
 * It opens on this month. The arrows go a month back or on, and From and To
 * show any stretch of days instead. Whose they are and which development they
 * are about narrow it, and every choice is in the address, so a link opens
 * on the same view.
 */
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayFrom = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const one = new Date(y, m - 1, d);
  return Number.isNaN(one.getTime()) ? null : one;
};
const plus = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string; member?: string; project?: string; show?: string }>;
}) {
  const params = await searchParams;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();
  const tag = locale === "el" ? "el-GR" : "en-GB";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /* The days: two typed days, or a month, this one unless another is asked for. */
  let from = dayFrom(params.from);
  let until = dayFrom(params.to);
  const custom = Boolean(from && until);
  let month = new Date(today.getFullYear(), today.getMonth(), 1);
  if (!custom) {
    const asked = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month!.split("-").map(Number) : null;
    if (asked && asked[1] >= 1 && asked[1] <= 12) month = new Date(asked[0], asked[1] - 1, 1);
    from = month;
    until = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  } else if (from! > until!) {
    [from, until] = [until, from];
  }
  const start = from!;
  const end = plus(until!, 1); // the day after the last, not included

  const member = params.member ?? "";
  const project = params.project ?? "";
  const show = params.show === "appointments" || params.show === "followUps" ? params.show : "";

  const [items, team, projects] = await Promise.all([
    calendarItems({ from: start, to: end, member: member || undefined, project: project || undefined }),
    whoCanGo(),
    calendarProjects(),
  ]);

  /* Every entry with its day and time as the office's clock reads them. */
  const entries: CalendarEntry[] = items
    .filter((one) => !show || (show === "appointments" ? one.kind === "appointment" : one.kind === "followUp"))
    .map((one) => {
      const at = new Date(one.at);
      return { ...one, day: key(at), time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
    });

  /* Whole weeks, Monday first, from the week the period starts in to the week it ends in. */
  const gridStart = plus(start, -((start.getDay() + 6) % 7));
  const last = until!;
  const gridEnd = plus(last, 6 - ((last.getDay() + 6) % 7));
  const days: CalendarDay[] = [];
  for (let d = gridStart; d <= gridEnd; d = plus(d, 1)) {
    days.push({
      key: key(d),
      number: d.getDate(),
      inside: d >= start && d < end,
      today: key(d) === key(today),
      label: d.toLocaleDateString(tag, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    });
  }
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    plus(gridStart, i).toLocaleDateString(tag, { weekday: "short" }),
  );

  /* The links that keep every other choice. */
  const link = (extra: Record<string, string>) => {
    const search = new URLSearchParams();
    if (member) search.set("member", member);
    if (project) search.set("project", project);
    if (show) search.set("show", show);
    for (const [name, value] of Object.entries(extra)) if (value) search.set(name, value);
    const query = search.toString();
    return query ? `/calendar?${query}` : "/calendar";
  };
  const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const shownMonth = custom ? null : month;
  const title = custom
    ? `${start.toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" })} . ${last.toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" })}`
    : month.toLocaleDateString(tag, { month: "long", year: "numeric" });

  const counts = {
    pending: entries.filter((one) => one.status === "pending").length,
    done: entries.filter((one) => one.status === "done").length,
    cancelled: entries.filter((one) => one.status === "cancelled").length,
  };

  return (
    <>
      <PageHeader title={t("calendar.title")} subtitle={t("calendar.subtitle")} />

      {/* The filters. A plain form, so every choice is an address. */}
      <form
        action="/calendar"
        method="get"
        className="card mb-4 flex flex-wrap items-end gap-3 p-3"
        data-calendar-filters
      >
        <div>
          <label className="label" htmlFor="calendarMember">
            {t("appointments.assignedTo")}
          </label>
          <select id="calendarMember" name="member" defaultValue={member} className="select !w-52">
            <option value="">{t("common.all")}</option>
            <option value="nobody">{t("appointments.nobody")}</option>
            {team.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="calendarProject">
            {t("calendar.project")}
          </label>
          <select id="calendarProject" name="project" defaultValue={project} className="select !w-52">
            <option value="">{t("common.all")}</option>
            {projects.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="calendarShow">
            {t("calendar.show")}
          </label>
          <select id="calendarShow" name="show" defaultValue={show} className="select !w-64">
            <option value="">{t("calendar.showBoth")}</option>
            <option value="appointments">{t("nav.appointments")}</option>
            <option value="followUps">{t("nav.followUps")}</option>
          </select>
        </div>
        {shownMonth ? <input type="hidden" name="month" value={monthKey(shownMonth)} /> : null}
        <div>
          <label className="label" htmlFor="calendarFrom">
            {t("calendar.from")}
          </label>
          <DateField id="calendarFrom" name="from" defaultValue={custom ? key(start) : ""} />
        </div>
        <div>
          <label className="label" htmlFor="calendarTo">
            {t("calendar.to")}
          </label>
          <DateField id="calendarTo" name="to" defaultValue={custom ? key(last) : ""} />
        </div>
        <button type="submit" className="btn btn-primary">
          {t("common.search")}
        </button>
        <a href={link({})} className="btn btn-secondary">
          {t("calendar.thisMonth")}
        </a>
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {shownMonth ? (
            <a
              href={link({ month: monthKey(new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1)) })}
              className="btn btn-secondary !px-3 !py-1"
              aria-label={t("calendar.previous")}
              data-calendar-previous
            >
              &#8249;
            </a>
          ) : null}
          <h2 className="min-w-44 text-center text-lg font-semibold capitalize text-brand-ink" data-calendar-title>
            {title}
          </h2>
          {shownMonth ? (
            <a
              href={link({ month: monthKey(new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1)) })}
              className="btn btn-secondary !px-3 !py-1"
              aria-label={t("calendar.next")}
              data-calendar-next
            >
              &#8250;
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="cal-key cal-pending">
            {t("leads.followUpPending")} {counts.pending}
          </span>
          <span className="cal-key cal-done">
            {t("leads.followUpDone")} {counts.done}
          </span>
          <span className="cal-key cal-cancelled">
            {t("appointments.cancelled")} {counts.cancelled}
          </span>
        </div>
      </div>

      <CalendarView
        days={days}
        weekdays={weekdays}
        entries={entries}
        startOn={days.find((one) => one.today && one.inside)?.key ?? key(start)}
        labels={{
          appointment: t("calendar.appointment"),
          followUp: t("calendar.followUp"),
          nothing: t("calendar.nothing"),
          more: t("calendar.more"),
          late: t("followUps.late"),
          with: t("calendar.with"),
          nobody: t("appointments.nobody"),
          kinds: {
            client: t("followUps.kind.client"),
            lead: t("followUps.kind.lead"),
            agent: t("followUps.kind.agent"),
            other: t("followUps.kind.other"),
          },
          status: {
            pending: t("leads.followUpPending"),
            done: t("leads.followUpDone"),
            cancelled: t("appointments.cancelled"),
          },
        }}
      />
    </>
  );
}
