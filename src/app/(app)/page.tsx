import Link from "next/link";
import { and, desc, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, installments, payments, projects, units } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatMoney, toCents } from "@/lib/money";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function DashboardPage() {
  const { locale, t } = await getTranslator();

  const [unitStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
      available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
    })
    .from(units);

  const [moneyStats] = await db
    .select({
      scheduled: sql<string>`coalesce((select sum(i.total_amount) from installments i), 0)`,
      collected: sql<string>`coalesce((select sum(p.amount) from payments p), 0)`,
    })
    .from(contracts)
    .limit(1);

  const overdue = await db
    .select({
      installment: installments,
      contract: contracts,
      client: clients,
      unit: units,
      project: projects,
    })
    .from(installments)
    .innerJoin(contracts, eq(contracts.id, installments.contractId))
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(
      and(
        ne(installments.status, "PAID"),
        isNotNull(installments.dueDate),
        lt(installments.dueDate, new Date()),
      ),
    )
    .orderBy(installments.dueDate)
    .limit(10);

  const upcoming = await db
    .select({
      installment: installments,
      contract: contracts,
      client: clients,
      unit: units,
    })
    .from(installments)
    .innerJoin(contracts, eq(contracts.id, installments.contractId))
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .innerJoin(units, eq(units.id, contracts.unitId))
    .where(and(ne(installments.status, "PAID"), isNotNull(installments.dueDate)))
    .orderBy(installments.dueDate)
    .limit(10);

  const recent = await db
    .select({ payment: payments, contract: contracts, client: clients })
    .from(payments)
    .innerJoin(contracts, eq(contracts.id, payments.contractId))
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .orderBy(desc(payments.paidOn))
    .limit(8);

  const scheduled = toCents(moneyStats?.scheduled ?? "0");
  const collected = toCents(moneyStats?.collected ?? "0");

  return (
    <>
      <PageHeader title={t("nav.dashboard")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("dash.units")}
          value={String(unitStats?.total ?? 0)}
          hint={`${unitStats?.sold ?? 0} ${t("dash.sold").toLowerCase()}, ${
            unitStats?.available ?? 0
          } ${t("dash.available").toLowerCase()}`}
        />
        <Stat label={t("common.total")} value={formatMoney(scheduled, locale)} />
        <Stat label={t("dash.collected")} value={formatMoney(collected, locale)} />
        <Stat label={t("dash.outstanding")} value={formatMoney(scheduled - collected, locale)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("dash.overdue")}>
          {overdue.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
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
                        {r.client.lastName} {r.client.firstName}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {r.project.name} {r.unit.code} . {r.installment.label}
                      </div>
                    </td>
                    <td className="num">{formatMoney(toCents(r.installment.totalAmount), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={t("dash.nextPayments")}>
          {upcoming.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
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
                        {r.client.lastName} {r.client.firstName}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {r.unit.code} . {r.installment.label}
                      </div>
                    </td>
                    <td className="num">{formatMoney(toCents(r.installment.totalAmount), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={t("dash.recentPayments")} className="lg:col-span-2">
          {recent.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
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
                      {r.client.lastName} {r.client.firstName}
                    </td>
                    <td>
                      <Link href={`/contracts/${r.contract.id}`} className="hover:underline">
                        {r.contract.reference}
                      </Link>
                    </td>
                    <td>{r.payment.receiptNumber ?? ""}</td>
                    <td className="num">{formatMoney(toCents(r.payment.amount), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
