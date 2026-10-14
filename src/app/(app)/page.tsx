import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { and, asc, eq, gte, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, installments, projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, toCents } from "@/lib/money";
import { recentActivity } from "@/lib/activity";
import { upcomingBirthdays } from "@/lib/automaticEmails";
import { attention, attentionTotal, type AttentionGroup } from "@/lib/attention";
import { MONEY_COLUMNS, MONTHLY_COLUMNS, monthlyTable, monthlyYears } from "@/lib/monthly";
import { recentMoney, type MoneyKind, type MoneyLine } from "@/lib/recentMoney";
import {
  leadFunnel,
  monthLabel,
  rangeFrom,
  salesByMonth,
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
import { BarSeries, Funnel, SERIES } from "@/components/charts";
import { IconPlus } from "@/components/icons";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import DashboardArrange from "@/components/DashboardArrange";
import PanelMenu from "@/components/PanelMenu";
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

/** Due inside the fortnight, which is when the office starts chasing it. */
const soon = (value: Date | null | undefined) => {
  if (!value) return false;
  const days = (new Date(value).getTime() - Date.now()) / 86_400_000;
  return days >= 0 && days <= 14;
};

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
  searchParams: Promise<{ project?: string; partner?: string; year?: string }>;
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

  /* The year the monthly table is for: the one asked for, or this one. */
  const askedYear = Number(params.year);
  const tableYear =
    Number.isInteger(askedYear) && askedYear > 2000 && askedYear <= now.getFullYear() + 1
      ? askedYear
      : now.getFullYear();

  /**
   * What is late, and what is next.
   *
   * An installment is owed by each apartment on its contract, so a line shows up
   * once per apartment and counts as settled only when that apartment has paid
   * it. `unpaidHere` is that test.
   */
  const unpaidHere = sql`coalesce((
      select sum(p.amount) from payments p where p.installment_id = ${installments.id}
    ), 0) < ${installments.totalAmount}`;

  const dueSelection = {
    installment: installments,
    contract: contracts,
    client: clients,
    unit: units,
    project: projects,
  };

  const dueQuery = () =>
    db
      .select(dueSelection)
      .from(installments)
      .innerJoin(contracts, eq(contracts.id, installments.contractId))
      .leftJoin(units, eq(units.id, contracts.unitId))
      .leftJoin(projects, eq(projects.id, units.projectId))
      .leftJoin(clients, eq(clients.id, contracts.clientId));

  const [
    moneyRows,
    groups,
    matrixRows,
    monthly,
    years,
    overdue,
    upcoming,
    recent,
    activity,
    sales,
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
    when(on.has("monthly"), () => monthlyTable(tableYear, only), null),
    when(on.has("monthly"), () => monthlyYears(), [] as number[]),
    when(
      on.has("overdue"),
      () =>
        dueQuery()
          .where(
            and(
              isNotNull(installments.dueDate),
              lt(installments.dueDate, now),
              unpaidHere,
              inScope(units.projectId),
            ),
          )
          .orderBy(installments.dueDate)
          .limit(8),
      [],
    ),
    when(
      on.has("upcoming"),
      () =>
        dueQuery()
          .where(
            and(
              isNotNull(installments.dueDate),
              gte(installments.dueDate, now),
              unpaidHere,
              inScope(units.projectId),
            ),
          )
          .orderBy(installments.dueDate)
          .limit(8),
      [],
    ),
    when(on.has("payments"), () => recentMoney(12, only), [] as MoneyLine[]),
    when(on.has("activity"), () => recentActivity(10), []),
    when(on.has("sales"), () => salesByMonth(year, only), []),
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

  /* The matrix: developments across, statuses down, totals on the right and at the bottom. */
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
  const monthName = (month: number) =>
    new Date(tableYear, month, 1).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { month: "long" });

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
          href="/reports/money"
        />
        <Stat
          label={t("dash.collected")}
          value={formatAmount(collected, locale)}
          count={{ amount: collected / 100, locale, money: true }}
          hint={t("dash.vatInCashApart")}
          href="/reports/money"
        />
        <Stat
          label={t("dash.outstanding")}
          value={formatAmount(stillToCome, locale)}
          count={{ amount: stillToCome / 100, locale, money: true }}
          hint={t("dash.outstandingHint")}
          tone={late > 0 ? "bad" : "teal"}
          href="/reports/money"
        />
        <Stat
          label={t("dash.cashReceived")}
          value={formatAmount(cashIn, locale)}
          count={{ amount: cashIn / 100, locale, money: true }}
          hint={`${formatAmount(cashToCome, locale)} ${t("dash.cashToCome")}`}
          href="/reports/money"
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
      <Card title={t("dash.matrix")} flush action={seeAll("/reports/portfolio")}>
        {matrixProjects.length === 0 ? (
          <Empty message={t("common.none")} />
        ) : (
          <div className="overflow-x-auto" data-dash-matrix>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.status")}</th>
                  {matrixProjects.map((project) => (
                    <th key={project.id} className="num">
                      <Link href={`/projects/${project.id}`} className="hover:underline">
                        {project.name}
                      </Link>
                    </th>
                  ))}
                  <th className="num">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody>
                {STATUSES.map((status) => (
                  <tr key={status}>
                    <td>{t(`units.status.${status}` as MessageKey)}</td>
                    {matrixProjects.map((project) => {
                      const value = cell(project.id, status);
                      return (
                        <td key={project.id} className={`num ${value === 0 ? "text-brand-graphite/40" : ""}`}>
                          {value}
                        </td>
                      );
                    })}
                    <td className="num font-semibold">{rowTotal(status)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>{t("common.total")}</td>
                  {matrixProjects.map((project) => (
                    <td key={project.id} className="num">
                      {columnTotal(project.id)}
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
        title={`${t("dash.monthly")} ${tableYear}`}
        flush
        action={
          <form action="/" method="get" className="flex items-center gap-2">
            {scope.project ? <input type="hidden" name="project" value={scope.project} /> : null}
            {scope.partner ? <input type="hidden" name="partner" value={scope.partner} /> : null}
            <select
              name="year"
              defaultValue={String(tableYear)}
              className="select !w-24 !py-1 !text-xs"
              aria-label={t("dash.year")}
            >
              {(years.includes(tableYear) ? years : [tableYear, ...years]).map((one) => (
                <option key={one} value={one}>
                  {one}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
              {t("reports.apply")}
            </button>
          </form>
        }
      >
        {monthly === null ? (
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
                {monthly.rows.map((row) => (
                  <tr key={row.month} className={row.future ? "text-brand-graphite/40" : ""}>
                    <td className="capitalize">{monthName(row.month)}</td>
                    {MONTHLY_COLUMNS.map((column) => (
                      <td key={column} className={`num ${!row.future && row[column] === 0 ? "text-brand-graphite/40" : ""}`}>
                        {row.future
                          ? ""
                          : MONEY_COLUMNS.includes(column)
                            ? euros(row[column], locale)
                            : row[column]}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>{t("common.total")}</td>
                  {MONTHLY_COLUMNS.map((column) => (
                    <td key={column} className="num">
                      {MONEY_COLUMNS.includes(column)
                        ? euros(monthly.total[column], locale)
                        : monthly.total[column]}
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

    sales: (
      <Card title={t("reports.monthlySales")} action={seeAll("/reports/sales")}>
        <BarSeries
          height={160}
          minWidth={420}
          labels={sales.map((row) => monthLabel(row.month, locale))}
          series={[
            {
              label: t("reports.signed"),
              colour: SERIES.third,
              values: sales.map((row) => row.count),
              format: (value) => String(Math.round(value)),
            },
          ]}
        />
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

    overdue: (
      <Card title={t("dash.overdue")} flush action={seeAll("/reports/money")}>
        {overdue.length === 0 ? (
          <Empty message={t("common.none")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("contracts.due")}</th>
                  <th>{t("contracts.client")}</th>
                  <th className="num">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((r) => (
                  <tr key={r.installment.id}>
                    <td>
                      <Pill tone="bad">{day(r.installment.dueDate)}</Pill>
                    </td>
                    <td>
                      <Link href={`/contracts/${r.contract.id}`} className="hover:underline">
                        {r.client
                          ? `${r.client.lastName} ${r.client.firstName}`
                          : r.contract.reference}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {r.project?.name} {r.unit?.code} . {r.installment.label}
                      </div>
                    </td>
                    <td className="num">
                      {formatAmount(toCents(r.installment.totalAmount), locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    ),

    upcoming: (
      <Card title={t("dash.nextPayments")} flush>
        {upcoming.length === 0 ? (
          <Empty message={t("common.none")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("contracts.due")}</th>
                  <th>{t("contracts.client")}</th>
                  <th className="num">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((r) => (
                  <tr key={r.installment.id}>
                    <td>
                      {soon(r.installment.dueDate) ? (
                        <Pill tone="warn">{day(r.installment.dueDate)}</Pill>
                      ) : (
                        day(r.installment.dueDate)
                      )}
                    </td>
                    <td>
                      <Link href={`/contracts/${r.contract.id}`} className="hover:underline">
                        {r.client
                          ? `${r.client.lastName} ${r.client.firstName}`
                          : r.contract.reference}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {r.project?.name} {r.unit?.code} . {r.installment.label}
                      </div>
                    </td>
                    <td className="num">
                      {formatAmount(toCents(r.installment.totalAmount), locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <form action="/" method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="label" htmlFor="project">
            {t("projects.title")}
          </label>
          <select
            id="project"
            name="project"
            defaultValue={scope.project}
            className="select !w-48 !py-1 !text-xs"
          >
            <option value="">{t("reports.everyBuilding")}</option>
            {choices.buildings.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="partner">
            {t("clients.partner")}
          </label>
          <select
            id="partner"
            name="partner"
            defaultValue={scope.partner}
            className="select !w-48 !py-1 !text-xs"
          >
            <option value="">{t("reports.everyPartner")}</option>
            <option value="ours">{t("reports.oursAlone")}</option>
            {choices.partners.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
          {t("reports.apply")}
        </button>
        {scope.project || scope.partner ? (
          <span className="text-xs text-brand-graphite/60">{t("reports.narrowed")}</span>
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
