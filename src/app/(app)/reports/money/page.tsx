import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount } from "@/lib/money";
import { ageing, cashByMonth, monthLabel, moneyTotals, rangeFrom, upcoming, projectsInScope, scopeChoices, scopeFrom } from "@/lib/reports";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { BarSeries, Breakdown, Figure, SERIES, shortMoney } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels, periodQuery } from "../labels";

const day = (value: Date) => new Date(value).toISOString().slice(0, 10);

export default async function MoneyReportPage({
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

  const [cash, totals, late, next] = await Promise.all([
    cashByMonth(range, only),
    moneyTotals(only),
    ageing(only),
    upcoming(12, only),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const query = periodQuery(params);
  const collectedInPeriod = cash.reduce((a, row) => a + row.paidCents, 0);
  const dueInPeriod = cash.reduce((a, row) => a + row.dueCents, 0);

  return (
    <>
      <BackLink
        href="/reports"
        label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`}
      />
      <PageHeader title={t("reports.money")} subtitle={t("reports.moneyNote")} />

      <PeriodPicker
        basePath="/reports/money"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        scope={{ ...scope, ...choices }}
        exportHref={`/reports/export?report=ageing${query ? `&${query}` : ""}`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label={t("reports.scheduled")}
          value={money(totals.scheduledTotalCents)}
          hint={`${money(totals.scheduledVatCents)} VAT`}
        />
        <Figure
          label={t("reports.collected")}
          value={money(totals.collectedCents)}
          hint={`${money(collectedInPeriod)} ${t("reports.inPeriod")}`}
        />
        <Figure
          label={t("reports.outstanding")}
          value={money(totals.outstandingCents)}
          hint={`${money(dueInPeriod)} ${t("reports.due").toLowerCase()} ${t("reports.inPeriod")}`}
        />
        <Figure
          label={t("reports.overdue")}
          value={money(late.overdueCents)}
          tone={late.overdueCents > 0 ? "bad" : "good"}
          hint={`${late.lines.length} ${late.lines.length === 1 ? "line" : "lines"}`}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
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

        <Card title={t("reports.upcoming")}>
          <BarSeries
            labels={next.map((row) => monthLabel(row.month, locale))}
            series={[
              {
                label: t("reports.due"),
                colour: SERIES.primary,
                values: next.map((row) => row.cents),
                format: shortMoney,
              },
            ]}
          />
        </Card>
      </div>

      <div className="space-y-4">
        <Card title={t("reports.ageing")}>
          <p className="mb-3 text-xs text-brand-graphite/60">{t("reports.ageingNote")}</p>
          <Breakdown
            empty={t("reports.noData")}
            colour={SERIES.secondary}
            rows={late.buckets
              .filter((bucket) => bucket.cents > 0)
              .map((bucket) => ({
                label: t(`reports.bucket.${bucket.key}` as MessageKey),
                value: bucket.cents,
                display: money(bucket.cents),
                note: `${bucket.count} ${bucket.count === 1 ? "line" : "lines"}`,
              }))}
          />
        </Card>

        <Card title={t("reports.worstLines")}>
          {late.lines.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("contracts.client")}</th>
                    <th>{t("contracts.unit")}</th>
                    <th>{t("contracts.stage")}</th>
                    <th className="ctr">{t("contracts.due")}</th>
                    <th className="ctr">{t("reports.daysLate")}</th>
                    <th className="ctr">{t("reports.outstanding")}</th>
                  </tr>
                </thead>
                <tbody>
                  {late.lines.slice(0, 25).map((line) => (
                    <tr key={line.id}>
                      <td>{line.client}</td>
                      <td>{line.where}</td>
                      <td className="text-xs">{line.label}</td>
                      <td className="ctr text-xs">{day(line.dueDate)}</td>
                      <td className="ctr">
                        <Pill tone={line.days > 90 ? "bad" : line.days > 30 ? "warn" : "neutral"}>
                          {line.days}
                        </Pill>
                      </td>
                      <td className="ctr font-semibold">{money(line.outstandingCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
