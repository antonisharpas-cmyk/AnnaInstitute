import Link from "next/link";
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, expenses, installments, payments, projects, units } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { newLeadCount } from "@/lib/leads";
import { recentActivity } from "@/lib/activity";
import {
  cashByMonth,
  leadFunnel,
  monthLabel,
  rangeFrom,
  salesByMonth,
  salesByProject,
} from "@/lib/reports";
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
  IconReports,
} from "@/components/icons";
import { Attention, Card, Empty, PageHeader, Pill, Stat, Tile } from "@/components/ui";

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

/**
 * The screen people leave open all day.
 *
 * It answers three questions in the order they are asked in the morning: what
 * do I need to deal with, what is the business worth this month, and what has
 * everyone else been doing. Everything on it is a link into the record itself,
 * so nothing here is a dead end.
 */
export default async function DashboardPage() {
  const { locale, t } = await getTranslator();
  const now = new Date();
  const monthStart = startOfMonth();

  const waitingLeads = await newLeadCount();

  // The charts all read the same twelve months, so the page tells one story.
  const { range: year } = rangeFrom({ period: "12m" });

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
    overdue,
    upcoming,
    recent,
    activity,
    cash,
    sales,
    funnel,
    byProject,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
        available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
        reserved: sql<number>`count(*) filter (where ${units.status} = 'RESERVED')::int`,
        onlySold: sql<number>`count(*) filter (where ${units.status} = 'SOLD')::int`,
        delivered: sql<number>`count(*) filter (where ${units.status} = 'DELIVERED')::int`,
      })
      .from(units),
    db
      .select({
        scheduled: sql<string>`coalesce((select sum(i.total_amount) from installments i), 0)`,
        collected: sql<string>`coalesce((select sum(p.amount) from payments p), 0)`,
      })
      .from(units)
      .limit(1),
    db
      .select({
        collected: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(gte(payments.paidOn, monthStart)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(installments)
      .where(and(isNotNull(installments.dueDate), lt(installments.dueDate, now), unpaidHere)),
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
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(contracts)
      .where(eq(contracts.status, "DRAFT")),
    dueQuery()
      .where(and(isNotNull(installments.dueDate), lt(installments.dueDate, now), unpaidHere))
      .orderBy(installments.dueDate)
      .limit(8),
    dueQuery()
      .where(and(isNotNull(installments.dueDate), gte(installments.dueDate, now), unpaidHere))
      .orderBy(installments.dueDate)
      .limit(8),
    db
      .select({ payment: payments, contract: contracts, client: clients, unit: units })
      .from(payments)
      .innerJoin(contracts, eq(contracts.id, payments.contractId))
      .leftJoin(units, eq(units.id, contracts.unitId))
      .leftJoin(clients, eq(clients.id, contracts.clientId))
      .orderBy(desc(payments.paidOn))
      .limit(8),
    recentActivity(10),
    cashByMonth(year),
    salesByMonth(year),
    leadFunnel(year),
    salesByProject(),
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

  return (
    <>
      <PageHeader title={greeting} subtitle={today} />

      <div className="mb-5">
        <p className="statlabel mb-2">{t("dash.quick")}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {tiles.map((tile) => (
            <Tile key={tile.href} href={tile.href} label={tile.label} icon={tile.icon} />
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("dash.units")}
          value={String(unitStats?.total ?? 0)}
          hint={`${unitStats?.sold ?? 0} ${t("dash.sold").toLowerCase()}, ${
            unitStats?.available ?? 0
          } ${t("dash.available").toLowerCase()}`}
          href="/projects"
        />
        <Stat
          label={t("dash.thisMonth")}
          value={formatAmount(thisMonth, locale)}
          hint={`${monthRows[0]?.count ?? 0} ${t("dash.recentPayments").toLowerCase()}`}
          tone="good"
          href="/reports/money"
        />
        <Stat
          label={t("dash.collected")}
          value={formatAmount(collected, locale)}
          hint={formatAmount(scheduled, locale)}
          href="/reports/money"
        />
        <Stat
          label={t("dash.outstanding")}
          value={formatAmount(scheduled - collected, locale)}
          tone={late > 0 ? "bad" : "teal"}
          href="/reports/money"
        />
      </div>

      <Card className="mb-4" title={t("dash.collection")}>
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

      <div className="mb-4 grid items-start gap-4 lg:grid-cols-3">
        <Card
          title={t("reports.cashflow")}
          className="lg:col-span-2"
          action={
            <Link href="/reports/money" className="text-xs font-semibold text-brand-teal-dark">
              {t("dash.seeAll")}
            </Link>
          }
        >
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
      </div>

      <div className="mb-4 grid items-start gap-4 lg:grid-cols-4">
        <Card
          className="lg:col-span-2"
          title={t("reports.monthlySales")}
          action={
            <Link href="/reports/sales" className="text-xs font-semibold text-brand-teal-dark">
              {t("dash.seeAll")}
            </Link>
          }
        >
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

        <Card
          title={t("reports.funnel")}
          action={
            <Link href="/reports/leads" className="text-xs font-semibold text-brand-teal-dark">
              {t("dash.seeAll")}
            </Link>
          }
        >
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

        <Card
          title={t("dash.byProject")}
          action={
            <Link href="/reports/portfolio" className="text-xs font-semibold text-brand-teal-dark">
              {t("dash.seeAll")}
            </Link>
          }
        >
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
      </div>

      <div className="mb-4 grid items-start gap-4 lg:grid-cols-3">
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

        <Card title={t("dash.activity")} className="lg:col-span-2">
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
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card
          title={t("dash.overdue")}
          flush
          action={
            <Link href="/reports/money" className="text-xs font-semibold text-brand-teal-dark">
              {t("dash.seeAll")}
            </Link>
          }
        >
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

        <Card title={t("dash.recentPayments")} className="lg:col-span-2" flush>
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
      </div>
    </>
  );
}
