import Link from "next/link";
import { getTranslator } from "@/i18n";
import { formatAmount, formatPercent } from "@/lib/money";
import {
  commissionsAreOurs,
  projectsInScope,
  rangeFrom,
  salesByAgent,
  scopeChoices,
  scopeFrom,
} from "@/lib/reports";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import Pagination, { paginate } from "@/components/Pagination";
import { commissionLines } from "@/lib/agentReport";
import { Breakdown, Figure, SERIES } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels, periodQuery } from "../labels";

export default async function AgentsReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    project?: string;
    partner?: string;
    holder?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const { range, period } = rangeFrom(params);
  /* Whose money, and which building. Nothing chosen is the whole book. */
  const scope = scopeFrom(params);
  const [only, choices] = await Promise.all([projectsInScope(scope), scopeChoices()]);

  /* A commission is the partner company's expense, not One Eleven's, so a page
     narrowed to our own books shows the sales without it. */
  const ours = commissionsAreOurs(scope);
  /* Every commission line at the end, ten to a page, newest first. */
  const { page, perPage, offset } = paginate(params as Record<string, string | undefined>, 10);
  const [rows, lines] = await Promise.all([salesByAgent(range, only, ours), commissionLines(range, only, perPage, offset)]);
  const day = (value: Date) => value.toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");
  const money = (cents: number) => formatAmount(cents, locale);
  const query = periodQuery(params);

  const sold = rows.reduce((a, row) => a + row.valueCents, 0);
  const generated = rows.reduce((a, row) => a + row.generatedCents, 0);
  const paid = rows.reduce((a, row) => a + row.paidCents, 0);
  /* With the agents' VAT on them, which is what is invoiced and what went out. */
  const generatedTotal = rows.reduce((a, row) => a + row.generatedTotalCents, 0);
  const paidTotal = rows.reduce((a, row) => a + row.paidTotalCents, 0);
  const beforeVat = (cents: number) => `${money(cents)} ${t("vat.beforeVatShort")}`;

  return (
    <>
      <BackLink
        href="/reports"
        label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`}
      />
      <PageHeader title={t("reports.agents")} subtitle={t("reports.agentsNote")} />

      {ours ? null : (
        <div className="card mb-4 p-3 text-sm text-brand-graphite/70">
          {t("reports.commissionNotOurs")}
        </div>
      )}

      <PeriodPicker
        basePath="/reports/agents"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        scope={{ ...scope, ...choices }}
        exportHref={`/reports/export?report=agents${query ? `&${query}` : ""}`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t("reports.signedValue")} value={money(sold)} />
        <Figure label={t("agents.generated")} value={money(generatedTotal)} hint={beforeVat(generated)} />
        <Figure label={t("agents.paidOut")} value={money(paidTotal)} hint={beforeVat(paid)} />
        <Figure
          label={t("agents.owed")}
          value={money(generatedTotal - paidTotal)}
          hint={beforeVat(generated - paid)}
          tone={generatedTotal - paidTotal > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mb-4">
        <Card title={t("reports.byAgent")}>
          <Breakdown
            empty={t("reports.noData")}
            colour={SERIES.primary}
            rows={rows
              .filter((row) => row.generatedCents > 0 || row.valueCents > 0)
              .sort((a, b) => b.generatedCents - a.generatedCents)
              .map((row) => ({
                label: row.agent.name,
                value: row.generatedTotalCents,
                display: money(row.generatedTotalCents),
                note: `${money(row.owedTotalCents)} ${t("agents.owed").toLowerCase()}`,
              }))}
          />
        </Card>
      </div>

      <Card title={t("agents.title")}>
        {rows.length === 0 ? (
          <Empty message={t("reports.noData")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th className="ctr">{t("agents.rate")}</th>
                  <th className="ctr">{t("agents.vatRate")}</th>
                  <th className="ctr">{t("agents.sales")}</th>
                  <th className="ctr">{t("reports.signedValue")}</th>
                  <th className="ctr">{t("agents.generated")}</th>
                  <th className="ctr">{t("agents.paidOut")}</th>
                  <th className="ctr">{t("agents.owed")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.agent.id}>
                    <td>
                      <Link
                        href={`/agents/${row.agent.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:underline"
                      >
                        {row.agent.name}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {row.agent.company ?? ""}
                      </div>
                    </td>
                    <td className="ctr">
                      {formatPercent(Number(row.agent.commissionRate), locale)}
                    </td>
                    <td className="ctr">{formatPercent(Number(row.agent.vatRate), locale)}</td>
                    <td className="ctr">{row.sales}</td>
                    <td className="ctr">{money(row.valueCents)}</td>
                    {/* With VAT, and before VAT under it. */}
                    {[
                      [row.generatedTotalCents, row.generatedCents],
                      [row.paidTotalCents, row.paidCents],
                      [row.owedTotalCents, row.owedCents],
                    ].map(([withVat, before], index) => (
                      <td key={index} className={`ctr whitespace-nowrap${index === 2 ? " font-semibold" : ""}`}>
                        {money(withVat)}
                        <div className="text-xs font-normal text-brand-graphite/60">{beforeVat(before)}</div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4">
        <Card title={`${t("reports.everyCommission")} (${lines.total})`} flush>
          {lines.rows.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto" data-commission-lines>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("reports.agentWord")}</th>
                    <th>{t("reports.saleWord")}</th>
                    <th>{t("reports.commissionWhat")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("reports.agentInvoice")}</th>
                    <th>{t("reports.agentReceipt")}</th>
                    <th className="num">{t("vat.beforeVat")}</th>
                    <th className="num">{t("vat.vat")}</th>
                    <th className="num">{t("vat.withVat")}</th>
                    <th className="num">{t("agents.paidOut")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.rows.map((row) => {
                    /* The agent's invoice is expected of every line that stands, the receipt once money was paid; nothing of history. */
                    const paper = (has: boolean, expected: boolean) =>
                      has ? (
                        <Pill tone="good">{t("reports.paperIn")}</Pill>
                      ) : expected && !row.history ? (
                        <Pill tone="bad">{t("reports.paperMissing")}</Pill>
                      ) : (
                        <span className="text-brand-graphite/40">{t("reports.paperNotYet")}</span>
                      );
                    return (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap">{day(row.at)}</td>
                        <td>
                          <Link href={`/agents/${row.agentId}`} className="hover:underline">
                            {row.agent}
                          </Link>
                        </td>
                        <td>
                          {row.contractId ? (
                            <Link href={`/contracts/${row.contractId}`} className="hover:underline">
                              {[row.project, row.unit].filter(Boolean).join(" ")}
                            </Link>
                          ) : (
                            ""
                          )}
                        </td>
                        <td>
                          {row.kind === "EXTRA" ? row.label || t("reports.commissionExtra") : t("reports.commissionRate")}
                          {row.history ? (
                            <span className="ml-1">
                              <Pill>{t("history.pill")}</Pill>
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <Pill tone={row.standing === "PAID" ? "good" : row.standing === "CANCELLED" ? "neutral" : "warn"}>
                            {row.standing === "PAID"
                              ? t("commissions.paidFilter")
                              : row.standing === "PARTIALLY_PAID"
                                ? t("commissions.partiallyPaid")
                                : row.standing === "CANCELLED"
                                  ? t("commissions.cancelled")
                                  : t("commissions.pending")}
                          </Pill>
                        </td>
                        <td>{paper(row.hasInvoice, row.standing !== "CANCELLED")}</td>
                        <td>{paper(row.hasReceipt, row.paid > 0)}</td>
                        <td className="num whitespace-nowrap">{money(row.cents)}</td>
                        <td className="num whitespace-nowrap">
                          {money(row.vatCents)}
                          <div className="text-xs text-brand-graphite/60">{formatPercent(row.vatRate, locale)}</div>
                        </td>
                        <td className="num whitespace-nowrap font-semibold">{money(row.totalCents)}</td>
                        <td className="num whitespace-nowrap">{money(row.paidTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 pb-3">
            <Pagination
              basePath="/reports/agents"
              params={params as Record<string, string | undefined>}
              info={{ page, perPage, total: lines.total }}
              labels={{
                previous: t("common.previous"),
                next: t("common.next"),
                showing: t("common.showing"),
                of: t("common.of"),
              }}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
