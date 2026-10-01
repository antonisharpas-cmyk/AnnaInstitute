import { asc } from "drizzle-orm";
import { db } from "@/db";
import { subowners } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, formatPercent } from "@/lib/money";
import { rangeFrom } from "@/lib/reports";
import { shareholderChoices, whoFrom } from "@/lib/ownership";
import { shareholderReport } from "@/lib/shareholderReport";
import { BackLink, Card, Empty, PageHeader } from "@/components/ui";
import { Figure } from "@/components/charts";
import DateField from "@/components/DateField";

/**
 * What one shareholder, or one company, holds of the business.
 *
 * Choose One Eleven and every development shows One Eleven's part of it:
 * directly, and through its share of each company that holds the development.
 * Choose another shareholder and the same for them. Choose a company and it is
 * the company's own share of each development it holds.
 */
export default async function ShareholdersReportPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string; period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();
  const { range, period } = rangeFrom({ ...params, period: params.period ?? (params.from || params.to ? "custom" : "all") });
  const whoValue = params.who ?? "oneEleven";
  const who = whoFrom(whoValue) ?? { kind: "oneEleven" as const };

  const [holders, companies, report] = await Promise.all([
    shareholderChoices(),
    db.select({ id: subowners.id, name: subowners.name }).from(subowners).orderBy(asc(subowners.name)),
    shareholderReport(who, range),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const percent = (fraction: number) => formatPercent(Math.round(fraction * 100000) / 1000, locale);
  const whoLabel =
    holders.find((one) => one.value === whoValue)?.label ??
    companies.find((one) => `company:${one.id}` === whoValue)?.name ??
    "One Eleven";

  return (
    <>
      <BackLink href="/reports" label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`} />
      <PageHeader title={t("reports.shareholders")} subtitle={t("reports.shareholdersNote")} />

      <form method="get" action="/reports/shareholders" className="card mb-4 flex flex-wrap items-end gap-3 p-3" data-shareholder-form>
        <div>
          <label className="label" htmlFor="who">
            {t("reports.whose")}
          </label>
          <select id="who" name="who" defaultValue={whoValue} className="select !w-64">
            <optgroup label={t("subowners.shareholders")}>
              {holders.map((one) => (
                <option key={one.value} value={one.value}>
                  {one.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("subowners.title")}>
              {companies.map((one) => (
                <option key={one.id} value={`company:${one.id}`}>
                  {one.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="period">
            {t("reports.period")}
          </label>
          <select id="period" name="period" defaultValue={period} className="select !w-44">
            <option value="all">{t("reports.everything")}</option>
            <option value="ytd">{t("reports.thisYear")}</option>
            <option value="12m">{t("reports.last12")}</option>
            <option value="24m">{t("reports.last24")}</option>
            <option value="custom">{t("reports.fromDate")} . {t("reports.toDate")}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">
            {t("reports.fromDate")}
          </label>
          <DateField id="from" name="from" defaultValue={params.from ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="to">
            {t("reports.toDate")}
          </label>
          <DateField id="to" name="to" defaultValue={params.to ?? ""} />
        </div>
        <button type="submit" className="btn btn-primary">
          {t("reports.apply")}
        </button>
      </form>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-shareholder-totals>
        <Figure label={t("reports.shareSigned")} value={money(report.totals.signed)} hint={whoLabel} />
        <Figure label={t("reports.shareReceived")} value={money(report.totals.received)} />
        <Figure label={t("reports.shareCash")} value={money(report.totals.cash)} />
        <Figure label={t("reports.shareCosts")} value={money(report.totals.costs)} />
        <Figure label={t("reports.shareCommissions")} value={money(report.totals.commissions)} />
      </div>

      <Card title={`${whoLabel}: ${t("reports.byDevelopment")}`}>
        {report.rows.length === 0 ? (
          <Empty message={t("reports.holdsNothing")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data" data-shareholder-rows>
              <thead>
                <tr>
                  <th>{t("projects.title")}</th>
                  <th className="num">{t("subowners.share")}</th>
                  <th className="num">{t("reports.shareSigned")}</th>
                  <th className="num">{t("reports.shareReceived")}</th>
                  <th className="num">{t("reports.shareCash")}</th>
                  <th className="num">{t("reports.shareCosts")}</th>
                  <th className="num">{t("reports.shareCommissions")}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.projectId} data-project={row.projectName}>
                    <td>
                      <span className="font-semibold">{row.projectName}</span>
                      <div className="text-xs text-brand-graphite/60">
                        {row.via
                          .map((line) =>
                            line.via
                              ? `${percent(line.share)} ${t("subowners.throughCompany")} ${line.via}`
                              : `${percent(line.share)} ${t("subowners.directly")}`,
                          )
                          .join(" + ")}
                      </div>
                    </td>
                    <td className="num font-semibold" data-share>{percent(row.share)}</td>
                    {(["signed", "received", "cash", "costs", "commissions"] as const).map((key) => (
                      <td key={key} className="num">
                        <div className="font-semibold">{money(row.part[key])}</div>
                        <div className="text-xs text-brand-graphite/50">
                          {t("reports.ofFull")} {money(row.full[key])}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="font-semibold">{t("common.total")}</td>
                  <td />
                  <td className="num font-semibold">{money(report.totals.signed)}</td>
                  <td className="num font-semibold">{money(report.totals.received)}</td>
                  <td className="num font-semibold">{money(report.totals.cash)}</td>
                  <td className="num font-semibold">{money(report.totals.costs)}</td>
                  <td className="num font-semibold">{money(report.totals.commissions)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-brand-graphite/60">{t("reports.shareholdersHow")}</p>
      </Card>

      <p className="mt-4 text-xs text-brand-graphite/50">
        {`${t("reports.period")}: ${range.from.toISOString().slice(0, 10)} . ${range.to.toISOString().slice(0, 10)}`}
      </p>
    </>
  );
}
