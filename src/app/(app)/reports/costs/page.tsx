import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent } from "@/lib/money";
import {
  cashEntriesByMonth,
  costsByCategory,
  costsByMonth,
  incomeAndCostsByProject,
  incomeExpenseLines,
  monthLabel,
  rangeFrom,
  projectsInScope,
  scopeChoices,
  scopeFrom,
} from "@/lib/reports";
import { expensesOwed } from "@/lib/expenses";
import Link from "next/link";
import { BackLink, Card, PageHeader, Pill } from "@/components/ui";
import Pagination, { paginate } from "@/components/Pagination";
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

  /* The invoices one by one at the end, ten to a page. */
  const { page, perPage, offset } = paginate(params as Record<string, string | undefined>, 10);
  const [costMonths, incomeMonths, costCategories, incomeCategories, byProject, owed, lines, cashMonths] = await Promise.all([
    costsByMonth(range, only, "IN"),
    costsByMonth(range, only, "OUT"),
    costsByCategory(range, only, "IN"),
    costsByCategory(range, only, "OUT"),
    incomeAndCostsByProject(range, only),
    expensesOwed(),
    incomeExpenseLines(range, only, perPage, offset),
    cashEntriesByMonth(range, only),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const sum = (rows: { billedCents: number }[]) => rows.reduce((a, row) => a + row.billedCents, 0);
  const income = sum(incomeMonths);
  const costs = sum(costMonths);
  /* Cash paid and received outside the invoices, counted beside them. */
  const cashIn = cashMonths.reduce((a, row) => a + row.inCents, 0);
  const cashOut = cashMonths.reduce((a, row) => a + row.outCents, 0);
  const result = income + cashIn - costs - cashOut;
  const query = periodQuery(params);
  const category = (code: string) => t(`invoices.category.${code}` as MessageKey);
  /* A development's Net Revenue: invoices and cash in, less invoices and cash out. */
  const net = (row: { incomeCents: number; costCents: number; cashInCents: number; cashOutCents: number }) =>
    row.incomeCents + row.cashInCents - row.costCents - row.cashOutCents;

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
        <Figure label={t("reports.cashIncome")} value={money(cashIn)} hint={t("reports.inPeriod")} />
        <Figure label={t("invoices.expenses")} value={money(costs)} hint={t("reports.inPeriod")} />
        <Figure label={t("reports.cashExpenses")} value={money(cashOut)} hint={t("reports.inPeriod")} />
        <Figure label={t("reports.incomeLessCosts")} value={money(result)} hint={t("reports.withCash")} tone={result >= 0 ? "good" : "bad"} />
        <Figure
          label={t("invoices.toReceive")}
          value={money(owed.owedToUsCents)}
          hint={owed.overdueToUs > 0 ? t("reports.overdueCount").replace("{n}", String(owed.overdueToUs)) : undefined}
          tone={owed.overdueToUs > 0 ? "warn" : undefined}
        />
        <Figure
          label={t("invoices.toPay")}
          value={money(owed.owedCents)}
          hint={owed.overdue > 0 ? t("reports.overdueCount").replace("{n}", String(owed.overdue)) : undefined}
          tone={owed.overdue > 0 ? "warn" : undefined}
        />
      </div>

      <div className="mb-4">
        <Card title={t("reports.incomeMonthly")}>
          <BarSeries
            empty={t("reports.noData")}
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
              /* Cash beside the invoices, each its own bar. */
              ...(cashIn > 0 || cashOut > 0
                ? [
                    { label: t("reports.cashIncome"), colour: SERIES.third, values: cashMonths.map((row) => row.inCents), format: shortMoney },
                    { label: t("reports.cashExpenses"), colour: SERIES.fourth, values: cashMonths.map((row) => row.outCents), format: shortMoney },
                  ]
                : []),
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
                  <th className="ctr">{t("reports.cashIncome")}</th>
                  <th className="ctr">{t("invoices.expenses")}</th>
                  <th className="ctr">{t("reports.cashExpenses")}</th>
                  <th className="ctr">{t("reports.incomeLessCosts")}</th>
                </tr>
              </thead>
              <tbody>
                {byProject.map((row) => (
                  <tr key={row.projectId || "company"}>
                    <td>{row.name || t("invoices.noProject")}</td>
                    <td className="ctr">{money(row.incomeCents)}</td>
                    <td className="ctr">{money(row.cashInCents)}</td>
                    <td className="ctr">{money(row.costCents)}</td>
                    <td className="ctr">{money(row.cashOutCents)}</td>
                    <td className={`ctr font-semibold ${net(row) < 0 ? "text-[color:var(--color-negative)]" : ""}`}>
                      {money(net(row))}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">{t("invoices.total")}</td>
                  <td className="ctr font-semibold">{money(byProject.reduce((a, row) => a + row.incomeCents, 0))}</td>
                  <td className="ctr font-semibold">{money(byProject.reduce((a, row) => a + row.cashInCents, 0))}</td>
                  <td className="ctr font-semibold">{money(byProject.reduce((a, row) => a + row.costCents, 0))}</td>
                  <td className="ctr font-semibold">{money(byProject.reduce((a, row) => a + row.cashOutCents, 0))}</td>
                  <td className="ctr font-semibold">{money(byProject.reduce((a, row) => a + net(row), 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-4">
        <Card title={`${t("reports.everyInvoice")} (${lines.total})`} flush>
          {lines.rows.length === 0 ? (
            <p className="p-4 text-sm text-brand-graphite/60">{t("reports.noData")}</p>
          ) : (
            <div className="overflow-x-auto" data-income-lines>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("reports.incomeOrExpense")}</th>
                    <th>{t("invoices.from")} / {t("invoices.to")}</th>
                    <th>{t("invoices.number")}</th>
                    <th>{t("invoices.category")}</th>
                    <th>{t("projects.title")}</th>
                    <th className="num">{t("vat.beforeVat")}</th>
                    <th className="num">{t("vat.vat")}</th>
                    <th className="num">{t("vat.withVat")}</th>
                    <th className="num">{t("reports.paidSoFar")}</th>
                    <th className="num">{t("reports.stillOwed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{row.at.toLocaleDateString(locale === "el" ? "el-GR" : "en-GB")}</td>
                      <td>
                        <Pill tone={row.income ? "good" : "neutral"}>
                          {row.cash
                            ? row.income
                              ? t("reports.kindCashIncome")
                              : t("reports.kindCashExpense")
                            : row.income
                              ? t("reports.kindIncome")
                              : t("reports.kindExpense")}
                        </Pill>
                      </td>
                      <td>
                        <Link href={row.cash ? `/invoices/cash/${row.id}` : `/invoices/${row.id}`} className="hover:underline">
                          {row.who}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{row.number}</td>
                      <td>{row.category === "OTHER" && row.categoryOther ? row.categoryOther : category(row.category)}</td>
                      <td className="text-xs">{row.developments || t("invoices.noProject")}</td>
                      <td className="num whitespace-nowrap">{money(row.netCents)}</td>
                      <td className="num whitespace-nowrap">
                        {money(row.vatCents)}
                        {row.vatRate !== null ? (
                          <div className="text-xs text-brand-graphite/60">{formatPercent(row.vatRate, locale)}</div>
                        ) : null}
                      </td>
                      <td className="num whitespace-nowrap font-semibold">{money(row.totalCents)}</td>
                      <td className="num whitespace-nowrap">{money(row.paidCents)}</td>
                      <td className={`num whitespace-nowrap ${row.owedCents > 0 ? "font-semibold" : "text-brand-graphite/40"}`}>
                        {money(row.owedCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 pb-3">
            <Pagination
              basePath="/reports/costs"
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
