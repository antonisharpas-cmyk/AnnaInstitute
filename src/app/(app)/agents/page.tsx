import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, commissionPayments, commissions } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatMoney, toCents } from "@/lib/money";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { createAgent, updateAgentRate } from "./actions";

export default async function AgentsPage() {
  const { locale, t } = await getTranslator();

  const rows = await db
    .select({
      agent: agents,
      contracts: sql<number>`count(distinct ${commissions.contractId})::int`,
      generated: sql<string>`coalesce(sum(${commissions.amount}), 0)`,
      paid: sql<string>`coalesce((select sum(cp.amount) from commission_payments cp where cp.agent_id = ${agents.id}), 0)`,
    })
    .from(agents)
    .leftJoin(commissions, eq(commissions.agentId, agents.id))
    .groupBy(agents.id)
    .orderBy(asc(agents.name));

  void commissionPayments;

  return (
    <>
      <PageHeader title={t("agents.title")} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            {rows.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th className="num">{t("contracts.title")}</th>
                    <th className="num">{t("agents.generated")}</th>
                    <th className="num">{t("agents.paidOut")}</th>
                    <th className="num">{t("agents.owed")}</th>
                    <th>{t("agents.rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const generated = toCents(r.generated);
                    const paid = toCents(r.paid);
                    return (
                      <tr key={r.agent.id}>
                        <td>
                          <div className="font-semibold">{r.agent.name}</div>
                          <div className="text-xs text-slate-500">
                            {[r.agent.company, r.agent.email, r.agent.phone].filter(Boolean).join(" . ")}
                          </div>
                          {!r.agent.isActive ? <Pill tone="warn">inactive</Pill> : null}
                        </td>
                        <td className="num">{r.contracts}</td>
                        <td className="num">{formatMoney(generated, locale)}</td>
                        <td className="num">{formatMoney(paid, locale)}</td>
                        <td className="num font-semibold">{formatMoney(generated - paid, locale)}</td>
                        <td>
                          <form
                            action={updateAgentRate.bind(null, r.agent.id)}
                            className="flex items-center gap-1"
                          >
                            <input
                              name="commissionRate"
                              defaultValue={Number(r.agent.commissionRate).toString()}
                              className="input !w-16 !py-1 !text-xs"
                              aria-label={t("agents.rate")}
                            />
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" name="isActive" defaultChecked={r.agent.isActive} />
                              active
                            </label>
                            <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                              {t("common.save")}
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Changing a rate here affects contracts created afterwards. A contract can also carry its own
              rate, set on the contract page.
            </p>
          </Card>
        </div>

        <Card title={t("agents.new")}>
          <form action={createAgent} className="space-y-3">
            <div>
              <label className="label" htmlFor="name">
                {t("common.name")}
              </label>
              <input id="name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="company">
                {t("agents.company")}
              </label>
              <input id="company" name="company" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="email">
                {t("common.email")}
              </label>
              <input id="email" name="email" type="email" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="phone">
                {t("common.phone")}
              </label>
              <input id="phone" name="phone" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="commissionRate">
                {t("agents.rate")}
              </label>
              <input id="commissionRate" name="commissionRate" defaultValue="3" className="input" />
            </div>
            <button type="submit" className="btn btn-primary w-full">
              {t("common.add")}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
