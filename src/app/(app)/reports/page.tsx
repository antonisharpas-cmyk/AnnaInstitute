import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount } from "@/lib/money";
import { ageing, cashByMonth, headline, monthLabel, rangeFrom, salesByMonth } from "@/lib/reports";
import { Card, PageHeader } from "@/components/ui";
import { BarSeries, Figure, SERIES, shortMoney } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels, periodQuery } from "./labels";

const REPORTS: { href: string; title: MessageKey; note: MessageKey }[] = [
  { href: "/reports/sales", title: "reports.sales", note: "reports.salesNote" },
  { href: "/reports/money", title: "reports.money", note: "reports.moneyNote" },
  { href: "/reports/agents", title: "reports.agents", note: "reports.agentsNote" },
  { href: "/reports/leads", title: "reports.leadsReport", note: "reports.leadsNote" },
  { href: "/reports/marketing", title: "reports.marketing", note: "reports.marketingNote" },
  { href: "/reports/costs", title: "reports.costs", note: "reports.costsNote" },
  { href: "/reports/portfolio", title: "reports.portfolio", note: "reports.portfolioNote" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const { range, period } = rangeFrom(params);

  const [figures, sales, cash, late] = await Promise.all([
    headline(range),
    salesByMonth(range),
    cashByMonth(range),
    ageing(),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const labels = sales.map((row) => monthLabel(row.month, locale));

  return (
    <>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />

      <PeriodPicker
        basePath="/reports"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label={t("reports.signed")}
          value={String(figures.salesCount)}
          hint={`${money(figures.salesValueCents)} ${t("reports.inPeriod")}`}
        />
        <Figure
          label={t("reports.collected")}
          value={money(figures.money.collectedCents)}
          hint={`${money(figures.money.outstandingCents)} ${t("reports.outstanding").toLowerCase()}`}
        />
        <Figure
          label={t("reports.overdue")}
          value={money(late.overdueCents)}
          tone={late.overdueCents > 0 ? "bad" : "good"}
          hint={
            <Link href="/reports/money" className="hover:underline">
              {t("reports.ageing")}
            </Link>
          }
        />
        <Figure
          label={t("reports.availableStock")}
          value={String(figures.stock.available)}
          hint={`${money(figures.stock.availableValueCents)} ${t(
            "reports.availableValue",
          ).toLowerCase()}`}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("reports.monthlyValue")}>
          <BarSeries
            labels={labels}
            series={[
              {
                label: t("reports.signedValue"),
                colour: SERIES.primary,
                values: sales.map((row) => row.valueCents),
                format: shortMoney,
              },
            ]}
          />
        </Card>

        <Card title={t("reports.cashflow")}>
          <BarSeries
            labels={cash.map((row) => monthLabel(row.month, locale))}
            series={[
              {
                label: t("reports.due"),
                colour: SERIES.primary,
                values: cash.map((row) => row.dueCents),
                format: shortMoney,
              },
              {
                label: t("reports.paid"),
                colour: SERIES.secondary,
                values: cash.map((row) => row.paidCents),
                format: shortMoney,
              },
            ]}
          />
        </Card>
      </div>

      <Card title={t("reports.title")}>
        <ul className="divide-y divide-brand-line">
          {REPORTS.map((report) => (
            <li key={report.href}>
              <Link
                href={report.href}
                className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-brand-teal-soft/40"
              >
                <span>
                  <span className="text-sm font-semibold text-brand-teal-dark">
                    {t(report.title)}
                  </span>
                  <span className="ml-3 text-xs text-brand-graphite/60">{t(report.note)}</span>
                </span>
                <span className="text-xs text-brand-graphite/60">{t("reports.open")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-4 text-xs text-brand-graphite/50">
        {`${t("reports.period")}: ${range.from.toISOString().slice(0, 10)} . ${range.to
          .toISOString()
          .slice(0, 10)}`}
        {periodQuery(params) ? "" : ""}
      </p>
    </>
  );
}
