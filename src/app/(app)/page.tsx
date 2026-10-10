import Link from "next/link";
import type { ReactNode } from "react";
import { and, desc, eq, gte, isNotNull, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, expenses, installments, payments, projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, toCents } from "@/lib/money";
import { newLeadCount } from "@/lib/leads";
import { recentActivity } from "@/lib/activity";
import { upcomingBirthdays } from "@/lib/automaticEmails";
import {
  cashByMonth,
  leadFunnel,
  monthLabel,
  rangeFrom,
  salesByMonth,
  salesByProject,
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
import {
  BarSeries,
  Breakdown,
  Funnel,
  Meter,
  SERIES,
  StackedBar,
  shortMoney,
} from "@/components/charts";
import {
  IconCampaigns,
  IconClients,
  IconContracts,
  IconInvoices,
  IconLeads,
  IconPlus,
  IconReports,
} from "@/components/icons";
import { Attention, Card, Empty, PageHeader, Pill, Stat, Tile } from "@/components/ui";
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
  searchParams: Promise<{ project?: string; partner?: string }>;
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

  const needUnits = on.has("figures") || on.has("meters") || on.has("stock");
  const needMoney = on.has("figures") || on.has("meters");

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
  /* Money in scope, read from the payment itself so the query needs no join. */
  const paymentInScope =
    only === null
      ? undefined
      : (sql`${payments.contractId} in (
          select c.id from contracts c join units u on u.id = c.unit_id where u.project_id in ${mine}
        )` as SQL);

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
    unitRows,
    moneyRows,
    monthRows,
    lateRows,
    billRows,
    draftRows,
    waitingLeads,
    overdue,
    upcoming,
    recent,
    activity,
    cash,
    sales,
    funnel,
    byProject,
  ] = await Promise.all([
    when(
      needUnits,
      () =>
        db
          .select({
            total: sql<number>`count(*)::int`,
            sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
            available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
            negotiation: sql<number>`count(*) filter (where ${units.status} = 'NEGOTIATION')::int`,
            reserved: sql<number>`count(*) filter (where ${units.status} = 'RESERVED')::int`,
            onlySold: sql<number>`count(*) filter (where ${units.status} = 'SOLD')::int`,
            delivered: sql<number>`count(*) filter (where ${units.status} = 'DELIVERED')::int`,
          })
          .from(units)
          .where(inScope(units.projectId)),
      [],
    ),
    when(
      needMoney,
      () =>
        db
          .select({
            scheduled: sql<string>`coalesce((
              select sum(i.total_amount) from installments i
              join contracts c on c.id = i.contract_id
              ${only === null ? sql`` : sql`where c.unit_id in (select u.id from units u where u.project_id in ${mine})`}
            ), 0)`,
            collected: sql<string>`coalesce((
              select sum(p.amount) from payments p
              join contracts c on c.id = p.contract_id
              ${only === null ? sql`` : sql`where c.unit_id in (select u.id from units u where u.project_id in ${mine})`}
            ), 0)`,
          })
          .from(units)
          .limit(1),
      [],
    ),
    when(
      on.has("figures"),
      () =>
        db
          .select({
            collected: sql<string>`coalesce(sum(${payments.amount}), 0)`,
            count: sql<number>`count(*)::int`,
          })
          .from(payments)
          .where(and(gte(payments.paidOn, monthStart), paymentInScope)),
      [],
    ),
    when(
      on.has("figures") || on.has("attention"),
      () =>
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(installments)
          .where(
            and(
              isNotNull(installments.dueDate),
              lt(installments.dueDate, now),
              unpaidHere,
              only === null
                ? undefined
                : sql`${installments.contractId} in (
                    select c.id from contracts c where c.unit_id in (
                      select u.id from units u where u.project_id in ${mine}
                    )
                  )`,
            ),
          ),
      [],
    ),
    when(
      on.has("attention"),
      () =>
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(expenses)
          .where(
            and(
              isNotNull(expenses.dueDate),
              lt(expenses.dueDate, now),
              sql`${expenses.status} <> 'PAID'`,
            ),
          ),
      [],
    ),
    when(
      on.has("attention"),
      () =>
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(contracts)
          .where(eq(contracts.status, "DRAFT")),
      [],
    ),
    when(on.has("attention"), () => newLeadCount(), 0),
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
    when(
      on.has("payments"),
      () =>
        db
          .select({ payment: payments, contract: contracts, client: clients, unit: units })
          .from(payments)
          .innerJoin(contracts, eq(contracts.id, payments.contractId))
          .leftJoin(units, eq(units.id, contracts.unitId))
          .leftJoin(clients, eq(clients.id, contracts.clientId))
          .where(and(inScope(units.projectId), eq(payments.kind, "PAYMENT")))
          .orderBy(desc(payments.paidOn))
          .limit(8),
      [],
    ),
    when(on.has("activity"), () => recentActivity(10), []),
    when(on.has("cash"), () => cashByMonth(year, only), []),
    when(on.has("sales"), () => salesByMonth(year, only), []),
    when(on.has("funnel"), () => leadFunnel(year), {
      arrived: 0,
      answered: 0,
      qualified: 0,
      converted: 0,
      bought: 0,
    }),
    when(on.has("projects"), () => salesByProject(only), []),
  ]);

  const unitStats = unitRows[0];
  const scheduled = toCents(moneyRows[0]?.scheduled ?? "0");
  const collected = toCents(moneyRows[0]?.collected ?? "0");
  const thisMonth = toCents(monthRows[0]?.collected ?? "0");
  const late = lateRows[0]?.total ?? 0;
  const bills = billRows[0]?.total ?? 0;
  const drafts = draftRows[0]?.total ?? 0;

  /**
   * The developments worth a line on the dashboard: the ones that hold
   * apartments, best sold first, six at most. The rest are a click away in the
   * portfolio report.
   */
  const stocked = byProject
    .filter((row) => row.total > 0)
    .sort((a, b) => b.sellThrough - a.sellThrough || b.total - a.total)
    .slice(0, 6);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? t("dash.morning") : hour < 18 ? t("dash.afternoon") : t("dash.evening");
  const today = new Intl.DateTimeFormat(locale === "el" ? "el-GR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  const tiles = [
    { href: "/leads/new", label: t("shell.newLead"), icon: <IconLeads size={16} /> },
    { href: "/contracts/new", label: t("shell.newContract"), icon: <IconContracts size={16} /> },
    { href: "/clients/new", label: t("shell.newClient"), icon: <IconClients size={16} /> },
    { href: "/invoices/new", label: t("shell.newInvoice"), icon: <IconInvoices size={16} /> },
    { href: "/campaigns/new", label: t("shell.newCampaign"), icon: <IconCampaigns size={16} /> },
    { href: "/reports", label: t("nav.reports"), icon: <IconReports size={16} /> },
  ];

  const attention = [
    {
      href: "/reports/money",
      label: t("dash.lateInstallments"),
      count: late,
      tone: "bad" as const,
    },
    {
      href: "/leads?status=NEW",
      label: t("dash.waitingLeads"),
      count: waitingLeads,
      tone: "warn" as const,
    },
    {
      href: "/invoices?status=UNPAID",
      label: t("dash.overdueBills"),
      count: bills,
      tone: "warn" as const,
    },
    {
      href: "/contracts",
      label: t("dash.unsignedContracts"),
      count: drafts,
      tone: "neutral" as const,
    },
  ].filter((row) => row.count > 0);

  /* The week's birthdays, read only when the panel is on show. */
  const birthdays = on.has("birthdays") ? await upcomingBirthdays(7) : [];
  const dayShort = (value: Date) => value.toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { weekday: "short", day: "numeric", month: "short" });

  const seeAll = (href: string) => (
    <Link href={href} className="text-xs font-semibold text-brand-teal-dark">
      {t("dash.seeAll")}
    </Link>
  );

  /** Every panel the dashboard can show, drawn once and placed by the layout. */
  const panels: Record<PanelKey, ReactNode> = {
    tiles: (
      <div>
        <p className="statlabel mb-2">{t("dash.quick")}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {tiles.map((tile) => (
            <Tile key={tile.href} href={tile.href} label={tile.label} icon={tile.icon} />
          ))}
        </div>
      </div>
    ),

    figures: (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("dash.units")}
          value={String(unitStats?.total ?? 0)}
          count={{ amount: unitStats?.total ?? 0, locale }}
          hint={`${unitStats?.sold ?? 0} ${t("dash.sold").toLowerCase()}, ${
            (unitStats?.available ?? 0) + (unitStats?.negotiation ?? 0)
          } ${t("dash.available").toLowerCase()}`}
          href="/projects"
        />
        <Stat
          label={t("dash.thisMonth")}
          value={formatAmount(thisMonth, locale)}
          count={{ amount: thisMonth / 100, locale, money: true }}
          hint={`${monthRows[0]?.count ?? 0} ${t("dash.recentPayments").toLowerCase()}`}
          tone="good"
          href="/reports/money"
        />
        <Stat
          label={t("dash.collected")}
          value={formatAmount(collected, locale)}
          count={{ amount: collected / 100, locale, money: true }}
          hint={formatAmount(scheduled, locale)}
          href="/reports/money"
        />
        <Stat
          label={t("dash.outstanding")}
          value={formatAmount(scheduled - collected, locale)}
          count={{ amount: (scheduled - collected) / 100, locale, money: true }}
          tone={late > 0 ? "bad" : "teal"}
          href="/reports/money"
        />
      </div>
    ),

    meters: (
      <Card title={t("dash.collection")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Meter
            label={t("reports.collected")}
            value={collected}
            total={scheduled}
            display={formatAmount(collected, locale)}
            totalDisplay={formatAmount(scheduled, locale)}
            tone="good"
          />
          <Meter
            label={t("reports.sellThrough")}
            value={unitStats?.sold ?? 0}
            total={unitStats?.total ?? 0}
            display={String(unitStats?.sold ?? 0)}
            totalDisplay={String(unitStats?.total ?? 0)}
          />
        </div>
      </Card>
    ),

    cash: (
      <Card title={t("reports.cashflow")} action={seeAll("/reports/money")}>
        <BarSeries
          labels={cash.map((row) => monthLabel(row.month, locale))}
          series={[
            {
              label: t("reports.due"),
              colour: SERIES.secondary,
              values: cash.map((row) => row.dueCents),
              format: shortMoney,
            },
            {
              label: t("reports.paid"),
              colour: SERIES.primary,
              values: cash.map((row) => row.paidCents),
              format: shortMoney,
            },
          ]}
        />
        <details className="figures">
          <summary>{t("dash.figures")}</summary>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("dash.month")}</th>
                  <th className="num">{t("reports.due")}</th>
                  <th className="num">{t("reports.paid")}</th>
                </tr>
              </thead>
              <tbody>
                {cash.map((row) => (
                  <tr key={row.month}>
                    <td>{monthLabel(row.month, locale)}</td>
                    <td className="num">{formatAmount(row.dueCents, locale)}</td>
                    <td className="num">{formatAmount(row.paidCents, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
    ),

    stock: (
      <Card title={t("dash.stock")}>
        <StackedBar
          empty={t("common.none")}
          segments={[
            {
              label: t("units.status.AVAILABLE"),
              value: unitStats?.available ?? 0,
              colour: SERIES.primary,
            },
            {
              label: t("units.status.NEGOTIATION"),
              value: unitStats?.negotiation ?? 0,
              colour: SERIES.fifth,
            },
            {
              label: t("units.status.RESERVED"),
              value: unitStats?.reserved ?? 0,
              colour: SERIES.secondary,
            },
            {
              label: t("units.status.SOLD"),
              value: unitStats?.onlySold ?? 0,
              colour: SERIES.third,
            },
            {
              label: t("units.status.DELIVERED"),
              value: unitStats?.delivered ?? 0,
              colour: SERIES.fourth,
            },
          ]}
        />
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

    projects: (
      <Card title={t("dash.byProject")} action={seeAll("/reports/portfolio")}>
        <Breakdown
          empty={t("common.none")}
          colour={SERIES.fourth}
          rows={stocked.map((row) => ({
            label: row.project.name,
            value: row.sold,
            display: `${row.sold} / ${row.total}`,
            note: `${Math.round(row.sellThrough * 100)}%`,
            href: `/projects/${row.project.id}`,
          }))}
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

    attention: (
      <Card title={t("dash.attention")}>
        {attention.length === 0 ? (
          <Empty message={t("dash.allClear")} />
        ) : (
          <div className="grid gap-2">
            {attention.map((row) => (
              <Attention
                key={row.href + row.label}
                href={row.href}
                label={row.label}
                count={row.count}
                tone={row.tone}
              />
            ))}
          </div>
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
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("contracts.client")}</th>
                  <th>{t("contracts.reference")}</th>
                  <th>{t("contracts.receipt")}</th>
                  <th className="num">{t("contracts.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.payment.id}>
                    <td>{day(r.payment.paidOn)}</td>
                    <td>
                      {r.client ? `${r.client.lastName} ${r.client.firstName}` : ""}
                      {r.unit ? (
                        <div className="text-xs text-brand-graphite/60">{r.unit.code}</div>
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/contracts/${r.contract.id}`} className="hover:underline">
                        {r.contract.reference}
                      </Link>
                    </td>
                    <td>{r.payment.receiptNumber ?? ""}</td>
                    <td className="num">{formatAmount(toCents(r.payment.amount), locale)}</td>
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
