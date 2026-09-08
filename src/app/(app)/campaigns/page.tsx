import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, clients, suppressions } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { channelConfigured, emailConfigured } from "@/lib/messaging";
import { activePriceListLinks, priceListUrl } from "@/lib/priceList";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { audienceFor, createCampaign, makePriceListLink, revokePriceListLink } from "./actions";

export default async function CampaignsPage() {
  const { locale, t } = await getTranslator();

  const [[counts], [suppressed], list, links, clientAudience, agentAudience] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        consented: sql<number>`count(*) filter (where ${clients.marketingOptIn})::int`,
        unsubscribed: sql<number>`count(*) filter (where ${clients.unsubscribedAt} is not null)::int`,
      })
      .from(clients),
    db.select({ total: sql<number>`count(*)::int` }).from(suppressions),
    db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(25),
    activePriceListLinks(),
    audienceFor("CLIENTS_CONSENTED"),
    audienceFor("AGENTS"),
  ]);

  const readiness = [
    { label: "Email", ready: emailConfigured(), note: "SMTP_HOST and MAIL_FROM" },
    { label: "SMS", ready: channelConfigured("SMS"), note: "SMSTO_API_KEY" },
    { label: "WhatsApp", ready: channelConfigured("WHATSAPP"), note: "SMSTO_WHATSAPP_PATH" },
    { label: "Viber", ready: channelConfigured("VIBER"), note: "SMSTO_VIBER_PATH" },
  ];

  return (
    <>
      <PageHeader
        title={t("nav.campaigns")}
        subtitle="Nothing is ever sent to somebody who is not opted in or who has said stop."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("clients.title")} value={String(counts?.total ?? 0)} />
        <Stat
          label={t("clients.marketingOn")}
          value={String(counts?.consented ?? 0)}
          hint="the audience for client campaigns"
        />
        <Stat label="Unsubscribed" value={String(counts?.unsubscribed ?? 0)} />
        <Stat
          label="On the suppression list"
          value={String(suppressed?.total ?? 0)}
          hint="never contacted again, in any channel"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Campaigns">
            {list.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th>Channel</th>
                    <th>Audience</th>
                    <th>{t("common.status")}</th>
                    <th>{t("common.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/campaigns/${c.id}`} className="font-semibold hover:underline">
                          {c.title}
                        </Link>
                      </td>
                      <td>{c.channel.toLowerCase()}</td>
                      <td>{c.audience === "AGENTS" ? "agents" : "clients with consent"}</td>
                      <td>
                        <Pill
                          tone={
                            c.status === "SENT"
                              ? "good"
                              : c.status === "DRAFT"
                                ? "neutral"
                                : c.status === "FAILED"
                                  ? "bad"
                                  : "warn"
                          }
                        >
                          {c.status.replace(/_/g, " ").toLowerCase()}
                        </Pill>
                      </td>
                      <td>
                        {new Date(c.sentAt ?? c.createdAt).toLocaleDateString(
                          locale === "el" ? "el-GR" : "en-GB",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Monthly price list for agents">
            <p className="mb-3 text-sm text-brand-graphite/70">
              A link to a live page rather than a file, so the prices an agent quotes are the prices
              in the system on the day they look. A link can expire and can be revoked.
            </p>

            {links.length === 0 ? (
              <Empty message="No link has been made yet." />
            ) : (
              <ul className="mb-4 divide-y divide-brand-line text-sm">
                {links.map((link) => (
                  <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <a
                        href={`/price-list/${link.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-mono text-xs text-brand-teal-dark hover:underline"
                      >
                        {priceListUrl(link.token)}
                      </a>
                      <div className="text-xs text-brand-graphite/60">
                        {link.note ?? "no note"}
                        {link.expiresAt
                          ? `, expires ${new Date(link.expiresAt).toLocaleDateString(
                              locale === "el" ? "el-GR" : "en-GB",
                            )}`
                          : ", no expiry"}
                      </div>
                    </div>
                    <form action={revokePriceListLink.bind(null, link.id)}>
                      <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                        revoke
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <form action={makePriceListLink} className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="note">
                  Note
                </label>
                <input id="note" name="note" placeholder="September price list" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="days">
                  Expires in days
                </label>
                <input id="days" name="days" type="number" min="1" placeholder="45" className="input" />
              </div>
              <div className="sm:col-span-3">
                <button type="submit" className="btn btn-primary">
                  Make a link
                </button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="New message">
            <form action={createCampaign} className="space-y-3">
              <div>
                <label className="label" htmlFor="title">
                  {t("common.name")}
                </label>
                <input id="title" name="title" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="audience">
                  Audience
                </label>
                <select id="audience" name="audience" className="select" defaultValue="CLIENTS_CONSENTED">
                  <option value="CLIENTS_CONSENTED">
                    clients with consent ({clientAudience.length})
                  </option>
                  <option value="AGENTS">agents ({agentAudience.length})</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="channel">
                  Channel
                </label>
                <select id="channel" name="channel" className="select" defaultValue="EMAIL">
                  <option value="EMAIL">email</option>
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="VIBER">Viber</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="subject">
                  Subject, email only
                </label>
                <input id="subject" name="subject" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="body">
                  Message
                </label>
                <textarea id="body" name="body" rows={7} required className="textarea" />
                <p className="mt-1 text-xs text-brand-graphite/60">
                  {"{{first_name}}, {{name}} and {{price_list_url}} are filled in per recipient."}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="shareLinkId">
                  Price list link to include
                </label>
                <select id="shareLinkId" name="shareLinkId" className="select">
                  <option value="">none</option>
                  {links.map((link) => (
                    <option key={link.id} value={link.id}>
                      {link.note ?? link.token.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="files">
                  Attachments, email only
                </label>
                <input id="files" name="files" type="file" multiple className="input !py-1.5 text-xs" />
              </div>
              <button type="submit" className="btn btn-primary w-full">
                Save as a draft
              </button>
              <p className="text-xs text-brand-graphite/60">
                Saving does not send. The next screen shows exactly who will receive it.
              </p>
            </form>
          </Card>

          <Card title="Channels">
            <ul className="space-y-2 text-sm">
              {readiness.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-2">
                  <span>{r.label}</span>
                  {r.ready ? (
                    <Pill tone="good">ready</Pill>
                  ) : (
                    <Pill tone="warn">set {r.note}</Pill>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-brand-graphite/60">
              A channel that is not configured records every message as simulated instead of sending
              it, so the whole flow can be tested before the accounts exist. WhatsApp also needs a
              dedicated number, business verification with Meta and approved templates.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
