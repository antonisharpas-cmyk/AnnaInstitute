import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { asc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, toCents } from "@/lib/money";
import { recentActivity } from "@/lib/activity";
import { upcomingBirthdays } from "@/lib/automaticEmails";
import { attention, attentionTotal, type AttentionGroup } from "@/lib/attention";
import { MONEY_COLUMNS, MONTHLY_COLUMNS, monthlyRows, monthlyTotal, type MonthlyRow } from "@/lib/monthly";
import { recentMoney, type MoneyKind, type MoneyLine } from "@/lib/recentMoney";
import {
  leadFunnel,
  rangeFrom,
  projectsInScope,
  scopeChoices,
  scopeFrom,
} from "@/lib/reports";
import {
  PANEL_NOTE,
  PANEL_TITLE,
  WIDTHS,
  WIDTH_LABEL,
  widthClass,
  readLayout,
  type PanelKey,
} from "@/lib/dashboard";
import { Funnel, SERIES } from "@/components/charts";
import { IconPlus } from "@/components/icons";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import DashboardArrange from "@/components/DashboardArrange";
import PanelMenu from "@/components/PanelMenu";
import Pick from "@/components/Pick";
import {
  hidePanel,
  movePanel,
  resetDashboard,
  saveDashboard,
  setPanelWidth,
  showPanel,
} from "./layoutActions";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

/** The first of the current month, which is where the month figures start. */
function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** "2 hours ago", in the language the person chose. */
function ago(at: Date, locale: string): string {
  const seconds = Math.round((Date.now() - new Date(at).getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale === "el" ? "el" : "en", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
  ];

  let amount = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(amount) < size) return format.format(-Math.round(amount), unit);
    amount = amount / size;
  }
  return format.format(-Math.round(amount), "year");
}

/** Only the panels on show are worth a query. */
const when = <T,>(needed: boolean, run: () => Promise<T>, fallback: T): Promise<T> =>
  needed ? run() : Promise.resolve(fallback);

/** Whole euros, for a table with many money columns side by side. */
const euros = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

/** The five places an apartment can be, in the order it goes through them. */
const STATUSES = ["AVAILABLE", "NEGOTIATION", "RESERVED", "SOLD", "DELIVERED"] as const;

/** How each kind of payment is named, and which way the money went. */
const MONEY_WORD: Record<MoneyKind, MessageKey> = {
  buyer: "dash.money.buyer",
  cash: "dash.money.cash",
  agent: "dash.money.agent",
  income: "dash.money.income",
  expense: "dash.money.expense",
  constructor: "dash.money.constructor",
};

/** Flags that say which kind of paper it is rather than what is wrong. */
const NEUTRAL_FLAGS: MessageKey[] = ["att.flag.weCharge", "att.flag.wePay", "att.flag.sale", "att.flag.reservation"];

/** The rows of each kind the table shows; the rest are a click away. */
const PER_KIND = 5;

