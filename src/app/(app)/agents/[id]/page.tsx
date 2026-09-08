import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  clients,
  commissionPayments,
  commissions,
  contractUnits,
  contracts,
  projects,
  units,
} from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import { deleteCommissionPayment, recordCommissionPayment } from "../actions";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const found = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  const agent = found[0];
  if (!agent) notFound();

  const [earned, paidOut] = await Promise.all([
    db
      .select({
        commission: commissions,
        contract: contracts,
        unit: units,
        project: projects,
        client: clients,
      })
      .from(commissions)
      .leftJoin(contractUnits, eq(contractUnits.id, commissions.assignmentId))
      .leftJoin(contracts, eq(contracts.id, contractUnits.contractId))
      .leftJoin(units, eq(units.id, contractUnits.unitId))
      .leftJoin(projects, eq(projects.id, units.projectId))
      .leftJoin(clients, eq(clients.id, contractUnits.clientId))
      .where(eq(commissions.agentId, id))
      .orderBy(desc(commissions.createdAt)),
    db
      .select()
      .from(commissionPayments)
      .where(eq(commissionPayments.agentId, id))
      .orderBy(desc(commissionPayments.paidOn)),
  ]);

  const generated = earned.reduce((a, r) => a + toCents(r.commission.amount), 0);
  const paid = paidOut.reduce((a, p) => a + toCents(p.amount), 0);

  return (
    <>
      <BackLink href="/agents" label={`${t("common.backTo")} ${t("agents.title").toLowerCase()}`} />
      <PageHeader
        title={agent.name}
        subtitle={[agent.company, agent.email, agent.phone].filter(Boolean).join(" . ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={agent.isActive ? "good" : "warn"}>
              {agent.isActive ? t("agents.active") : t("agents.inactive")}
            </Pill>
            <Link href={`/agents/${id}/edit`} className="btn btn-secondary">
              {t("common.edit")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("agents.rate")}
          value={formatPercent(Number(agent.commissionRate), locale)}
        />
        <Stat label={t("agents.sales")} value={String(earned.length)} />
        <Stat label={t("agents.generated")} value={formatAmount(generated, locale)} />
        <Stat label={t("agents.owed")} value={formatAmount(generated - paid, locale)} />
      </div>

      <div className="space-y-4">
        <Card title={t("agents.generated")}>
          {earned.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("contracts.title")}</th>
                    <th>{t("commissions.sale")}</th>
                    <th className="ctr">{t("commissions.base")}</th>
                    <th className="ctr">{t("agents.rate")}</th>
                    <th className="ctr">{t("contracts.amount")}</th>
                    <th className="ctr">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {earned.map((r) => (
                    <tr key={r.commission.id}>
                      <td>
                        {r.contract ? (
                          <Link
                            href={`/contracts/${r.contract.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold hover:underline"
                          >
                            {r.contract.reference}
                          </Link>
                        ) : (
                          ""
                        )}
                      </td>
                      <td>
                        {r.project && r.unit ? `${r.project.name} ${r.unit.code}` : ""}
                        {r.client ? (
                          <div className="text-xs text-brand-graphite/60">
                            {r.client.firstName} {r.client.lastName}
                          </div>
                        ) : null}
                      </td>
                      <td className="ctr">
                        {formatAmount(toCents(r.commission.baseAmount), locale)}
                      </td>
                      <td className="ctr">{formatPercent(Number(r.commission.rate), locale)}</td>
                      <td className="ctr font-semibold">
                        {formatAmount(toCents(r.commission.amount), locale)}
                      </td>
                      <td className="ctr">
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
            </div>
          )}
        </Card>

        <Card title={t("agents.paidOut")}>
          <div className="mb-4">
            <Disclosure showLabel={t("agents.recordPayment")} hideLabel={t("common.cancel")}>
              <form
                action={recordCommissionPayment}
                className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2"
              >
                <input type="hidden" name="agentId" value={id} />
                <div>
                  <label className="label" htmlFor="commissionId">
                    {t("commissions.sale")}
                  </label>
                  <select id="commissionId" name="commissionId" className="select">
                    <option value="">not against one sale</option>
                    {earned
                      .filter((r) => r.commission.status !== "PAID")
                      .map((r) => (
                        <option key={r.commission.id} value={r.commission.id}>
                          {r.contract?.reference ?? ""} {r.unit?.code ?? ""} .{" "}
                          {formatAmount(toCents(r.commission.amount), locale)}
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
                    {t("commissions.reference")}
                  </label>
                  <input id="reference" name="reference" className="input" />
                </div>
                <div className="flex items-end sm:col-span-2">
                  <button type="submit" className="btn btn-primary">
                    {t("common.save")}
                  </button>
                </div>
              </form>
            </Disclosure>
          </div>

          {paidOut.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th className="ctr">{t("contracts.amount")}</th>
                  <th>{t("commissions.reference")}</th>
                  <th className="ctr">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {paidOut.map((p) => (
                  <tr key={p.id}>
                    <td>{day(p.paidOn)}</td>
                    <td className="ctr">{formatAmount(toCents(p.amount), locale)}</td>
                    <td>{p.reference ?? ""}</td>
                    <td className="ctr">
                      <form action={deleteCommissionPayment.bind(null, p.id, id)}>
                        <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                          {t("common.delete")}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {agent.notes ? (
          <Card title={t("common.notes")}>
            <p className="whitespace-pre-line text-sm">{agent.notes}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
