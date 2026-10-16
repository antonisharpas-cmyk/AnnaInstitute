import { Fragment } from "react";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount } from "@/lib/money";
import { many } from "@/lib/filters";
import { monthLabel, rangeFrom } from "@/lib/reports";
import { VAT_PARTS, VAT_SIDE, vatReport, type VatTotals } from "@/lib/vatReport";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { BarSeries, Figure, SERIES, shortMoney } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import Pagination, { paginate } from "@/components/Pagination";
import { periodLabels } from "../labels";

/* One Eleven's own books have no company id; in the address they travel by name. */
const OWN = "oneEleven";
const idOf = (value: string) => (value === OWN ? "" : value);

/**
 * VAT.
 *
 * The VAT our companies charged against the VAT they were charged, month by
 * month with a total for each quarter, so the office sees before each return
 * whether VAT is to be paid or claimed back. Read company by company, since
 * each company makes its own return.
 */
export default async function VatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; companies?: string; page?: string }>;
}) {
  const params = await searchParams;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();
  const { range, period } = rangeFrom(params);
  const chosen = many(params.companies);
  const { page, perPage, offset } = paginate(params as Record<string, string | undefined>, 10);

  const report = await vatReport(range, chosen.map(idOf));
  const money = (cents: number) => formatAmount(cents, locale);
  const part = (key: (typeof VAT_PARTS)[number]) => t(`vat.part.${key}` as MessageKey);
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");
  const monthName = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { month: "long", year: "numeric" });
  };

  /* What the balance means: VAT to pay when positive, to claim back when negative. */
  const balance = report.totals.balance;
  const balanceWord = (cents: number) => (cents > 0 ? t("vat.toPay") : cents < 0 ? t("vat.toClaim") : t("vat.even"));

  /* The months in quarters, each quarter with its total, as the returns are made. */
  const quarterOf = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    return `${y} Q${Math.floor((m - 1) / 3) + 1}`;
  };
  const quarters = [...new Set(report.months.map((row) => quarterOf(row.month)))];
  const quarterTotal = (quarter: string): VatTotals => {
    const rows = report.months.filter((row) => quarterOf(row.month) === quarter);
    const sum = (pick: (row: VatTotals) => number) => rows.reduce((a, row) => a + pick(row), 0);
    return {
      ...(Object.fromEntries(VAT_PARTS.map((key) => [key, sum((row) => row[key])])) as Record<(typeof VAT_PARTS)[number], number>),
      charged: sum((row) => row.charged),
      paid: sum((row) => row.paid),
      balance: sum((row) => row.balance),
    };
  };

  const cells = (row: VatTotals) => (
    <>
      <td className="num whitespace-nowrap">{money(row.sales)}</td>
      <td className="num whitespace-nowrap">{money(row.companyInvoices)}</td>
      <td className="num whitespace-nowrap">{row.credits > 0 ? `${money(-row.credits)}` : money(0)}</td>
      <td className="num whitespace-nowrap font-semibold">{money(row.charged)}</td>
      <td className="num whitespace-nowrap">{money(row.bills)}</td>
      <td className="num whitespace-nowrap">{money(row.constructors)}</td>
      <td className="num whitespace-nowrap">{money(row.agents)}</td>
      <td className="num whitespace-nowrap font-semibold">{money(row.paid)}</td>
      <td className={`num whitespace-nowrap font-semibold ${row.balance > 0 ? "text-[color:var(--color-negative)]" : row.balance < 0 ? "text-[color:var(--color-positive)]" : ""}`}>
        {money(Math.abs(row.balance))}
        <div className="text-xs font-normal text-brand-graphite/60">{balanceWord(row.balance)}</div>
      </td>
    </>
  );

  const headings = (
    <>
      <th className="num !whitespace-normal align-bottom">{part("sales")}</th>
      <th className="num !whitespace-normal align-bottom">{part("companyInvoices")}</th>
      <th className="num !whitespace-normal align-bottom">{part("credits")}</th>
      <th className="num !whitespace-normal align-bottom">{t("vat.charged")}</th>
      <th className="num !whitespace-normal align-bottom">{part("bills")}</th>
      <th className="num !whitespace-normal align-bottom">{part("constructors")}</th>
      <th className="num !whitespace-normal align-bottom">{part("agents")}</th>
      <th className="num !whitespace-normal align-bottom">{t("vat.paid")}</th>
      <th className="num !whitespace-normal align-bottom">{t("vat.balance")}</th>
    </>
  );

  const lines = report.lines.slice(offset, offset + perPage);

  return (
    <>
      <BackLink href="/reports" label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`} />
      <PageHeader title={t("vat.reportTitle")} subtitle={t("vat.reportNote")} />

      <PeriodPicker
        basePath="/reports/vat"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        exportHref={`/reports/export?report=vat${params.period ? `&period=${params.period}` : ""}${params.from ? `&from=${params.from}` : ""}${params.to ? `&to=${params.to}` : ""}${params.companies ? `&companies=${encodeURIComponent(params.companies)}` : ""}`}
        extras={[
          {
            name: "companies",
            label: t("vat.companies"),
            chosen: chosen.join(","),
            anything: t("vat.everyCompany"),
            choices: report.companyChoices.map((one) => ({ value: one.id || OWN, label: one.name })),
          },
        ]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3" data-vat-figures>
        <Figure label={t("vat.charged")} value={money(report.totals.charged)} hint={t("vat.chargedHint")} />
        <Figure label={t("vat.paid")} value={money(report.totals.paid)} hint={t("vat.paidHint")} />
        <Figure
          label={balanceWord(balance)}
          value={money(Math.abs(balance))}
          hint={t("vat.balanceHint")}
          tone={balance > 0 ? "bad" : balance < 0 ? "good" : undefined}
        />
      </div>

      <div className="mb-4">
        <Card title={t("vat.monthly")}>
          <BarSeries
            empty={t("reports.noData")}
            labels={report.months.map((row) => monthLabel(row.month, locale))}
            series={[
              { label: t("vat.charged"), colour: SERIES.primary, values: report.months.map((row) => row.charged), format: shortMoney },
              { label: t("vat.paid"), colour: SERIES.secondary, values: report.months.map((row) => row.paid), format: shortMoney },
            ]}
          />
        </Card>
      </div>

      <div className="mb-4">
        <Card title={t("vat.byMonth")} flush>
          {report.months.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto" data-vat-months>
              <table className="data text-xs">
                <thead>
                  <tr>
                    <th>{t("dash.month")}</th>
                    {headings}
                  </tr>
                </thead>
                <tbody>
                  {quarters.map((quarter) => (
                    <Fragment key={quarter}>
                      {report.months
                        .filter((row) => quarterOf(row.month) === quarter)
                        .map((row) => (
                          <tr key={row.month}>
                            <td className="!whitespace-nowrap capitalize">{monthName(row.month)}</td>
                            {cells(row)}
                          </tr>
                        ))}
                      <tr className="bg-brand-surface font-semibold" data-quarter={quarter}>
                        <td className="whitespace-nowrap">
                          {quarter} {t("common.total").toLowerCase()}
                        </td>
                        {cells(quarterTotal(quarter))}
                      </tr>
                    </Fragment>
                  ))}
                  {quarters.length > 1 ? (
                    <tr className="font-semibold">
                      <td>{t("common.total")}</td>
                      {cells(report.totals)}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="mb-4">
        <Card title={t("vat.byCompany")} flush>
          {report.companies.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto" data-vat-companies>
              <table className="data text-xs">
                <thead>
                  <tr>
                    <th>{t("vat.company")}</th>
                    {headings}
                  </tr>
                </thead>
                <tbody>
                  {report.companies.map((row) => (
                    <tr key={row.id || OWN}>
                      <td className="font-semibold">{row.name}</td>
                      {cells(row)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title={`${t("vat.everyLine")} (${report.lines.length})`} flush>
        {lines.length === 0 ? (
          <Empty message={t("reports.noData")} />
        ) : (
          <div className="overflow-x-auto" data-vat-lines>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("vat.company")}</th>
                  <th>{t("vat.kind")}</th>
                  <th>{t("vat.number")}</th>
                  <th>{t("vat.party")}</th>
                  <th className="num">{t("vat.beforeVat")}</th>
                  <th className="num">{t("vat.vat")}</th>
                  <th className="num">{t("vat.withVat")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key}>
                    <td className="whitespace-nowrap">{day(line.date)}</td>
                    <td>{line.company}</td>
                    <td>
                      <Pill tone={line.part === "credits" ? "warn" : VAT_SIDE[line.part] === "charged" ? "good" : "neutral"}>{part(line.part)}</Pill>
                    </td>
                    <td className="whitespace-nowrap">{line.number}</td>
                    <td>
                      {line.party}
                      {line.about ? <div className="text-xs text-brand-graphite/60">{line.about}</div> : null}
                    </td>
                    <td className="num whitespace-nowrap">{money(line.netCents)}</td>
                    <td className="num whitespace-nowrap font-semibold">{money(line.part === "credits" ? -line.vatCents : line.vatCents)}</td>
                    <td className="num whitespace-nowrap">{money(line.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 pb-3">
          <Pagination
            basePath="/reports/vat"
            params={params as Record<string, string | undefined>}
            info={{ page, perPage, total: report.lines.length }}
            labels={{ previous: t("common.previous"), next: t("common.next"), showing: t("common.showing"), of: t("common.of") }}
          />
        </div>
      </Card>
      <p className="mt-3 text-xs text-brand-graphite/60">{t("vat.how")}</p>
    </>
  );
}
