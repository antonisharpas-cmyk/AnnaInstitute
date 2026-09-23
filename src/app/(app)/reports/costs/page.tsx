import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount } from "@/lib/money";
import { costsByCategory, costsByMonth, monthLabel, rangeFrom, projectsInScope, scopeChoices, scopeFrom } from "@/lib/reports";
import { expensesOwed } from "@/lib/expenses";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { BarSeries, Breakdown, Figure, SERIES, shortMoney } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels, periodQuery } from "../labels";

export default async function CostsReportPage({
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

  const [monthly, categories, owed] = await Promise.all([
    costsByMonth(range, only),
    costsByCategory(range, only),
    expensesOwed(),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const billed = monthly.reduce((a, row) => a + row.billedCents, 0);
  const paid = monthly.reduce((a, row) => a + row.paidCents, 0);
  const query = periodQuery(params);

  return (
    <>
      <BackLink
        href="/reports"
        label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`}
      />
      <PageHeader title={t("reports.costs")} subtitle={t("reports.costsNote")} />

      <PeriodPicker
        basePath="/reports/costs"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        scope={{ ...scope, ...choices }}
        exportHref={`/reports/export?report=costs${query ? `&${query}` : ""}`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t("reports.billed")} value={money(billed)} hint={t("reports.inPeriod")} />
        <Figure label={t("invoices.paid")} value={money(paid)} />
        <Figure
          label={t("reports.costsOwed")}
          value={money(owed.owedCents)}
          tone={owed.owedCents > 0 ? "warn" : "good"}
        />
        <Figure
          label={t("invoices.overdue")}
          value={String(owed.overdue)}
          tone={owed.overdue > 0 ? "bad" : "good"}
        />
      </div>

      <div className="mb-4">
        <Card title={t("reports.costsMonthly")}>
          <BarSeries
            labels={monthly.map((row) => monthLabel(row.month, locale))}
            series={[
              {
                label: t("reports.billed"),
                colour: SERIES.primary,
                values: monthly.map((row) => row.billedCents),
                format: shortMoney,
              },
              {
                label: t("invoices.paid"),
                colour: SERIES.secondary,
                values: monthly.map((row) => row.paidCents),
                format: shortMoney,
              },
            ]}
          />
        </Card>
      </div>

      <Card title={t("reports.byCategory")}>
        <Breakdown
          empty={t("reports.noData")}
          rows={categories.map((row) => ({
            label: t(`invoices.category.${row.category}` as MessageKey),
            value: row.billedCents,
            display: money(row.billedCents),
            note: `${row.count} . ${money(row.owedCents)} ${t("invoices.owed").toLowerCase()}`,
          }))}
        />
      </Card>
    </>
  );
}
