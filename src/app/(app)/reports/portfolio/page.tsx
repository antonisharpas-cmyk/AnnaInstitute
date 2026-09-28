import { shownCode } from "@/lib/choices";
import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent } from "@/lib/money";
import { partnerPortfolio, salesByProject } from "@/lib/reports";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { Breakdown, Figure, SERIES } from "@/components/charts";

export default async function PortfolioReportPage() {
  const { locale, t } = await getTranslator();
  const [projects, partners] = await Promise.all([salesByProject(), partnerPortfolio()]);

  const money = (cents: number) => formatAmount(cents, locale);

  const total = projects.reduce((a, row) => a + row.total, 0);
  const sold = projects.reduce((a, row) => a + row.sold, 0);
  const available = projects.reduce((a, row) => a + row.available, 0);
  const listValue = projects.reduce((a, row) => a + row.listCents, 0);
  const availableValue = projects.reduce((a, row) => a + row.listCents - row.soldListCents, 0);

  return (
    <>
      <BackLink
        href="/reports"
        label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`}
      />
      <PageHeader title={t("reports.portfolio")} subtitle={t("reports.portfolioNote")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label={t("dash.units")}
          value={String(total)}
          hint={`${sold} ${t("dash.sold").toLowerCase()}, ${available} ${t(
            "dash.available",
          ).toLowerCase()}`}
        />
        <Figure label={t("reports.listPrice")} value={money(listValue)} />
        <Figure label={t("reports.availableValue")} value={money(availableValue)} />
        <Figure
          label={t("reports.sellThrough")}
          value={total > 0 ? formatPercent((sold / total) * 100, locale) : "0%"}
        />
      </div>

      <div className="space-y-4">
        <Card title={t("reports.stock")}>
          {projects.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("projects.title")}</th>
                    <th>{t("common.status")}</th>
                    <th className="ctr">{t("dash.units")}</th>
                    <th className="ctr">{t("dash.sold")}</th>
                    <th className="ctr">{t("dash.available")}</th>
                    <th className="ctr">{t("reports.listPrice")}</th>
                    <th className="ctr">{t("reports.availableValue")}</th>
                    <th className="ctr">{t("reports.perSquareMetre")}</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((row) => (
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
                      </td>
                      <td>
                        <Pill
                          tone={
                            row.project.status === "COMPLETED"
                              ? "good"
                              : row.project.status === "UNDER_CONSTRUCTION"
                                ? "warn"
                                : "neutral"
                          }
                        >
                          {t(`projects.status.${shownCode(row.project.status, row.project.statusChoice)}` as MessageKey)}
                        </Pill>
                      </td>
                      <td className="ctr">{row.total}</td>
                      <td className="ctr">{row.sold}</td>
                      <td className="ctr">{row.available}</td>
                      <td className="ctr">{money(row.listCents)}</td>
                      <td className="ctr">{money(row.listCents - row.soldListCents)}</td>
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

        <Card title={t("reports.partnerShare")}>
          <Breakdown
            empty={t("subowners.noneYet")}
            colour={SERIES.third}
            rows={partners.map((partner) => ({
              label: partner.name,
              value: partner.shareCents,
              display: money(partner.shareCents),
              note: `${partner.projects} ${
                partner.projects === 1
                  ? t("subowners.projects").toLowerCase().replace(/s$/, "")
                  : t("subowners.projects").toLowerCase()
              }`,
            }))}
          />
        </Card>
      </div>
    </>
  );
}
