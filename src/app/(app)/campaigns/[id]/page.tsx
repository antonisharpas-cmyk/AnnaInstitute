import { agentWay } from "@/lib/agentWay";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, campaigns, documents, projects, shareLinks, units } from "@/db/schema";
import { groupsOf } from "@/lib/campaignGroups";
import { getTranslator } from "@/i18n";
import { addressFor, channelConfigured, emailConfigured, fillPlaceholders } from "@/lib/messaging";
import { filesUrl } from "@/lib/campaignFiles";
import { priceListUrl } from "@/lib/priceList";
import { appUrl } from "@/lib/unsubscribe";
import { isSuppressed } from "@/lib/suppression";
import { BackLink, Card, PageHeader, Pill, Stat } from "@/components/ui";
import { audienceFor, messagesForCampaign, saveCampaignTester, sendCampaign, sendCampaignTest, setCampaignAbout, setCampaignProjects } from "../actions";
import { idsOf } from "@/lib/campaignProjects";
import { campaignExtras, ensureCampaignLinks, unfilledIn, whatsappTest } from "@/lib/campaignTest";
import { readSetting } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";
import SendButton from "./SendButton";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!rows[0]) notFound();
  /* A draft saved before the links were made by themselves gets them now, so
     {{price_list_url}} is never left empty at the bottom of the message. */
  const campaign =
    rows[0].status === "DRAFT" ? await ensureCampaignLinks(rows[0], user.email) : rows[0];

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
    /* An agent is sent one way only, the way they chose. */
    const way = recipient.group === "AGENTS" ? agentWay(recipient.agentChannel, campaign) : null;
    const emailAddress = campaign.viaEmail && (way === null || way === "EMAIL") ? addressFor("EMAIL", recipient) : null;
    const phoneAddress = campaign.viaWhatsapp && (way === null || way === "WHATSAPP") ? addressFor("WHATSAPP", recipient) : null;
    checked.push({
      ...recipient,
      way,
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

  /* Trying it on yourself: the email to your inbox, the WhatsApp opened ready to send to your own number. */
  const testTo = (await readSetting("emails.testAddress")).trim();
  /* Placeholders that nothing would fill, and what the campaign can be about to fill them. */
  const unfilled = await unfilledIn(campaign);
  const [projectRows, unitRows] = alreadySent
    ? [[], []]
    : await Promise.all([
        db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
        db
          .select({ id: units.id, code: units.code, project: projects.name })
          .from(units)
          .innerJoin(projects, eq(projects.id, units.projectId))
          .orderBy(asc(projects.name), asc(units.code)),
      ]);
  const aboutNow = campaign.unitId ? `unit:${campaign.unitId}` : campaign.projectId ? `project:${campaign.projectId}` : "";
  const tryWhatsapp = await whatsappTest(campaign);

  // The files of a campaign also live behind a link of their own, because a
  // WhatsApp message cannot carry a PDF the way an email can.
  const filesLink = fileLinkRows[0] ? filesUrl(fileLinkRows[0].token) : undefined;
  const values = {
    name: checked[0]?.name ?? "Name Surname",
    firstName: checked[0]?.firstName ?? "Name",
    priceListUrl: url,
    filesUrl: filesLink,
    extras: await campaignExtras(campaign),
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
          groupsOf(campaign).clients ? t("campaigns.groupClients").toLowerCase() : null,
          groupsOf(campaign).agents ? t("campaigns.groupAgents").toLowerCase() : null,
          groupsOf(campaign).subowners ? t("campaigns.groupSubowners").toLowerCase() : null,
          groupsOf(campaign).leads ? t("campaigns.groupLeads").toLowerCase() : null,
        ]
          .filter(Boolean)
          .join(", ")}`}
        action={
          <Pill tone={campaign.status === "SENT" ? "good" : "neutral"}>
            {campaign.status.replace(/_/g, " ").toLowerCase()}
          </Pill>
        }
      />

      {/* What would go out unfilled, said before anybody tests or sends it. */}
      {unfilled.length > 0 ? (
        <div className="card mb-4 border-[color:var(--color-negative)] p-4" data-unfilled>
          <p className="text-sm font-semibold text-[color:var(--color-negative)]">
            {t("campaigns.unfilledTitle")}: <span className="font-mono">{unfilled.join(", ")}</span>
          </p>
          <p className="mt-1 text-xs text-brand-graphite/70">{t("campaigns.unfilledNote")}</p>
        </div>
      ) : null}

      {!alreadySent ? (
        <form action={setCampaignAbout.bind(null, id)} className="card mb-4 flex flex-wrap items-end gap-2 p-4" data-campaign-about>
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="about">
              {t("campaigns.about")}
            </label>
            <select id="about" name="about" defaultValue={aboutNow} className="select">
              <option value="">{t("campaigns.aboutNothing")}</option>
              <optgroup label={t("campaigns.aboutProjects")}>
                {projectRows.map((one) => (
                  <option key={one.id} value={`project:${one.id}`}>
                    {one.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("campaigns.aboutUnits")}>
                {unitRows.map((one) => (
                  <option key={one.id} value={`unit:${one.id}`}>
                    {one.project} {one.code}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="mt-1 text-xs text-brand-graphite/60">{t("campaigns.aboutNote")}</p>
          </div>
          <SubmitButton className="btn btn-secondary">{t("campaigns.aboutSave")}</SubmitButton>
        </form>
      ) : null}

      {/* The developments it shows, for {{projects}}, changed on the draft. */}
      {!alreadySent && (idsOf(campaign.projectIds).length > 0 || /\{\{\s*(projects|project_names)\s*\}\}/i.test(`${campaign.subject ?? ""} ${campaign.body} ${campaign.bodyWhatsapp ?? ""}`)) ? (
        <form action={setCampaignProjects.bind(null, id)} className="card mb-4 p-4" data-campaign-projects>
          <p className="label">{t("campaigns.showProjects")}</p>
          <div className="flex flex-wrap gap-4">
            {projectRows.map((one) => (
              <label key={one.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="projectIds"
                  value={one.id}
                  defaultChecked={idsOf(campaign.projectIds).includes(one.id)}
                />
                {one.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-brand-graphite/60">{t("campaigns.showProjectsNote")}</p>
          <SubmitButton className="btn btn-secondary mt-2">{t("common.save")}</SubmitButton>
        </form>
      ) : null}

      {/* Try it first: at the top, so it is the first thing on a draft whatever the screen size. */}
      <div id="test" className="mb-4 scroll-mt-20">
        <Card title={t("campaigns.test.title")}>
          <p className="mb-3 text-xs text-brand-graphite/60">{t("campaigns.test.note")}</p>
          {/localhost|127\.0\.0\.1/.test(appUrl()) ? (
            <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-local-links>
              {t("campaigns.test.localLinks")} <code className="font-mono">{appUrl()}</code>. {t("campaigns.test.localLinksFix")}
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <form action={saveCampaignTester.bind(null, id)} className="space-y-2" data-campaign-tester>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="testTo">
                    {t("emails.test.address")}
                  </label>
                  <input id="testTo" name="to" type="email" defaultValue={testTo} placeholder={user.email} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="testPhone">
                    {t("campaigns.test.phone")}
                  </label>
                  <input
                    id="testPhone"
                    name="phone"
                    inputMode="tel"
                    defaultValue={tryWhatsapp?.phone ?? ""}
                    placeholder="+357 99 000000"
                    className="input"
                  />
                </div>
              </div>
              <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("common.save")}</SubmitButton>
            </form>
            <div className="flex flex-col gap-2 md:border-l md:border-brand-line md:pl-4">
              {campaign.viaEmail ? (
                <form action={sendCampaignTest.bind(null, id)}>
                  <SubmitButton className="btn btn-primary w-full">{t("campaigns.test.email")}</SubmitButton>
                  <p className="mt-1 text-xs text-brand-graphite/60">
                    {t("emails.test.goesTo")} <span className="font-semibold">{testTo || user.email}</span>
                  </p>
                </form>
              ) : null}
              {tryWhatsapp && unfilled.length === 0 ? (
                <div>
                  <a href={tryWhatsapp.link} target="_blank" rel="noreferrer" className="btn btn-secondary w-full" data-whatsapp-test>
                    {t("campaigns.test.whatsapp")}
                  </a>
                  <p className="mt-1 text-xs text-brand-graphite/60">
                    {tryWhatsapp.phone ? `${t("campaigns.test.whatsappTo")} ${tryWhatsapp.phone}` : t("campaigns.test.whatsappPick")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

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
                            : r.group === "LEADS"
                              ? t("campaigns.groupLeads")
                              : t("campaigns.groupSubowners")}
                      </div>
                    </td>
                    <td className="break-all text-xs">
                      {!campaign.viaEmail ? (
                        <span className="text-brand-graphite/40">not on this campaign</span>
                      ) : r.way === "WHATSAPP" ? (
                        <span className="text-brand-graphite/40" data-not-their-way>{t("campaigns.theirWayWhatsapp")}</span>
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
                      ) : r.way === "EMAIL" ? (
                        <span className="text-brand-graphite/40" data-not-their-way>{t("campaigns.theirWayEmail")}</span>
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
