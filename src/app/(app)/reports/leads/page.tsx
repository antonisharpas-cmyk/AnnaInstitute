import { getTranslator, type MessageKey } from "@/i18n";
import { leadFunnel, leadsByMonth, leadsBySource, monthLabel, rangeFrom } from "@/lib/reports";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { BarSeries, Breakdown, Figure, Funnel, SERIES } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels, periodQuery } from "../labels";

export default async function LeadsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const { range, period } = rangeFrom(params);

  const [monthly, sources, funnel] = await Promise.all([
    leadsByMonth(range),
    leadsBySource(range),
    leadFunnel(range),
  ]);

  const query = periodQuery(params);
  const rate = funnel.arrived > 0 ? Math.round((funnel.converted / funnel.arrived) * 100) : 0;
  const buying = funnel.arrived > 0 ? Math.round((funnel.bought / funnel.arrived) * 100) : 0;

  return (
    <>
      <BackLink
        href="/reports"
        label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`}
      />
      <PageHeader title={t("reports.leadsReport")} subtitle={t("reports.leadsNote")} />

      <PeriodPicker
        basePath="/reports/leads"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        exportHref={`/reports/export?report=leads${query ? `&${query}` : ""}`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t("reports.funnel.arrived")} value={String(funnel.arrived)} />
        <Figure label={t("reports.funnel.converted")} value={String(funnel.converted)} />
        <Figure label={t("reports.conversion")} value={`${rate}%`} />
        <Figure
          label={t("reports.funnel.bought")}
          value={String(funnel.bought)}
          hint={`${buying}% ${t("reports.funnel.arrived").toLowerCase()}`}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("reports.leadsMonthly")}>
          <BarSeries
            labels={monthly.map((row) => monthLabel(row.month, locale))}
            series={[
              {
                label: t("reports.arrived"),
                colour: SERIES.primary,
                values: monthly.map((row) => row.arrived),
                format: (v) => String(Math.round(v)),
              },
              {
                label: t("reports.converted"),
                colour: SERIES.secondary,
                values: monthly.map((row) => row.converted),
                format: (v) => String(Math.round(v)),
              },
            ]}
          />
        </Card>

        <Card title={t("reports.funnel")}>
          <Funnel
            steps={[
              { label: t("reports.funnel.arrived"), value: funnel.arrived },
              { label: t("reports.funnel.answered"), value: funnel.answered },
              { label: t("reports.funnel.qualified"), value: funnel.qualified },
              { label: t("reports.funnel.converted"), value: funnel.converted },
              { label: t("reports.funnel.bought"), value: funnel.bought },
            ]}
          />
        </Card>
      </div>

      <Card title={t("reports.bySource")}>
        <Breakdown
          empty={t("reports.noData")}
          rows={sources.map((row) => ({
            label: t(`leads.source.${row.source}` as MessageKey),
            value: row.total,
            display: String(row.total),
            note: `${row.converted} ${t("reports.converted").toLowerCase()}`,
          }))}
        />
      </Card>
    </>
  );
}
