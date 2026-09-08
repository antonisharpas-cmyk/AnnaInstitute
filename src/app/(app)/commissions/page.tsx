import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, clients, commissionPayments, commissions, contracts, units } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatMoney, toCents } from "@/lib/money";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { recordCommissionPayment } from "../agents/actions";

export default async function CommissionsPage() {
  const { locale, t } = await getTranslator();

  const rows = await db
    .select({
      commission: commissions,
      agent: agents,
      contract: contracts,
      unit: units,
      client: clients,
    })
    .from(commissions)
    .innerJoin(agents, eq(agents.id, commissions.agentId))
    .innerJoin(contracts, eq(contracts.id, commissions.contractId))
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .orderBy(desc(commissions.createdAt));

  const paymentRows = await db
    .select({ payment: commissionPayments, agent: agents })
    .from(commissionPayments)
    .innerJoin(agents, eq(agents.id, commissionPayments.agentId))
    .orderBy(desc(commissionPayments.paidOn));

  const agentList = await db.select().from(agents).orderBy(asc(agents.name));

  return (
    <>
      <PageHeader title={t("nav.commissions")} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("agents.generated")}>
            {rows.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("contracts.agent")}</th>
                    <th>{t("contracts.reference")}</th>
                    <th className="num">Base</th>
                    <th className="num">{t("agents.rate")}</th>
                    <th className="num">{t("contracts.amount")}</th>
                    <th>{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.commission.id}>
                      <td className="font-semibold">{r.agent.name}</td>
                      <td>
                        <Link href={`/contracts/${r.contract.id}`} className="hover:underline">
                          {r.contract.reference}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {r.client.lastName} . {r.unit.code}
                        </div>
                      </td>
                      <td className="num">{formatMoney(toCents(r.commission.baseAmount), locale)}</td>
                      <td className="num">{Number(r.commission.rate)}%</td>
                      <td className="num font-semibold">{formatMoney(toCents(r.commission.amount), locale)}</td>
                      <td>
                        <Pill
                          tone={
                            r.commission.status === "PAID"
                              ? "good"
                              : r.commission.status === "PARTIALLY_PAID"
                                ? "warn"
                                : "neutral"
                          }
                        >
                          {r.commission.status.replace(/_/g, " ").toLowerCase()}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title={t("agents.paidOut")}>
            {paymentRows.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("contracts.agent")}</th>
                    <th className="num">{t("contracts.amount")}</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((r) => (
                    <tr key={r.payment.id}>
                      <td>{new Date(r.payment.paidOn).toISOString().slice(0, 10)}</td>
                      <td>{r.agent.name}</td>
                      <td className="num">{formatMoney(toCents(r.payment.amount), locale)}</td>
                      <td>{r.payment.reference ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card title={t("agents.recordCommissionPayment")}>
          {agentList.length === 0 ? (
            <p className="text-sm text-slate-500">Add an agent first.</p>
          ) : (
            <form action={recordCommissionPayment} className="space-y-3">
              <div>
                <label className="label" htmlFor="agentId">
                  {t("contracts.agent")}
                </label>
                <select id="agentId" name="agentId" required className="select">
                  {agentList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="commissionId">
                  Against
                </label>
                <select id="commissionId" name="commissionId" className="select">
                  <option value="">not assigned to one contract</option>
                  {rows
                    .filter((r) => r.commission.status !== "PAID")
                    .map((r) => (
                      <option key={r.commission.id} value={r.commission.id}>
                        {r.agent.name} . {r.contract.reference} .{" "}
                        {formatMoney(toCents(r.commission.amount), locale)}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="amount">
                  {t("contracts.amount")}
                </label>
                <input id="amount" name="amount" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="paidOn">
                  {t("common.date")}
                </label>
                <input id="paidOn" name="paidOn" type="date" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="reference">
                  Reference
                </label>
                <input id="reference" name="reference" className="input" />
              </div>
              <button type="submit" className="btn btn-primary w-full">
                {t("common.save")}
              </button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
