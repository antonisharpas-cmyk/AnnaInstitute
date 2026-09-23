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
import { BackLink, Card, Empty, PageHeader } from "@/components/ui";
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
  const rows = await salesByAgent(range, only, ours);
  const money = (cents: number) => formatAmount(cents, locale);
  const query = periodQuery(params);

  const sold = rows.reduce((a, row) => a + row.valueCents, 0);
  const generated = rows.reduce((a, row) => a + row.generatedCents, 0);
  const paid = rows.reduce((a, row) => a + row.paidCents, 0);

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
        <Figure label={t("agents.generated")} value={money(generated)} />
        <Figure label={t("agents.paidOut")} value={money(paid)} />
        <Figure
          label={t("agents.owed")}
          value={money(generated - paid)}
          tone={generated - paid > 0 ? "warn" : "good"}
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
                value: row.generatedCents,
                display: money(row.generatedCents),
                note: `${money(row.owedCents)} ${t("agents.owed").toLowerCase()}`,
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
                    <td className="ctr">{row.sales}</td>
                    <td className="ctr">{money(row.valueCents)}</td>
                    <td className="ctr">{money(row.generatedCents)}</td>
                    <td className="ctr">{money(row.paidCents)}</td>
                    <td className="ctr font-semibold">{money(row.owedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
