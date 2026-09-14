import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, campaigns, documents, shareLinks } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { addressFor, channelConfigured, emailConfigured, fillPlaceholders } from "@/lib/messaging";
import { filesUrl } from "@/lib/campaignFiles";
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

  const [attachments, recipients, log, fileLinkRows] = await Promise.all([
    db
      .select({ document: documents })
      .from(campaignDocuments)
      .innerJoin(documents, eq(documents.id, campaignDocuments.documentId))
      .where(eq(campaignDocuments.campaignId, id)),
    audienceFor(campaign),
    messagesForCampaign(id),
    db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.kind, "CAMPAIGN_FILES"), eq(shareLinks.campaignId, id)))
      .limit(1),
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

  // Somebody can be reachable on one channel and not the other, so each is
  // checked on its own and the page says who will actually receive what.
  const checked = [];
  for (const recipient of recipients) {
    const emailAddress = campaign.viaEmail ? addressFor("EMAIL", recipient) : null;
    const phoneAddress = campaign.viaWhatsapp ? addressFor("WHATSAPP", recipient) : null;
    checked.push({
      ...recipient,
      emailAddress,
      phoneAddress,
      emailSuppressed: emailAddress ? await isSuppressed("EMAIL", emailAddress) : false,
      phoneSuppressed: phoneAddress ? await isSuppressed("PHONE", phoneAddress) : false,
    });
  }

  const willGetEmail = checked.filter((r) => r.emailAddress && !r.emailSuppressed);
  const willGetWhatsapp = checked.filter((r) => r.phoneAddress && !r.phoneSuppressed);
  const sendable = [...new Set([...willGetEmail, ...willGetWhatsapp])];

  const channelReady =
    (!campaign.viaEmail || emailConfigured()) &&
    (!campaign.viaWhatsapp || channelConfigured("WHATSAPP"));
  const alreadySent = campaign.status !== "DRAFT";

  // The files of a campaign also live behind a link of their own, because a
  // WhatsApp message cannot carry a PDF the way an email can.
  const filesLink = fileLinkRows[0] ? filesUrl(fileLinkRows[0].token) : undefined;
  const values = {
    name: checked[0]?.name ?? "Name Surname",
    firstName: checked[0]?.firstName ?? "Name",
    priceListUrl: url,
    filesUrl: filesLink,
  };
  const preview = fillPlaceholders(campaign.body, values);
  const previewWhatsapp = campaign.bodyWhatsapp
    ? fillPlaceholders(campaign.bodyWhatsapp, values)
    : null;

  return (
    <>
      <BackLink
        href="/campaigns"
        label={`${t("common.backTo")} ${t("nav.campaigns").toLowerCase()}`}
      />
      <PageHeader
        title={campaign.title}
        subtitle={`${[campaign.viaEmail ? "email" : null, campaign.viaWhatsapp ? "whatsapp" : null]
          .filter(Boolean)
          .join(" and ")} . ${[
          campaign.toClients || campaign.audience === "CLIENTS_CONSENTED"
            ? t("campaigns.groupClients").toLowerCase()
            : null,
          campaign.toAgents || campaign.audience === "AGENTS"
            ? t("campaigns.groupAgents").toLowerCase()
            : null,
          campaign.toSubowners || campaign.audience === "SUBOWNERS"
            ? t("campaigns.groupSubowners").toLowerCase()
            : null,
        ]
          .filter(Boolean)
          .join(", ")}`}
        action={
          <Pill tone={campaign.status === "SENT" ? "good" : "neutral"}>
            {campaign.status.replace(/_/g, " ").toLowerCase()}
          </Pill>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="In the audience" value={String(checked.length)} />
        <Stat label="Emails" value={String(willGetEmail.length)} hint="address, not suppressed" />
        <Stat
          label="WhatsApp"
          value={String(willGetWhatsapp.length)}
          hint="number, not suppressed"
        />
        <Stat
          label="Skipped"
          value={String(checked.length - sendable.length)}
          hint="reachable on neither"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="The message as one recipient will see it">
            {campaign.viaEmail ? (
              <div className="mb-4">
                <p className="label">{t("campaigns.theEmail")}</p>
                {campaign.subject ? (
                  <p className="mb-2 text-sm font-semibold">{campaign.subject}</p>
                ) : null}
                <pre className="whitespace-pre-wrap font-sans text-sm text-brand-graphite">
                  {preview}
                </pre>
              </div>
            ) : null}
            {campaign.viaWhatsapp && previewWhatsapp ? (
              <div className="mb-2 border-t border-brand-line pt-3">
                <p className="label">{t("campaigns.theWhatsapp")}</p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-brand-graphite">
                  {previewWhatsapp}
                </pre>
              </div>
            ) : null}
            {campaign.toClients || campaign.audience === "CLIENTS_CONSENTED" ? (
              <p className="mt-3 border-t border-brand-line pt-3 text-xs text-brand-graphite/60">
                {campaign.viaEmail
                  ? "An unsubscribe link is added to every email automatically. "
                  : ""}
                {campaign.viaWhatsapp
                  ? "Reply STOP to opt out is added to every WhatsApp message, and a reply of stop suppresses that number for good."
                  : ""}
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
                    {campaign.viaWhatsapp ? (
                      <span className="ml-2 text-xs text-brand-graphite/60">
                        attached to the email, and reachable from the WhatsApp link
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
                  <th>{t("campaigns.email")}</th>
                  <th>{t("campaigns.whatsapp")}</th>
                </tr>
              </thead>
              <tbody>
                {checked.map((r) => (
                  <tr key={`${r.clientId ?? r.agentId ?? r.subownerId}`}>
                    <td>
                      {r.name}
                      <div className="text-xs text-brand-graphite/50">
                        {r.group === "CLIENTS"
                          ? t("campaigns.groupClients")
                          : r.group === "AGENTS"
                            ? t("campaigns.groupAgents")
                            : t("campaigns.groupSubowners")}
                      </div>
                    </td>
                    <td className="break-all text-xs">
                      {!campaign.viaEmail ? (
                        <span className="text-brand-graphite/40">not on this campaign</span>
                      ) : r.emailSuppressed ? (
                        <Pill tone="bad">suppressed</Pill>
                      ) : r.emailAddress ? (
                        r.emailAddress
                      ) : (
                        <Pill tone="warn">no address</Pill>
                      )}
                    </td>
                    <td className="break-all text-xs">
                      {!campaign.viaWhatsapp ? (
                        <span className="text-brand-graphite/40">not on this campaign</span>
                      ) : r.phoneSuppressed ? (
                        <Pill tone="bad">suppressed</Pill>
                      ) : r.phoneAddress ? (
                        r.phoneAddress
                      ) : (
                        <Pill tone="warn">no number</Pill>
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

          {filesLink ? (
            <Card title={t("campaigns.filesLink")}>
              <p className="mb-2 text-xs text-brand-graphite/60">{t("campaigns.filesLinkHint")}</p>
              <a
                href={filesLink}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-xs text-brand-teal-dark hover:underline"
              >
                {filesLink}
              </a>
            </Card>
          ) : null}

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
