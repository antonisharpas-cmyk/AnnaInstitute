import Link from "next/link";
import { getTranslator } from "@/i18n";
import { campaignRows, consentTotals, messageTotals, rangeFrom } from "@/lib/reports";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { Breakdown, Figure, SERIES } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels } from "../labels";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function MarketingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getTranslator();
  const { range, period } = rangeFrom(params);

  const [messages, campaigns, consent] = await Promise.all([
    messageTotals(range),
    campaignRows(range),
    consentTotals(),
  ]);

  const byChannel = new Map<string, { handled: number; failed: number }>();
  for (const row of messages) {
    const found = byChannel.get(row.channel) ?? { handled: 0, failed: 0 };
    if (row.status === "SENT" || row.status === "SIMULATED") found.handled += row.total;
    else found.failed += row.total;
    byChannel.set(row.channel, found);
  }

  const handled = [...byChannel.values()].reduce((a, row) => a + row.handled, 0);
  const failed = [...byChannel.values()].reduce((a, row) => a + row.failed, 0);

  return (
    <>
      <BackLink
        href="/reports"
        label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`}
      />
      <PageHeader title={t("reports.marketing")} subtitle={t("reports.marketingNote")} />

      <PeriodPicker
        basePath="/reports/marketing"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t("reports.campaignsSent")} value={String(campaigns.length)} />
        <Figure label={t("reports.sentCount")} value={String(handled)} />
        <Figure
          label={t("reports.failedCount")}
          value={String(failed)}
          tone={failed > 0 ? "warn" : "good"}
        />
        <Figure
          label={t("reports.consented")}
          value={String(consent.consented)}
          hint={`${consent.total} ${t("clients.title").toLowerCase()}, ${consent.unsubscribed} ${t(
            "reports.unsubscribed",
          ).toLowerCase()}`}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("reports.messages")}>
          <Breakdown
            empty={t("reports.noData")}
            rows={[...byChannel.entries()].map(([channel, row]) => ({
              label: channel.toLowerCase(),
              value: row.handled,
              display: String(row.handled),
              note: row.failed > 0 ? `${row.failed} ${t("reports.failedCount").toLowerCase()}` : "",
            }))}
          />
        </Card>

        <Card title={t("reports.reachable")}>
          <Breakdown
            empty={t("reports.noData")}
            colour={SERIES.third}
            rows={[
              {
                label: t("reports.consented"),
                value: consent.consented,
                display: String(consent.consented),
              },
              {
                label: t("reports.withEmail"),
                value: consent.withEmail,
                display: String(consent.withEmail),
              },
              {
                label: t("reports.withPhone"),
                value: consent.withPhone,
                display: String(consent.withPhone),
              },
              {
                label: t("reports.unsubscribed"),
                value: consent.unsubscribed,
                display: String(consent.unsubscribed),
              },
            ]}
          />
        </Card>
      </div>

      <Card title={t("nav.campaigns")}>
        {campaigns.length === 0 ? (
          <Empty message={t("reports.noData")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("campaigns.whoGetsIt")}</th>
                  <th className="ctr">{t("campaigns.howToSend")}</th>
                  <th className="ctr">{t("reports.sentCount")}</th>
                  <th className="ctr">{t("reports.failedCount")}</th>
                  <th className="ctr">{t("common.status")}</th>
                  <th className="ctr">{t("common.date")}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr key={row.campaign.id}>
                    <td>
                      <Link
                        href={`/campaigns/${row.campaign.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:underline"
                      >
                        {row.campaign.title}
                      </Link>
                    </td>
                    <td className="text-xs">
                      {[
                        row.campaign.toClients || row.campaign.audience === "CLIENTS_CONSENTED"
                          ? t("campaigns.groupClients")
                          : null,
                        row.campaign.toAgents || row.campaign.audience === "AGENTS"
                          ? t("campaigns.groupAgents")
                          : null,
                        row.campaign.toSubowners || row.campaign.audience === "SUBOWNERS"
                          ? t("campaigns.groupSubowners")
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                    <td className="ctr text-xs">
                      {[
                        row.campaign.viaEmail ? t("campaigns.email") : null,
                        row.campaign.viaWhatsapp ? t("campaigns.whatsapp") : null,
                      ]
                        .filter(Boolean)
                        .join(" + ")}
                    </td>
                    <td className="ctr">{row.sent}</td>
                    <td className="ctr">{row.failed}</td>
                    <td className="ctr">
                      <Pill tone={row.campaign.status === "SENT" ? "good" : "neutral"}>
                        {row.campaign.status.replace(/_/g, " ").toLowerCase()}
                      </Pill>
                    </td>
                    <td className="ctr text-xs">
                      {day(row.campaign.sentAt ?? row.campaign.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
