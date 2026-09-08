import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, campaigns, documents, shareLinks } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { addressFor, channelConfigured, emailConfigured, fillPlaceholders } from "@/lib/messaging";
import { priceListUrl } from "@/lib/priceList";
import { isSuppressed } from "@/lib/suppression";
import { BackLink, Card, PageHeader, Pill, Stat } from "@/components/ui";
import { audienceFor, messagesForCampaign, sendCampaign } from "../actions";
import SendButton from "./SendButton";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  const campaign = rows[0];
  if (!campaign) notFound();

  const [attachments, recipients, log] = await Promise.all([
    db
      .select({ document: documents })
      .from(campaignDocuments)
      .innerJoin(documents, eq(documents.id, campaignDocuments.documentId))
      .where(eq(campaignDocuments.campaignId, id)),
    audienceFor(campaign.audience),
    messagesForCampaign(id),
  ]);

  let url: string | undefined;
  if (campaign.shareLinkId) {
    const linkRows = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.id, campaign.shareLinkId))
      .limit(1);
    if (linkRows[0]) url = priceListUrl(linkRows[0].token);
  }

  const checked = [];
  for (const recipient of recipients) {
    const address = addressFor(campaign.channel, recipient);
    const suppressed = address
      ? await isSuppressed(campaign.channel === "EMAIL" ? "EMAIL" : "PHONE", address)
      : false;
    checked.push({ ...recipient, address, suppressed });
  }

  const sendable = checked.filter((r) => r.address && !r.suppressed);
  const channelReady =
    campaign.channel === "EMAIL" ? emailConfigured() : channelConfigured(campaign.channel);
  const alreadySent = campaign.status !== "DRAFT";

  const preview = fillPlaceholders(campaign.body, {
    name: checked[0]?.name ?? "Name Surname",
    firstName: checked[0]?.firstName ?? "Name",
    priceListUrl: url,
  });

  return (
    <>
      <BackLink href="/campaigns" label={`${t("common.backTo")} ${t("nav.campaigns").toLowerCase()}`} />
      <PageHeader
        title={campaign.title}
        subtitle={`${campaign.channel.toLowerCase()} . ${
          campaign.audience === "AGENTS" ? "agents" : "clients with consent"
        }`}
        action={<Pill tone={campaign.status === "SENT" ? "good" : "neutral"}>{campaign.status.replace(/_/g, " ").toLowerCase()}</Pill>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="In the audience" value={String(checked.length)} />
        <Stat
          label="Will receive it"
          value={String(sendable.length)}
          hint="has an address and is not suppressed"
        />
        <Stat
          label="Skipped"
          value={String(checked.length - sendable.length)}
          hint="no address, or on the suppression list"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="The message as one recipient will see it">
            {campaign.subject ? (
              <p className="mb-2 text-sm font-semibold">{campaign.subject}</p>
            ) : null}
            <pre className="whitespace-pre-wrap font-sans text-sm text-brand-graphite">{preview}</pre>
            {campaign.audience === "CLIENTS_CONSENTED" ? (
              <p className="mt-3 border-t border-brand-line pt-3 text-xs text-brand-graphite/60">
                {campaign.channel === "EMAIL"
                  ? "An unsubscribe link is added to every email automatically."
                  : "Reply STOP to opt out is added to every message automatically, and a reply of stop suppresses that number for good."}
              </p>
            ) : null}
            {attachments.length > 0 ? (
              <ul className="mt-3 border-t border-brand-line pt-3 text-sm">
                {attachments.map((a) => (
                  <li key={a.document.id}>
                    <a
                      href={`/api/files/${a.document.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-teal-dark hover:underline"
                    >
                      {a.document.title}
                    </a>
                    {campaign.channel !== "EMAIL" ? (
                      <span className="ml-2 text-xs text-brand-graphite/60">
                        not sent on this channel, a text message cannot carry a file
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card title="Who receives it">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>Address</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {checked.map((r) => (
                  <tr key={`${r.clientId ?? r.agentId}`}>
                    <td>{r.name}</td>
                    <td className="break-all">{r.address ?? ""}</td>
                    <td>
                      {r.suppressed ? (
                        <Pill tone="bad">suppressed</Pill>
                      ) : r.address ? (
                        <Pill tone="good">will receive</Pill>
                      ) : (
                        <Pill tone="warn">no address</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {log.length > 0 ? (
            <Card title="What happened">
              <table className="data">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Channel</th>
                    <th>{t("common.status")}</th>
                    <th>Reference or reason</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((m) => (
                    <tr key={m.id}>
                      <td className="break-all">{m.toAddress}</td>
                      <td>{m.channel.toLowerCase()}</td>
                      <td>
                        <Pill
                          tone={
                            m.status === "SENT"
                              ? "good"
                              : m.status === "SIMULATED"
                                ? "warn"
                                : m.status === "SUPPRESSED"
                                  ? "neutral"
                                  : "bad"
                          }
                        >
                          {m.status.toLowerCase()}
                        </Pill>
                      </td>
                      <td className="text-xs">{m.providerId ?? m.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card title="Send">
            {alreadySent ? (
              <p className="text-sm text-brand-graphite/70">
                This campaign has already been sent, on{" "}
                {campaign.sentAt
                  ? new Date(campaign.sentAt).toLocaleString(locale === "el" ? "el-GR" : "en-GB")
                  : "an earlier date"}
                . Make a new one rather than sending this twice.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-brand-graphite/70">
                  {sendable.length} of {checked.length} in this audience will receive it.
                </p>
                {!channelReady ? (
                  <p className="mb-3 rounded border border-[color:var(--color-warning)] bg-white p-2 text-xs text-[color:var(--color-warning)]">
                    This channel is not configured, so every message will be recorded as simulated
                    and nothing will actually leave the building. Useful for a rehearsal.
                  </p>
                ) : null}
                <SendButton campaignId={id} action={sendCampaign} count={sendable.length} />
              </>
            )}
          </Card>

          {url ? (
            <Card title="Price list link included">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-xs text-brand-teal-dark hover:underline"
              >
                {url}
              </a>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
