import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, clients } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatMoney, toCents } from "@/lib/money";
import { listContracts, unitsWithoutContract } from "@/lib/contracts";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import { createContract } from "./actions";

export default async function ContractsPage() {
  const { locale, t } = await getTranslator();

  const [rows, units, clientList, agentList] = await Promise.all([
    listContracts(),
    unitsWithoutContract(),
    db.select().from(clients).orderBy(asc(clients.lastName)),
    db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.name)),
  ]);

  return (
    <>
      <PageHeader title={t("contracts.title")} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            {rows.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("contracts.reference")}</th>
                    <th>{t("contracts.client")}</th>
                    <th>{t("contracts.unit")}</th>
                    <th className="num">{t("common.total")}</th>
                    <th className="num">{t("contracts.paid")}</th>
                    <th className="num">{t("dash.outstanding")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.contract.id}>
                      <td>
                        <Link href={`/contracts/${r.contract.id}`} className="font-semibold hover:underline">
                          {r.contract.reference}
                        </Link>
                        <div className="mt-1">
                          <Pill>{r.contract.status.toLowerCase()}</Pill>
                        </div>
                      </td>
                      <td>
                        {r.client.firstName} {r.client.lastName}
                      </td>
                      <td>
                        {r.project.name} . {r.unit.code}
                      </td>
                      <td className="num">{formatMoney(r.scheduledCents, locale)}</td>
                      <td className="num">{formatMoney(r.paidCents, locale)}</td>
                      <td className="num font-semibold">{formatMoney(r.outstandingCents, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card title={t("contracts.new")}>
          {units.length === 0 || clientList.length === 0 ? (
            <p className="text-sm text-slate-500">
              Add at least one available unit and one client first.
            </p>
          ) : (
            <form action={createContract} className="space-y-3">
              <div>
                <label className="label" htmlFor="clientId">
                  {t("contracts.client")}
                </label>
                <select id="clientId" name="clientId" required className="select">
                  {clientList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.lastName} {c.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="unitId">
                  {t("contracts.unit")}
                </label>
                <select id="unitId" name="unitId" required className="select">
                  {units.map((u) => (
                    <option key={u.unit.id} value={u.unit.id}>
                      {u.project.name} . {u.unit.code} .{" "}
                      {formatMoney(toCents(u.unit.netPrice), locale)}
                      {u.holder ? ` . held by ${u.holder.lastName}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="agentId">
                  {t("contracts.agent")}
                </label>
                <select id="agentId" name="agentId" className="select">
                  <option value="">none</option>
                  {agentList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({Number(a.commissionRate)}%)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="contractDate">
                  {t("contracts.contractDate")}
                </label>
                <input id="contractDate" name="contractDate" type="date" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="netPrice">
                  {t("contracts.netPrice")}
                </label>
                <input id="netPrice" name="netPrice" required placeholder="200000" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="vatMode">
                  {t("contracts.vatSetup")}
                </label>
                <select id="vatMode" name="vatMode" className="select" defaultValue="single_reduced">
                  <option value="single_reduced">whole price at the reduced rate</option>
                  <option value="single_standard">whole price at the standard rate</option>
                  <option value="split">split between the two rates</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="reducedRate">
                    {t("contracts.vatReducedRate")}
                  </label>
                  <input id="reducedRate" name="reducedRate" defaultValue="5" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="standardRate">
                    {t("contracts.vatStandardRate")}
                  </label>
                  <input id="standardRate" name="standardRate" defaultValue="19" className="input" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="reducedBase">
                  {t("contracts.vatReducedBase")}
                </label>
                <input
                  id="reducedBase"
                  name="reducedBase"
                  placeholder="only for a split, for example 150000"
                  className="input"
                />
                <p className="mt-1 text-xs text-slate-500">
                  For a split the rest of the price is charged at the standard rate.
                </p>
              </div>
              <button type="submit" className="btn btn-primary w-full">
                {t("common.add")}
              </button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
