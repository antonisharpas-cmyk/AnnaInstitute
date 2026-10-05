import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount } from "@/lib/money";
import {
  costsByCategory,
  costsByMonth,
  incomeAndCostsByProject,
  monthLabel,
  rangeFrom,
  projectsInScope,
  scopeChoices,
  scopeFrom,
} from "@/lib/reports";
import { expensesOwed } from "@/lib/expenses";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { BarSeries, Breakdown, Figure, SERIES, shortMoney } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels, periodQuery } from "../labels";

/**
 * Income and expenses: what our companies charged under Company, against what
 * they were billed, by month, by category and by development. The sales of the
 * apartments have their own reports; this is everything else.
 */
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

  const [costMonths, incomeMonths, costCategories, incomeCategories, byProject, owed] = await Promise.all([
    costsByMonth(range, only, "IN"),
    costsByMonth(range, only, "OUT"),
    costsByCategory(range, only, "IN"),
    costsByCategory(range, only, "OUT"),
    incomeAndCostsByProject(range, only),
    expensesOwed(),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const sum = (rows: { billedCents: number }[]) => rows.reduce((a, row) => a + row.billedCents, 0);
  const income = sum(incomeMonths);
  const costs = sum(costMonths);
  const result = income - costs;
  const query = periodQuery(params);
  const category = (code: string) => t(`invoices.category.${code}` as MessageKey);

  return (
    <>
      <BackLink href="/reports" label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`} />
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

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-income-figures>
        <Figure label={t("invoices.income")} value={money(income)} hint={t("reports.inPeriod")} />
        <Figure label={t("invoices.expenses")} value={money(costs)} hint={t("reports.inPeriod")} />
        <Figure label={t("reports.incomeLessCosts")} value={money(result)} tone={result >= 0 ? "good" : "bad"} />
        <Figure
          label={t("invoices.toReceive")}
          value={money(owed.owedToUsCents)}
          hint={`${t("invoices.toPay")}: ${money(owed.owedCents)}`}
          tone={owed.overdueToUs > 0 || owed.overdue > 0 ? "warn" : undefined}
        />
      </div>

      <div className="mb-4">
        <Card title={t("reports.incomeMonthly")}>
          <BarSeries
            labels={incomeMonths.map((row) => monthLabel(row.month, locale))}
            series={[
              {
                label: t("invoices.income"),
                colour: SERIES.primary,
                values: incomeMonths.map((row) => row.billedCents),
                format: shortMoney,
              },
              {
                label: t("invoices.expenses"),
                colour: SERIES.secondary,
                values: costMonths.map((row) => row.billedCents),
                format: shortMoney,
              },
            ]}
          />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title={`${t("invoices.income")}: ${t("reports.byCategory").toLowerCase()}`}>
          <Breakdown
            empty={t("reports.noData")}
            rows={incomeCategories.map((row) => ({
              label: category(row.category),
              value: row.billedCents,
              display: money(row.billedCents),
              note: `${row.count} . ${money(row.owedCents)} ${t("invoices.toReceive").toLowerCase()}`,
            }))}
          />
        </Card>
        <Card title={`${t("invoices.expenses")}: ${t("reports.byCategory").toLowerCase()}`}>
          <Breakdown
            empty={t("reports.noData")}
            colour={SERIES.secondary}
            rows={costCategories.map((row) => ({
              label: category(row.category),
              value: row.billedCents,
              display: money(row.billedCents),
              note: `${row.count} . ${money(row.owedCents)} ${t("invoices.toPay").toLowerCase()}`,
            }))}
          />
        </Card>
      </div>

      <Card title={t("reports.incomeByDevelopment")}>
        {byProject.length === 0 ? (
          <p className="text-sm text-brand-graphite/60">{t("reports.noData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data" data-income-by-project>
              <thead>
                <tr>
                  <th>{t("projects.title")}</th>
                  <th className="ctr">{t("invoices.income")}</th>
                  <th className="ctr">{t("invoices.expenses")}</th>
                  <th className="ctr">{t("reports.incomeLessCosts")}</th>
                </tr>
              </thead>
              <tbody>
                {byProject.map((row) => (
                  <tr key={row.projectId || "company"}>
                    <td>{row.name || t("invoices.noProject")}</td>
                    <td className="ctr">{money(row.incomeCents)}</td>
                    <td className="ctr">{money(row.costCents)}</td>
                    <td className={`ctr font-semibold ${row.incomeCents - row.costCents < 0 ? "text-[color:var(--color-negative)]" : ""}`}>
                      {money(row.incomeCents - row.costCents)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">{t("invoices.total")}</td>
                  <td className="ctr font-semibold">{money(byProject.reduce((a, row) => a + row.incomeCents, 0))}</td>
                  <td className="ctr font-semibold">{money(byProject.reduce((a, row) => a + row.costCents, 0))}</td>
                  <td className="ctr font-semibold">{money(byProject.reduce((a, row) => a + row.incomeCents - row.costCents, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
