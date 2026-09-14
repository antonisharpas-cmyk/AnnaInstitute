import Link from "next/link";
import { getTranslator } from "@/i18n";
import { formatAmount, formatPercent } from "@/lib/money";
import { monthLabel, rangeFrom, salesByAgent, salesByMonth, salesByProject } from "@/lib/reports";
import { BackLink, Card, Empty, PageHeader } from "@/components/ui";
import { BarSeries, Breakdown, Figure, SERIES, shortMoney } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels, periodQuery } from "../labels";

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const { range, period } = rangeFrom(params);

  const [monthly, byProject, byAgent] = await Promise.all([
    salesByMonth(range),
    salesByProject(),
    salesByAgent(range),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const signed = monthly.reduce((a, row) => a + row.count, 0);
  const value = monthly.reduce((a, row) => a + row.valueCents, 0);
  const best = [...byProject].sort((a, b) => b.sold - a.sold)[0];
  const query = periodQuery(params);

  return (
    <>
      <BackLink
        href="/reports"
        label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`}
      />
      <PageHeader title={t("reports.sales")} subtitle={t("reports.salesNote")} />

      <PeriodPicker
        basePath="/reports/sales"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        exportHref={`/reports/export?report=projects${query ? `&${query}` : ""}`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t("reports.signed")} value={String(signed)} />
        <Figure label={t("reports.signedValue")} value={money(value)} />
        <Figure
          label={t("reports.sellThrough")}
          value={`${byProject.reduce((a, r) => a + r.sold, 0)} / ${byProject.reduce(
            (a, r) => a + r.total,
            0,
          )}`}
          hint={best ? `${best.project.name} ${t("reports.sellThrough").toLowerCase()}` : undefined}
        />
        <Figure
          label={t("reports.availableValue")}
          value={money(byProject.reduce((a, r) => a + r.listCents - r.soldListCents, 0))}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("reports.monthlySales")}>
          <BarSeries
            labels={monthly.map((row) => monthLabel(row.month, locale))}
            series={[
              {
                label: t("reports.signed"),
                colour: SERIES.primary,
                values: monthly.map((row) => row.count),
                format: (v) => String(Math.round(v)),
              },
            ]}
          />
        </Card>

        <Card title={t("reports.monthlyValue")}>
          <BarSeries
            labels={monthly.map((row) => monthLabel(row.month, locale))}
            series={[
              {
                label: t("reports.signedValue"),
                colour: SERIES.primary,
                values: monthly.map((row) => row.valueCents),
                format: shortMoney,
              },
            ]}
          />
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={t("reports.byProject")}>
          {byProject.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("projects.title")}</th>
                    <th className="ctr">{t("reports.stock")}</th>
                    <th className="ctr">{t("reports.sellThrough")}</th>
                    <th className="ctr">{t("reports.listPrice")}</th>
                    <th className="ctr">{t("reports.soldValue")}</th>
                    <th className="ctr">{t("reports.difference")}</th>
                    <th className="ctr">{t("reports.perSquareMetre")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((row) => (
                    <tr key={row.project.id}>
                      <td>
                        <Link
                          href={`/projects/${row.project.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {row.project.name}
                        </Link>
                        <div className="text-xs text-brand-graphite/60">
                          {row.project.location ?? ""}
                        </div>
                      </td>
                      <td className="ctr">
                        {row.total}
                        <div className="text-xs text-brand-graphite/60">
                          {row.available} {t("dash.available").toLowerCase()}, {row.reserved}{" "}
                          reserved
                        </div>
                      </td>
                      <td className="ctr">
                        {row.sold}
                        <div className="text-xs text-brand-graphite/60">
                          {formatPercent(row.sellThrough * 100, locale)}
                        </div>
                      </td>
                      <td className="ctr">{money(row.listCents)}</td>
                      <td className="ctr">{money(row.contractedCents)}</td>
                      <td className="ctr">
                        {row.differenceCents === 0 ? (
                          ""
                        ) : (
                          <span
                            className={
                              row.differenceCents > 0
                                ? "font-semibold text-[color:var(--color-positive)]"
                                : "font-semibold text-[color:var(--color-negative)]"
                            }
                          >
                            {row.differenceCents > 0 ? "+" : ""}
                            {money(row.differenceCents)}
                          </span>
                        )}
                      </td>
                      <td className="ctr">
                        {row.perSquareMetre > 0 ? money(row.perSquareMetre) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t("reports.byAgent")}>
          <Breakdown
            empty={t("reports.noData")}
            rows={byAgent
              .filter((row) => row.sales > 0)
              .sort((a, b) => b.valueCents - a.valueCents)
              .map((row) => ({
                label: row.agent.name,
                value: row.valueCents,
                display: money(row.valueCents),
                note: `${row.sales} ${row.sales === 1 ? "sale" : "sales"}`,
              }))}
          />
        </Card>
      </div>
    </>
  );
}
