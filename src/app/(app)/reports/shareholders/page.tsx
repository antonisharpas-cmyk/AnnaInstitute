import { Fragment } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { subowners } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, formatPercent } from "@/lib/money";
import { many } from "@/lib/filters";
import { rangeFrom } from "@/lib/reports";
import { shareholderChoices, whoFrom, type Who } from "@/lib/ownership";
import { LEDGER_COLUMNS, LEDGER_SIGN, netOf, shareholderReport, type Ledger } from "@/lib/shareholderReport";
import { BackLink, Card, Empty, PageHeader } from "@/components/ui";
import { Figure } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels } from "../labels";

/** Whole euros, for tables with many money columns. */
const euros = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale === "el" ? "el-GR" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  );

/**
 * Shareholders and companies.
 *
 * Every development's money, in and out, VAT included, and the part of it that
 * belongs to the companies and shareholders chosen: month by month with a
 * total for each year, then development by development, each ending in its
 * Net Revenue. Several companies and several shareholders can be chosen; none
 * chosen is the whole of every development.
 */
export default async function ShareholdersReportPage({
  searchParams,
}: {
  searchParams: Promise<{ companies?: string; holders?: string; period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();
  const picked = rangeFrom({ ...params, period: params.period ?? (params.from || params.to ? undefined : "all") });
  const period = picked.period;
  const range = period === "all" ? { from: new Date(2000, 0, 1), to: new Date(2100, 0, 1) } : picked.range;

  const companyIds = many(params.companies);
  /* A shareholder travels as "holder:" and their name, encoded, so a comma in a name cannot split it. */
  const holderValues = many(params.holders);
  const holders = holderValues
    .map((value) => whoFrom(value.startsWith("holder:") ? `holder:${decodeURIComponent(value.slice(7))}` : value))
    .filter((who): who is Who => who !== null);

  const [holderChoices, companies, report] = await Promise.all([
    shareholderChoices(),
    db.select({ id: subowners.id, name: subowners.name }).from(subowners).orderBy(asc(subowners.name)),
    shareholderReport(range, companyIds, holders),
  ]);

  const money = (cents: number) => euros(cents, locale);
  const percent = (fraction: number) => formatPercent(Math.round(fraction * 100000) / 1000, locale);
  const tone = (cents: number) => (cents < 0 ? "text-[color:var(--color-negative)]" : cents > 0 ? "" : "text-brand-graphite/40");
  const column = (key: (typeof LEDGER_COLUMNS)[number]) => t(`ledger.${key}` as MessageKey);

  const moneyIn = LEDGER_COLUMNS.filter((key) => LEDGER_SIGN[key] > 0).reduce((sum, key) => sum + report.totals[key], 0);
  const moneyOut = LEDGER_COLUMNS.filter((key) => LEDGER_SIGN[key] < 0).reduce((sum, key) => sum + report.totals[key], 0);
  const net = netOf(report.totals);

  /* Month rows, with a total under each year's months. */
  const years = [...new Set(report.months.map((row) => row.year))];
  const yearTotal = (year: number): Ledger => {
    const out = Object.fromEntries(LEDGER_COLUMNS.map((key) => [key, 0])) as Ledger;
    for (const row of report.months.filter((one) => one.year === year)) for (const key of LEDGER_COLUMNS) out[key] += row.part[key];
    return out;
  };
  const monthName = (year: number, month: number) =>
    new Date(year, month - 1, 1).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { month: "long", year: "numeric" });

  const cells = (ledger: Ledger, strong = false) => (
    <>
      {LEDGER_COLUMNS.map((key) => (
        <td key={key} className={`num whitespace-nowrap ${tone(ledger[key])}`}>
          {money(ledger[key])}
        </td>
      ))}
      <td className={`num whitespace-nowrap font-semibold ${strong ? "" : ""} ${netOf(ledger) < 0 ? "text-[color:var(--color-negative)]" : ""}`}>
        {money(netOf(ledger))}
      </td>
    </>
  );

  const headings = (
    <>
      {LEDGER_COLUMNS.map((key) => (
        <th key={key} className="num !whitespace-normal align-bottom">
          {column(key)}
        </th>
      ))}
      <th className="num !whitespace-normal align-bottom">{t("reports.incomeLessCosts")}</th>
    </>
  );

  return (
    <>
      <BackLink href="/reports" label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`} />
      <PageHeader title={t("reports.shareholders")} subtitle={t("reports.shareholdersNote")} />

      <PeriodPicker
        basePath="/reports/shareholders"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        defaultPeriod="all"
        extras={[
          {
            name: "companies",
            label: t("subowners.title"),
            chosen: companyIds.join(","),
            anything: t("reports.everyPartner"),
            choices: companies.map((one) => ({ value: one.id, label: one.name })),
          },
          {
            name: "holders",
            label: t("reports.shareholdersFilter"),
            chosen: holderValues.join(","),
            anything: t("reports.everyShareholder"),
            choices: holderChoices.map((one) => ({
              value: one.value.startsWith("holder:") ? `holder:${encodeURIComponent(one.value.slice(7))}` : one.value,
              label: one.label,
            })),
          },
        ]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3" data-shareholder-totals>
        <Figure label={t("reports.moneyIn")} value={formatAmount(moneyIn, locale)} tone="good" />
        <Figure label={t("reports.moneyOut")} value={formatAmount(moneyOut, locale)} tone={moneyOut < 0 ? "bad" : undefined} />
        <Figure label={t("reports.incomeLessCosts")} value={formatAmount(net, locale)} tone={net >= 0 ? "good" : "bad"} />
      </div>

      <div className="mb-4">
        <Card title={t("reports.shareMonthly")} flush>
          {report.months.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto" data-shareholder-months>
              <table className="data text-xs">
                <thead>
                  <tr>
                    <th>{t("dash.month")}</th>
                    {headings}
                  </tr>
                </thead>
                <tbody>
                  {years.map((year) => (
                    <Fragment key={year}>
                      {report.months
                        .filter((row) => row.year === year)
                        .map((row) => (
                          <tr key={row.key}>
                            <td className="!whitespace-nowrap capitalize">{monthName(row.year, row.month)}</td>
                            {cells(row.part)}
                          </tr>
                        ))}
                      <tr className="bg-brand-surface font-semibold" data-year-total={year}>
                        <td className="whitespace-nowrap">
                          {year} {t("common.total").toLowerCase()}
                        </td>
                        {cells(yearTotal(year), true)}
                      </tr>
                    </Fragment>
                  ))}
                  {years.length > 1 ? (
                    <tr className="font-semibold">
                      <td>{t("common.total")}</td>
                      {cells(report.totals, true)}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title={t("reports.shareByDevelopment")} flush>
        {report.rows.length === 0 ? (
          <Empty message={t("reports.holdsNothing")} />
        ) : (
          <div className="overflow-x-auto" data-shareholder-rows>
            <table className="data text-xs">
              <thead>
                <tr>
                  <th>{t("projects.title")}</th>
                  <th className="num">{t("subowners.share")}</th>
                  {headings}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.projectId} data-project={row.projectName}>
                    <td>
                      <span className="font-semibold">{row.projectName}</span>
                      <div className="text-brand-graphite/60">
                        {row.via
                          .map((line) =>
                            line.via
                              ? `${percent(line.share)} ${t("subowners.throughCompany")} ${line.via}`
                              : `${percent(line.share)} ${t("subowners.directly")}`,
                          )
                          .join(" + ")}
                      </div>
                    </td>
                    <td className="num font-semibold" data-share>
                      {percent(row.share)}
                    </td>
                    {LEDGER_COLUMNS.map((key) => (
                      <td key={key} className="num whitespace-nowrap">
                        <div className={`font-semibold ${tone(row.part[key])}`}>{money(row.part[key])}</div>
                        {(key === "commissions" ? row.commissionShare : row.share) < 1 ? (
                          <div className="text-brand-graphite/50">
                            {t("reports.ofFull")} {money(row.full[key])}
                          </div>
                        ) : null}
                      </td>
                    ))}
                    <td className={`num whitespace-nowrap font-semibold ${netOf(row.part) < 0 ? "text-[color:var(--color-negative)]" : ""}`}>
                      {money(netOf(row.part))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td>{t("common.total")}</td>
                  <td />
                  {cells(report.totals, true)}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-brand-graphite/60">{t("reports.ledgerHow")}</p>
    </>
  );
}
