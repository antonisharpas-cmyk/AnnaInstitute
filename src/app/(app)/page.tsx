import Link from "next/link";
import { and, desc, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  contractUnits,
  contracts,
  installments,
  payments,
  projects,
  units,
} from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
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
      // Every apartment on a contract owes the whole schedule, so the money due
      // is the schedule counted once per apartment.
      scheduled: sql<string>`coalesce((
        select sum(i.total_amount) from installments i where i.assignment_id is not null
      ), 0)`,
      collected: sql<string>`coalesce((select sum(p.amount) from payments p), 0)`,
    })
    .from(contracts)
    .limit(1);

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
    assignment: contractUnits,
    client: clients,
    unit: units,
    project: projects,
  };

  const overdue = await db
    .select(dueSelection)
    .from(installments)
    .innerJoin(contracts, eq(contracts.id, installments.contractId))
    .innerJoin(contractUnits, eq(contractUnits.id, installments.assignmentId))
    .innerJoin(units, eq(units.id, contractUnits.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contractUnits.clientId))
    .where(and(isNotNull(installments.dueDate), lt(installments.dueDate, new Date()), unpaidHere))
    .orderBy(installments.dueDate)
    .limit(10);

  const upcoming = await db
    .select(dueSelection)
    .from(installments)
    .innerJoin(contracts, eq(contracts.id, installments.contractId))
    .innerJoin(contractUnits, eq(contractUnits.id, installments.assignmentId))
    .innerJoin(units, eq(units.id, contractUnits.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contractUnits.clientId))
    .where(and(isNotNull(installments.dueDate), sql`${installments.dueDate} >= now()`, unpaidHere))
    .orderBy(installments.dueDate)
    .limit(10);

  const recent = await db
    .select({ payment: payments, contract: contracts, client: clients, unit: units })
    .from(payments)
    .innerJoin(contracts, eq(contracts.id, payments.contractId))
    .leftJoin(contractUnits, eq(contractUnits.id, payments.assignmentId))
    .leftJoin(units, eq(units.id, contractUnits.unitId))
    .leftJoin(clients, eq(clients.id, contractUnits.clientId))
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
        <Stat label={t("common.total")} value={formatAmount(scheduled, locale)} />
        <Stat label={t("dash.collected")} value={formatAmount(collected, locale)} />
        <Stat label={t("dash.outstanding")} value={formatAmount(scheduled - collected, locale)} />
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
                  <tr key={`${r.assignment.id}-${r.installment.id}`}>
                    <td>
                      <Pill tone="bad">{day(r.installment.dueDate)}</Pill>
                    </td>
                    <td>
                      <Link
                        href={`/contracts/${r.contract.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {r.client
                          ? `${r.client.lastName} ${r.client.firstName}`
                          : r.contract.reference}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {r.project.name} {r.unit.code} . {r.installment.label}
                      </div>
                    </td>
                    <td className="num">
                      {formatAmount(toCents(r.installment.totalAmount), locale)}
                    </td>
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
                  <tr key={`${r.assignment.id}-${r.installment.id}`}>
                    <td>{day(r.installment.dueDate)}</td>
                    <td>
                      <Link
                        href={`/contracts/${r.contract.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {r.client
                          ? `${r.client.lastName} ${r.client.firstName}`
                          : r.contract.reference}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {r.project.name} {r.unit.code} . {r.installment.label}
                      </div>
                    </td>
                    <td className="num">
                      {formatAmount(toCents(r.installment.totalAmount), locale)}
                    </td>
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
                      {r.client ? `${r.client.lastName} ${r.client.firstName}` : ""}
                      {r.unit ? (
                        <div className="text-xs text-brand-graphite/60">{r.unit.code}</div>
                      ) : null}
                    </td>
                    <td>
                      <Link
                        href={`/contracts/${r.contract.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {r.contract.reference}
                      </Link>
                    </td>
                    <td>{r.payment.receiptNumber ?? ""}</td>
                    <td className="num">{formatAmount(toCents(r.payment.amount), locale)}</td>
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
