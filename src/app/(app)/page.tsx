import Link from "next/link";
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, expenses, installments, payments, projects, units } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { newLeadCount } from "@/lib/leads";
import { recentActivity } from "@/lib/activity";
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
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
        available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
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
  ]);

  const unitStats = unitRows[0];
  const scheduled = toCents(moneyRows[0]?.scheduled ?? "0");
  const collected = toCents(moneyRows[0]?.collected ?? "0");
  const thisMonth = toCents(monthRows[0]?.collected ?? "0");
  const late = lateRows[0]?.total ?? 0;
  const bills = billRows[0]?.total ?? 0;
  const drafts = draftRows[0]?.total ?? 0;

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
                      <td>{day(r.installment.dueDate)}</td>
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
