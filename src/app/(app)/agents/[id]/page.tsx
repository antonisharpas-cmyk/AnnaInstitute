import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, commissionPayments } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { amountForInput } from "@/lib/money";
import { commissionTotals, salesOfAgent } from "@/lib/commissions";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import {
  addExtra,
  deleteCommissionPayment,
  payLine,
  recordCommissionPayment,
  removeCommissionLine,
  setSaleRate,
} from "../actions";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const found = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  const agent = found[0];
  if (!agent) notFound();

  const [sales, paidOut, totals] = await Promise.all([
    salesOfAgent(id),
    db
      .select()
      .from(commissionPayments)
      .where(eq(commissionPayments.agentId, id))
      .orderBy(desc(commissionPayments.paidOn)),
    commissionTotals(id),
  ]);

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
        <Stat label={t("agents.sales")} value={String(sales.length)} />
        <Stat label={t("agents.generated")} value={formatAmount(totals.generatedCents, locale)} />
        <Stat label={t("agents.owed")} value={formatAmount(totals.outstandingCents, locale)} />
      </div>

      <div className="space-y-4">
        {/* What he sold, and what each sale earns him. */}
        <Card title={t("agents.sales")}>
          {sales.length === 0 ? (
            <Empty message={t("agents.noSales")} />
          ) : (
            <div className="space-y-4">
              {sales.map((sale) => (
                <div
                  key={sale.contract.id}
                  className="rounded border border-brand-line bg-white px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/contracts/${sale.contract.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-brand-teal-dark hover:underline"
                      >
                        {sale.project && sale.unit
                          ? `${sale.project.name} ${sale.unit.code}`
                          : sale.contract.reference}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {sale.client ? `${sale.client.firstName} ${sale.client.lastName} . ` : ""}
                        {sale.contract.reference}
                      </div>
                      <div className="mt-1 text-xs text-brand-graphite/60">
                        {t("agents.soldFor")} {formatAmount(sale.soldCents, locale)}
                        {sale.listPriceCents > 0
                          ? ` . ${t("agents.listedAt")} ${formatAmount(sale.listPriceCents, locale)}`
                          : ""}
                        {sale.differenceCents > 0 ? (
                          <span className="ml-1 font-semibold text-[color:var(--color-positive)]">
                            +{formatAmount(sale.differenceCents, locale)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* The rate for this sale alone, when a better one was promised. */}
                    <form
                      action={setSaleRate.bind(null, sale.contract.id, id)}
                      className="flex items-end gap-2"
                    >
                      <div>
                        <label className="label" htmlFor={`rate-${sale.contract.id}`}>
                          {t("agents.rateOnThisSale")}
                        </label>
                        <input
                          id={`rate-${sale.contract.id}`}
                          name="rate"
                          defaultValue={
                            sale.contract.commissionRate ? Number(sale.contract.commissionRate) : ""
                          }
                          placeholder={String(Number(agent.commissionRate))}
                          className="input !w-20 !py-1 !text-xs"
                        />
                      </div>
                      <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                        {t("common.save")}
                      </button>
                    </form>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>{t("commissions.line")}</th>
                          <th className="ctr">{t("commissions.base")}</th>
                          <th className="ctr">{t("agents.rate")}</th>
                          <th className="ctr">{t("contracts.amount")}</th>
                          <th className="ctr">{t("agents.paidOut")}</th>
                          <th className="ctr">{t("common.status")}</th>
                          <th className="ctr">{t("common.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sale.lines.map((line) => (
                          <tr key={line.id}>
                            <td>
                              {line.kind === "RATE"
                                ? t("commissions.onThePrice")
                                : (line.label ?? t("commissions.extra"))}
                            </td>
                            <td className="ctr">
                              {line.kind === "RATE" ? formatAmount(line.baseCents, locale) : ""}
                            </td>
                            <td className="ctr">
                              {line.kind === "RATE" ? formatPercent(line.rate, locale) : ""}
                            </td>
                            <td className="ctr font-semibold">
                              {formatAmount(line.amountCents, locale)}
                            </td>
                            <td className="ctr">{formatAmount(line.paidCents, locale)}</td>
                            <td className="ctr">
                              <Pill
                                tone={
                                  line.outstandingCents <= 0
                                    ? "good"
                                    : line.paidCents > 0
                                      ? "warn"
                                      : "neutral"
                                }
                              >
                                {line.outstandingCents <= 0
                                  ? t("commissions.settled")
                                  : t("commissions.owed")}
                              </Pill>
                            </td>
                            <td className="ctr">
                              <div className="flex flex-wrap justify-center gap-1">
                                {line.outstandingCents > 0 ? (
                                  <form action={payLine.bind(null, line.id, id)}>
                                    <button
                                      type="submit"
                                      className="btn btn-secondary !px-2 !py-1 !text-xs"
                                    >
                                      {t("commissions.markPaid")}
                                    </button>
                                  </form>
                                ) : null}
                                {line.kind === "EXTRA" && line.paidCents === 0 ? (
                                  <form action={removeCommissionLine.bind(null, line.id, id)}>
                                    <button
                                      type="submit"
                                      className="btn btn-secondary !px-2 !py-1 !text-xs"
                                    >
                                      {t("common.delete")}
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3}>{t("agents.generated")}</td>
                          <td className="ctr font-semibold">
                            {formatAmount(sale.generatedCents, locale)}
                          </td>
                          <td className="ctr">{formatAmount(sale.paidCents, locale)}</td>
                          <td className="ctr" colSpan={2}>
                            {t("agents.owed")} {formatAmount(sale.outstandingCents, locale)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-3">
                    <Disclosure
                      showLabel={t("commissions.addExtra")}
                      hideLabel={t("common.cancel")}
                      tone="secondary"
                    >
                      <form
                        action={addExtra.bind(null, sale.contract.id)}
                        className="flex flex-wrap items-end gap-2 rounded border border-brand-line bg-brand-surface p-3"
                      >
                        <div>
                          <label className="label" htmlFor={`label-${sale.contract.id}`}>
                            {t("commissions.whatFor")}
                          </label>
                          <input
                            id={`label-${sale.contract.id}`}
                            name="label"
                            defaultValue={
                              sale.differenceCents > 0 ? t("commissions.aboveThePrice") : ""
                            }
                            placeholder={t("commissions.aboveThePrice")}
                            className="input !w-64 !py-1 !text-xs"
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor={`extra-${sale.contract.id}`}>
                            {t("contracts.amount")}
                          </label>
                          <input
                            id={`extra-${sale.contract.id}`}
                            name="amount"
                            required
                            defaultValue={
                              sale.differenceCents > 0
                                ? amountForInput(sale.differenceCents / 100)
                                : ""
                            }
                            className="input !w-28 !py-1 !text-xs"
                          />
                        </div>
                        <button type="submit" className="btn btn-primary !px-3 !py-1 !text-xs">
                          {t("common.add")}
                        </button>
                        <p className="w-full text-xs text-brand-graphite/60">
                          {t("commissions.extraNote")}
                        </p>
                      </form>
                    </Disclosure>
                  </div>
                </div>
              ))}
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
                    <option value="">not against one line</option>
                    {sales.flatMap((sale) =>
                      sale.lines
                        .filter((l) => l.outstandingCents > 0)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {sale.project && sale.unit
                              ? `${sale.project.name} ${sale.unit.code}`
                              : sale.contract.reference}{" "}
                            . {l.kind === "RATE" ? t("commissions.onThePrice") : (l.label ?? "")} .{" "}
                            {formatAmount(l.outstandingCents, locale)}
                          </option>
                        )),
                    )}
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
                  <DateField id="paidOn" name="paidOn" />
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