/**
 * The screen people leave open all day, in the order they put it.
 *
 * The page is a list of panels rather than a fixed layout: what is on it, how
 * wide each piece is and which order they come in is stored against the person
 * signed in, and the Arrange button opens the list that changes it. A panel
 * that is put away costs nothing, because the queries behind it are only run
 * when it is on show.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; partner?: string; holder?: string; years?: string | string[]; months?: string | string[] }>;
}) {
  const params = await searchParams;
  const user = await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();
  const now = new Date();
  const monthStart = startOfMonth();

  const layout = await readLayout(user.id);
  const on = new Set(layout.filter((panel) => panel.shown).map((panel) => panel.key));
  const putAway = layout.filter((panel) => !panel.shown);
  const onShow = layout.filter((panel) => panel.shown);

  // The charts all read the same twelve months, so the page tells one story.
  const { range: year } = rangeFrom({ period: "12m" });

  /*
   * Whose money, and which building.
   *
   * The same narrowing the reports have, in the same words, because somebody
   * who has just looked at one partnership on a report and then opens the
   * dashboard should not be handed the whole book without noticing. Nothing
   * chosen is everything, which is how the page has always opened.
   */
  const scope = scopeFrom(params);
  const [only, choices] = await Promise.all([projectsInScope(scope), scopeChoices()]);
  const mine = only === null ? [""] : only.length > 0 ? only : [""];
  const inScope = (column: SQL | typeof units.projectId) =>
    only === null ? undefined : (sql`${column} in ${mine}` as SQL);
  /* A contract in scope, read from the contract id so the query needs no join. */
  const contractInScope = (alias: string) =>
    only === null
      ? sql`true`
      : sql`${sql.raw(alias)}.contract_id in (
          select c.id from contracts c join units u on u.id = c.unit_id where u.project_id in ${mine}
        )`;

  /* The years and months ticked for the monthly table; nothing ticked is everything. */
  const listOf = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value : value ? [value] : [])
      .flatMap((one) => one.split(","))
      .filter(Boolean)
      .map(Number)
      .filter((one) => Number.isInteger(one));
  const askedYears = listOf(params.years);
  const askedMonths = listOf(params.months);

  const [
    moneyRows,
    groups,
    matrixRows,
    allMonths,
    recent,
    activity,
    funnel,
  ] = await Promise.all([
    /*
     * The money figures.
     *
     * Collected is every payment from buyers, VAT included, cash apart: the
     * cash part of a price has no VAT, no invoice and no receipt, so it is its
     * own figure. Still to come is read on the contracts that stand only, so a
     * cancelled reservation no longer counts as money the office is owed.
     */
    when(
      on.has("figures"),
      async () => {
        const result = await db.execute(sql`
          select
              coalesce((
              select sum(p.amount) from payments p where p.kind = 'PAYMENT' and ${contractInScope("p")}
            ), 0) as collected,
              coalesce((
              select sum(p.amount) from payments p
              where p.kind = 'PAYMENT' and p.paid_on >= ${monthStart} and ${contractInScope("p")}
            ), 0) as month,
              (
              select count(*)::int from payments p
              where p.kind = 'PAYMENT' and p.paid_on >= ${monthStart} and ${contractInScope("p")}
            ) as monthCount,
              coalesce((
              select sum(i.total_amount) from installments i
              join contracts c on c.id = i.contract_id
              where c.status <> 'CANCELLED' and ${contractInScope("i")}
            ), 0) as scheduledStanding,
              coalesce((
              select sum(p.amount) from payments p
              join contracts c on c.id = p.contract_id
              where c.status <> 'CANCELLED' and ${contractInScope("p")}
            ), 0) as paidStanding,
              coalesce((
              select sum(r.amount) from cash_receipts r where ${contractInScope("r")}
            ), 0) as cashIn,
              coalesce((
              select sum(c.cash_amount) from contracts c
              where c.status <> 'CANCELLED' and c.kind = 'SALE'
              ${only === null ? sql`` : sql`and c.unit_id in (select u.id from units u where u.project_id in ${mine})`}
            ), 0) as cashAgreed,
              coalesce((
              select sum(r.amount) from cash_receipts r
              join contracts c on c.id = r.contract_id
              where c.status <> 'CANCELLED' and c.kind = 'SALE' and ${contractInScope("r")}
            ), 0) as cashInStanding`);
        const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Record<string, string | number>[];
        return rows.map((row) => ({
          collected: String(row.collected ?? "0"),
          month: String(row.month ?? "0"),
          monthCount: Number(row.monthcount ?? row.monthCount ?? 0),
          scheduledStanding: String(row.scheduledstanding ?? row.scheduledStanding ?? "0"),
          paidStanding: String(row.paidstanding ?? row.paidStanding ?? "0"),
          cashIn: String(row.cashin ?? row.cashIn ?? "0"),
          cashAgreed: String(row.cashagreed ?? row.cashAgreed ?? "0"),
          cashInStanding: String(row.cashinstanding ?? row.cashInStanding ?? "0"),
        }));
      },
      [],
    ),
    /* What needs somebody: the same list as the bell, worked out once a page. */
    when(on.has("attention") || on.has("figures"), () => attention(), [] as AttentionGroup[]),
    /* Every apartment, by development and by where it stands. */
    when(
      on.has("matrix"),
      () =>
        db
          .select({
            projectId: projects.id,
            name: projects.name,
            status: units.status,
            total: sql<number>`count(*)::int`,
          })
          .from(units)
          .innerJoin(projects, eq(projects.id, units.projectId))
          .where(inScope(units.projectId))
          .groupBy(projects.id, projects.name, units.status)
          .orderBy(asc(projects.name)),
      [],
    ),
    when(on.has("monthly"), () => monthlyRows(only), [] as MonthlyRow[]),
    when(on.has("payments"), () => recentMoney(12, only), [] as MoneyLine[]),
    when(on.has("activity"), () => recentActivity(10), []),
    when(on.has("funnel"), () => leadFunnel(year), {
      arrived: 0,
      answered: 0,
      qualified: 0,
      converted: 0,
      bought: 0,
    }),
  ]);

  const money = moneyRows[0];
  const collected = toCents(money?.collected ?? "0");
  const thisMonth = toCents(money?.month ?? "0");
  const stillToCome = Math.max(0, toCents(money?.scheduledStanding ?? "0") - toCents(money?.paidStanding ?? "0"));
  const cashIn = toCents(money?.cashIn ?? "0");
  const cashToCome = Math.max(0, toCents(money?.cashAgreed ?? "0") - toCents(money?.cashInStanding ?? "0"));
  const late = groups.find((group) => group.kind === "late")?.count ?? 0;
  const waiting = groups.filter((group) => group.count > 0);
  const waitingTotal = attentionTotal(groups);

  /* The matrix: developments down, statuses across, totals on the right and at the bottom. */
  const matrixProjects = [...new Map(matrixRows.map((row) => [row.projectId, row.name])).entries()].map(
    ([id, name]) => ({ id, name }),
  );
  const cell = (projectId: string, status: string) =>
    matrixRows.find((row) => row.projectId === projectId && row.status === status)?.total ?? 0;
  const rowTotal = (status: string) =>
    matrixRows.filter((row) => row.status === status).reduce((sum, row) => sum + row.total, 0);
  const columnTotal = (projectId: string) =>
    matrixRows.filter((row) => row.projectId === projectId).reduce((sum, row) => sum + row.total, 0);
  const grandTotal = matrixRows.reduce((sum, row) => sum + row.total, 0);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? t("dash.morning") : hour < 18 ? t("dash.afternoon") : t("dash.evening");
  const today = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  /* The week's birthdays, read only when the panel is on show. */
  const birthdays = on.has("birthdays") ? await upcomingBirthdays(7) : [];
  const dayShort = (value: Date) => value.toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
  const dateTag = locale === "el" ? "el-GR" : "en-GB";
  const monthName = (month: number) =>
    new Date(2000, month - 1, 1).toLocaleDateString(dateTag, { month: "long" });
  const monthAndYear = (row: MonthlyRow) =>
    new Date(row.year, row.month - 1, 1).toLocaleDateString(dateTag, { month: "long", year: "numeric" });

  /*
   * The monthly table's filters offer only what has data: the years with a
   * month in them, and the months of the years chosen. A year or month asked
   * for in the address that has nothing is dropped rather than shown empty.
   */
  const yearChoices = [...new Set(allMonths.map((row) => row.year))].sort((a, b) => b - a);
  const pickedYears = askedYears.filter((one) => yearChoices.includes(one));
  const inYears = allMonths.filter((row) => pickedYears.length === 0 || pickedYears.includes(row.year));
  const monthChoices = [...new Set(inYears.map((row) => row.month))].sort((a, b) => a - b);
  const pickedMonths = askedMonths.filter((one) => monthChoices.includes(one));
  const shownMonths = inYears.filter((row) => pickedMonths.length === 0 || pickedMonths.includes(row.month));
  const monthsTotal = monthlyTotal(shownMonths);

  const seeAll = (href: string) => (
    <Link href={href} className="text-xs font-semibold text-brand-teal-dark">
      {t("dash.seeAll")}
    </Link>
  );

  /* The figures sit beside the alerts in a third of the row, one card under the other. */
  const figuresWidth = layout.find((panel) => panel.key === "figures")?.width ?? 6;
  const figuresGrid =
    figuresWidth <= 2
      ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-1"
      : figuresWidth <= 4
        ? "grid gap-3 sm:grid-cols-2"
        : "grid gap-3 sm:grid-cols-2 xl:grid-cols-4";

  /** Every panel the dashboard can show, drawn once and placed by the layout. */
  const panels: Record<PanelKey, ReactNode> = {
    figures: (
      <div className={figuresGrid} data-dash-figures>
        <Stat
          label={t("dash.thisMonth")}
          value={formatAmount(thisMonth, locale)}
          count={{ amount: thisMonth / 100, locale, money: true }}
          hint={`${money?.monthCount ?? 0} ${t("dash.paymentsWord")}. ${t("dash.vatInCashApart")}`}
          tone="good"
          href="/reports/apartments"
        />
        <Stat
          label={t("dash.collected")}
          value={formatAmount(collected, locale)}
          count={{ amount: collected / 100, locale, money: true }}
          hint={t("dash.vatInCashApart")}
          href="/reports/apartments"
        />
        <Stat
          label={t("dash.outstanding")}
          value={formatAmount(stillToCome, locale)}
          count={{ amount: stillToCome / 100, locale, money: true }}
          hint={t("dash.outstandingHint")}
          tone={late > 0 ? "bad" : "teal"}
          href="/reports/apartments"
        />
        <Stat
          label={t("dash.cashReceived")}
          value={formatAmount(cashIn, locale)}
          count={{ amount: cashIn / 100, locale, money: true }}
          hint={`${formatAmount(cashToCome, locale)} ${t("dash.cashToCome")}`}
          href="/reports/apartments"
        />
      </div>
    ),

    attention: (
      <Card
        title={`${t("dash.attention")}${waitingTotal > 0 ? ` (${waitingTotal})` : ""}`}
        flush
      >
        {waiting.length === 0 ? (
          <Empty message={t("dash.allClear")} />
        ) : (
          <div className="overflow-x-auto" data-dash-attention>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("att.about")}</th>
                  <th>{t("att.since")}</th>
                  <th className="num">{t("contracts.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((group) => (
                  <Fragment key={group.kind}>
                    <tr className="bg-brand-surface" data-att-kind={group.kind}>
                      <td colSpan={2}>
                        <Pill tone={group.tone}>{group.count}</Pill>{" "}
                        <Link href={group.href} className="font-semibold hover:underline">
                          {t(group.label)}
                        </Link>
                      </td>
                      <td className="num">
                        {group.count > PER_KIND ? (
                          <Link href={group.href} className="text-xs font-semibold text-brand-teal-dark">
                            {t("att.more").replace("{n}", String(group.count - PER_KIND))}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                    {group.items.slice(0, PER_KIND).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link href={item.href} className="hover:underline">
                            {item.title || t("common.none")}
                          </Link>
                          {item.note ? (
                            <div className="max-w-[26rem] truncate text-xs text-brand-graphite/60">{item.note}</div>
                          ) : null}
                          {item.flags.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.flags.map((flag) => (
                                <Pill key={flag} tone={NEUTRAL_FLAGS.includes(flag) ? "neutral" : group.tone}>
                                  {t(flag)}
                                </Pill>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="!whitespace-nowrap">{day(item.since)}</td>
                        <td className="num !whitespace-nowrap">
                          {item.amountCents !== null ? formatAmount(item.amountCents, locale) : ""}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    ),

    matrix: (
      <Card title={t("dash.matrix")} flush action={seeAll("/reports/apartments")}>
        {matrixProjects.length === 0 ? (
          <Empty message={t("common.none")} />
        ) : (
          <div className="overflow-x-auto" data-dash-matrix>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("projects.title")}</th>
                  {STATUSES.map((status) => (
                    <th key={status} className="num">
                      {t(`units.status.${status}` as MessageKey)}
                    </th>
                  ))}
                  <th className="num">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody>
                {matrixProjects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <Link href={`/projects/${project.id}`} className="hover:underline">
                        {project.name}
                      </Link>
                    </td>
                    {STATUSES.map((status) => {
                      const value = cell(project.id, status);
                      return (
                        <td key={status} className={`num ${value === 0 ? "text-brand-graphite/40" : ""}`}>
                          {value}
                        </td>
                      );
                    })}
                    <td className="num font-semibold">{columnTotal(project.id)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>{t("common.total")}</td>
                  {STATUSES.map((status) => (
                    <td key={status} className="num">
                      {rowTotal(status)}
                    </td>
                  ))}
                  <td className="num">{grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    ),

    monthly: (
      <Card
        title={t("dash.monthly")}
        flush
        action={
          <form action="/" method="get" className="flex flex-wrap items-end gap-2" data-monthly-filters>
            {scope.project ? <input type="hidden" name="project" value={scope.project} /> : null}
            {scope.partner ? <input type="hidden" name="partner" value={scope.partner} /> : null}
            {scope.holder ? <input type="hidden" name="holder" value={scope.holder} /> : null}
            {/* Two dropdowns with a tick for each year and each month that has data. */}
            <Pick
              name="years"
              label={t("dash.years")}
              chosen={pickedYears.map(String)}
              anything={t("dash.everyYear")}
              choices={yearChoices.map((one) => ({ value: String(one), label: String(one) }))}
            />
            <Pick
              name="months"
              label={t("dash.months")}
              chosen={pickedMonths.map(String)}
              anything={t("dash.everyMonth")}
              choices={monthChoices.map((one) => ({ value: String(one), label: monthName(one) }))}
            />
            <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
              {t("reports.apply")}
            </button>
          </form>
        }
      >
        {shownMonths.length === 0 ? (
          <Empty message={t("common.none")} />
        ) : (
          <div className="overflow-x-auto" data-dash-monthly>
            <table className="data whitespace-nowrap text-xs">
              <thead>
                <tr>
                  <th>{t("dash.month")}</th>
                  {MONTHLY_COLUMNS.map((column) => (
                    <th key={column} className="num !whitespace-normal align-bottom">
                      {t(`dash.col.${column}` as MessageKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownMonths.map((row) => (
                  <tr key={row.key}>
                    <td className="whitespace-nowrap">{monthAndYear(row)}</td>
                    {MONTHLY_COLUMNS.map((column) => (
                      <td key={column} className={`num ${row[column] === 0 ? "text-brand-graphite/40" : ""}`}>
                        {MONEY_COLUMNS.includes(column) ? euros(row[column], locale) : row[column]}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>{t("common.total")}</td>
                  {MONTHLY_COLUMNS.map((column) => (
                    <td key={column} className="num">
                      {MONEY_COLUMNS.includes(column)
                        ? euros(monthsTotal[column], locale)
                        : monthsTotal[column]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-brand-graphite/60">{t("dash.monthlyNote")}</p>
          </div>
        )}
      </Card>
    ),

    funnel: (
      <Card title={t("reports.funnel")} action={seeAll("/reports/leads")}>
        <Funnel
          colour={SERIES.secondary}
          steps={[
            { label: t("reports.funnel.arrived"), value: funnel.arrived },
            { label: t("reports.funnel.answered"), value: funnel.answered },
            { label: t("reports.funnel.qualified"), value: funnel.qualified },
            { label: t("reports.funnel.converted"), value: funnel.converted },
          ]}
        />
      </Card>
    ),

    birthdays: (
      <Card title={t("birthdays.thisWeek")} action={seeAll("/emails/birthdays")}>
        {birthdays.length === 0 ? (
          <Empty message={t("birthdays.noneThisWeek")} />
        ) : (
          <ul className="space-y-1.5 text-sm" data-dash-birthdays>
            {birthdays.map((row, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <span>
                  <Link href={row.records[0]?.href ?? "/emails/birthdays"} className="font-semibold hover:underline">
                    {row.name}
                  </Link>
                  <span className="block text-xs text-brand-graphite/60">
                    {dayShort(row.day)}
                    {row.age ? `, ${t("birthdays.turns").toLowerCase()} ${row.age}` : ""}
                  </span>
                </span>
                <Pill tone={row.state === "SENT" ? "good" : row.state === "NO_EMAIL" || row.state === "FAILED" ? "bad" : row.state === "TODAY" ? "teal" : row.state === "DUE" ? "neutral" : "warn"}>
                  {t(`birthdays.state.${row.state}` as MessageKey)}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),

    activity: (
      <Card title={t("dash.activity")}>
        {activity.length === 0 ? (
          <Empty message={t("act.nothing")} />
        ) : (
          <ul className="feed">
            {activity.map((line) => (
              <li key={line.id}>
                <span className="font-semibold">{line.who}</span> {t(line.verb)}
                {line.subject ? (
                  line.href ? (
                    <>
                      {" "}
                      <Link href={line.href} className="text-brand-teal-dark hover:underline">
                        {t(line.subject)}
                      </Link>
                    </>
                  ) : (
                    ` ${t(line.subject)}`
                  )
                ) : null}
                <span className="when"> . {ago(line.at, locale)}</span>
                {line.detail ? <div className="when truncate">{line.detail}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),

    payments: (
      <Card title={t("dash.recentPayments")} flush>
        {recent.length === 0 ? (
          <Empty message={t("common.none")} />
        ) : (
          <div className="overflow-x-auto" data-dash-payments>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("dash.money.kind")}</th>
                  <th>{t("dash.money.who")}</th>
                  <th>{t("dash.money.way")}</th>
                  <th className="num">{t("contracts.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((line) => (
                  <tr key={line.id}>
                    <td className="whitespace-nowrap">{day(line.at)}</td>
                    <td>{t(MONEY_WORD[line.kind])}</td>
                    <td>
                      <Link href={line.href} className="hover:underline">
                        {line.who || t("common.none")}
                      </Link>
                      {line.note ? (
                        <div className="text-xs text-brand-graphite/60">{line.note}</div>
                      ) : null}
                    </td>
                    <td>
                      <Pill tone={line.incoming ? "good" : "neutral"}>
                        {t(line.incoming ? "dash.money.in" : "dash.money.out")}
                      </Pill>
                    </td>
                    <td className="num">{formatAmount(line.cents, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    ),
  };

  const names = Object.fromEntries(
    layout.map((panel) => [panel.key, t(PANEL_TITLE[panel.key])]),
  ) as Record<string, string>;
  const notes = Object.fromEntries(
    layout.map((panel) => [panel.key, t(PANEL_NOTE[panel.key])]),
  ) as Record<string, string>;
  const widths = Object.fromEntries(
    WIDTHS.map((width) => [String(width), t(WIDTH_LABEL[width])]),
  ) as Record<string, string>;

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={today}
        action={
          <DashboardArrange
            layout={layout}
            widthChoices={WIDTHS}
            save={saveDashboard}
            reset={resetDashboard}
            labels={{
              arrange: t("panel.arrange"),
              title: t("panel.arrangeTitle"),
              note: t("panel.arrangeNote"),
              save: t("panel.done"),
              close: t("panel.close"),
              reset: t("panel.reset"),
              up: t("panel.up"),
              down: t("panel.down"),
              show: t("panel.show"),
              hide: t("panel.hide"),
              width: t("panel.width"),
              hidden: t("panel.hidden"),
              onShow: t("panel.onShow"),
              dragHint: t("panel.dragHint"),
              preview: t("panel.preview"),
              names,
              notes,
              widths,
            }}
          />
        }
      />

      {/*
        The deal the whole page is about.

        One row, above the panels, because it changes every figure below it. A
        dashboard narrowed to one partnership says so at the top rather than
        leaving somebody to wonder why the numbers moved.
      */}
      <form action="/" method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3" data-dash-scope>
        {pickedYears.length > 0 ? <input type="hidden" name="years" value={pickedYears.join(",")} /> : null}
        {pickedMonths.length > 0 ? <input type="hidden" name="months" value={pickedMonths.join(",")} /> : null}
        {/* Several developments, companies and shareholders, ticked in a dropdown that applies itself. */}
        <Pick
          name="project"
          label={t("projects.title")}
          chosen={scope.project ? scope.project.split(",") : []}
          anything={t("reports.everyBuilding")}
          choices={choices.buildings.map((one) => ({ value: one.id, label: one.name }))}
        />
        <Pick
          name="partner"
          label={t("clients.partner")}
          chosen={scope.partner ? scope.partner.split(",") : []}
          anything={t("reports.everyPartner")}
          choices={choices.partners.map((one) => ({ value: one.id, label: one.name }))}
        />
        <Pick
          name="holder"
          label={t("reports.shareholdersFilter")}
          chosen={scope.holder ? scope.holder.split(",") : []}
          anything={t("reports.everyHolder")}
          choices={choices.holders}
        />
        <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
          {t("reports.apply")}
        </button>
        {scope.project || scope.partner || scope.holder || pickedYears.length > 0 || pickedMonths.length > 0 ? (
          <>
            <Link href="/" className="btn btn-secondary !px-3 !py-1 !text-xs" prefetch={false} data-reset>
              {t("list.resetAll")}
            </Link>
            <span className="text-xs text-brand-graphite/60">{t("reports.narrowed")}</span>
          </>
        ) : null}
      </form>

      {on.size === 0 ? (
        <Card>
          <Empty message={t("panel.nothing")} />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-6">
          {onShow.map((panel, index) => (
            <div key={panel.key} className={`panel-wrap min-w-0 ${widthClass(panel.width)}`}>
              <PanelMenu
                panelKey={panel.key}
                width={panel.width}
                first={index === 0}
                last={index === onShow.length - 1}
                widths={[...WIDTHS]}
                move={movePanel}
                hide={hidePanel}
                setWidth={setPanelWidth}
                labels={{
                  handle: t("panel.handle"),
                  up: t("panel.up"),
                  down: t("panel.down"),
                  hide: t("panel.hide"),
                  width: t("panel.width"),
                  widths,
                }}
              />
              {panels[panel.key]}
            </div>
          ))}
        </div>
      )}

      {putAway.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="statlabel">{t("panel.hidden")}</span>
          {putAway.map((panel) => (
            <form key={panel.key} action={showPanel.bind(null, panel.key)}>
              <button type="submit" className="putaway" title={t("panel.show")}>
                <IconPlus size={13} />
                {t(PANEL_TITLE[panel.key])}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </>
  );
}
