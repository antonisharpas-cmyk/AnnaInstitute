import Link from "next/link";
import { desc, sql, isNull } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, clients, suppressions } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { channelConfigured, emailConfigured } from "@/lib/messaging";
import { activePriceListLinks, priceListUrl } from "@/lib/priceList";
import { listTemplates } from "@/lib/templates";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import { audienceFor, makePriceListLink, revokePriceListLink } from "./actions";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

const statusTone = (status: string) =>
  status === "SENT" ? "good" : status === "DRAFT" ? "warn" : status === "FAILED" ? "bad" : "teal";

export default async function CampaignsPage() {
  const { t } = await getTranslator();

  const [[counts], [suppressed], rows, links, everyone, templates] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        consented: sql<number>`count(*) filter (where ${clients.marketingOptIn})::int`,
        unsubscribed: sql<number>`count(*) filter (where ${clients.unsubscribedAt} is not null)::int`,
      })
      .from(clients)
      .where(isNull(clients.deletedAt)),
    db.select({ total: sql<number>`count(*)::int` }).from(suppressions),
    db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(30),
    activePriceListLinks(),
    audienceFor({ toClients: true, toAgents: true, toSubowners: true }),
    listTemplates(),
  ]);

  const group = (name: "CLIENTS" | "AGENTS" | "SUBOWNERS") =>
    everyone.filter((person) => person.group === name);

  const readiness = [
    { label: t("campaigns.email"), ready: emailConfigured(), note: "SMTP_HOST, SMTP_USER and SMTP_PASSWORD" },
    {
      label: t("campaigns.whatsapp"),
      ready: channelConfigured("WHATSAPP"),
      note: "SMSTO_API_KEY and SMSTO_WHATSAPP_PATH",
    },
    { label: "SMS", ready: channelConfigured("SMS"), note: "SMSTO_API_KEY" },
  ];

  const audienceLine = (name: "CLIENTS" | "AGENTS" | "SUBOWNERS", label: string) => {
    const people = group(name);
    return (
      <li key={name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-brand-graphite/60">
          {people.length} {t("campaigns.inTheAudience")} . {people.filter((p) => p.email).length}{" "}
          {t("campaigns.withEmail")} . {people.filter((p) => p.phone).length}{" "}
          {t("campaigns.withPhone")}
        </span>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title={t("nav.campaigns")}
        subtitle="Nothing is ever sent to somebody who is not opted in or who has said stop."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/campaigns/templates" className="btn btn-secondary">
              {t("campaigns.templates")}
            </Link>
            <Link
              href="/campaigns/new"
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              {t("campaigns.new")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("campaigns.groupClients")}
          value={String(group("CLIENTS").length)}
          hint={`${counts?.total ?? 0} ${t("clients.title").toLowerCase()}`}
        />
        <Stat label={t("campaigns.groupAgents")} value={String(group("AGENTS").length)} />
        <Stat label={t("campaigns.groupSubowners")} value={String(group("SUBOWNERS").length)} />
        <Stat
          label="On the suppression list"
          value={String(suppressed?.total ?? 0)}
          hint="never contacted again, in any channel"
        />
      </div>

      <div className="space-y-4">
        <Card title={t("campaigns.whoGetsIt")}>
          <ul className="divide-y divide-brand-line">
            {audienceLine("CLIENTS", t("campaigns.groupClients"))}
            {audienceLine("AGENTS", t("campaigns.groupAgents"))}
            {audienceLine("SUBOWNERS", t("campaigns.groupSubowners"))}
          </ul>
          <p className="mt-2 text-xs text-brand-graphite/60">
            {t("campaigns.groupsNote")} {counts?.unsubscribed ?? 0} unsubscribed.
          </p>
        </Card>

        <Card title={t("nav.campaigns")}>
          {rows.length === 0 ? (
            <Empty message={t("campaigns.noneYet")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th>{t("campaigns.whoGetsIt")}</th>
                    <th className="ctr">{t("campaigns.howToSend")}</th>
                    <th className="ctr">{t("common.status")}</th>
                    <th className="ctr">{t("common.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/campaigns/${c.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {c.title}
                        </Link>
                        {c.subject ? (
                          <div className="text-xs text-brand-graphite/60">{c.subject}</div>
                        ) : null}
                      </td>
                      <td className="text-xs">
                        {[
                          c.toClients || c.audience === "CLIENTS_CONSENTED"
                            ? t("campaigns.groupClients")
                            : null,
                          c.toAgents || c.audience === "AGENTS" ? t("campaigns.groupAgents") : null,
                          c.toSubowners || c.audience === "SUBOWNERS"
                            ? t("campaigns.groupSubowners")
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </td>
                      <td className="ctr text-xs">
                        {[
                          c.viaEmail ? t("campaigns.email") : null,
                          c.viaWhatsapp ? t("campaigns.whatsapp") : null,
                        ]
                          .filter(Boolean)
                          .join(" + ")}
                      </td>
                      <td className="ctr">
                        <Pill tone={statusTone(c.status) as "good" | "warn" | "bad" | "teal"}>
                          {c.status.replace(/_/g, " ").toLowerCase()}
                        </Pill>
                      </td>
                      <td className="ctr">{day(c.sentAt ?? c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title={t("campaigns.templates")}
          action={
            <Link href="/campaigns/templates" className="btn btn-secondary !px-3 !py-1 !text-xs">
              {t("common.edit")}
            </Link>
          }
        >
          <p className="mb-1 text-xs text-brand-graphite/60">{t("campaigns.templatesNote")}</p>
          {/* The letters that go by themselves are not campaigns, and live on their own page. */}
          <p className="mb-3 text-xs text-brand-graphite/60">
            {t("campaigns.automaticElsewhere")}{" "}
            <Link href="/emails" className="text-brand-teal-dark hover:underline">
              {t("nav.emails")}
            </Link>
          </p>
          <ul className="divide-y divide-brand-line text-sm">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-medium">{template.name}</span>
                  {template.description ? (
                    <span className="ml-2 text-xs text-brand-graphite/60">
                      {template.description}
                    </span>
                  ) : null}
                </span>
                <Link
                  href={`/campaigns/new?template=${template.key}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary !px-3 !py-1 !text-xs"
                >
                  {t("campaigns.useTemplate")}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={t("campaigns.priceList")}>
          <p className="mb-3 text-xs text-brand-graphite/60">
            A link that always shows the prices of everything available today. Put it in a message
            with {"{{price_list_url}}"} and every recipient gets the same live page.
          </p>

          <div className="mb-4">
            <Disclosure showLabel="+ Make a link" hideLabel={t("common.cancel")}>
              <form
                action={makePriceListLink}
                className="flex flex-wrap items-end gap-2 rounded border border-brand-line bg-brand-surface p-3"
              >
                <div>
                  <label className="label" htmlFor="note">
                    {t("common.notes")}
                  </label>
                  <input
                    id="note"
                    name="note"
                    placeholder="September price list"
                    className="input !w-64 !py-1 !text-xs"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="days">
                    Expires in days
                  </label>
                  <input
                    id="days"
                    name="days"
                    defaultValue="45"
                    className="input !w-24 !py-1 !text-xs"
                  />
                </div>
                <button type="submit" className="btn btn-primary !px-3 !py-1 !text-xs">
                  {t("common.add")}
                </button>
              </form>
            </Disclosure>
          </div>

          {links.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.notes")}</th>
                    <th>Address</th>
                    <th className="ctr">Expires</th>
                    <th className="ctr">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id}>
                      <td>{l.note ?? ""}</td>
                      <td>
                        <a
                          href={priceListUrl(l.token)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-teal-dark hover:underline"
                        >
                          {priceListUrl(l.token)}
                        </a>
                      </td>
                      <td className="ctr">{day(l.expiresAt) || "never"}</td>
                      <td className="ctr">
                        <form action={revokePriceListLink.bind(null, l.id)}>
                          <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                            Revoke
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="What is connected">
          <ul className="divide-y divide-brand-line text-sm">
            {readiness.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{r.label}</span>
                  <span className="ml-2 text-xs text-brand-graphite/60">{r.note}</span>
                </span>
                <Pill tone={r.ready ? "good" : "warn"}>{r.ready ? "ready" : "not set up"}</Pill>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-brand-graphite/60">
            Anything not connected yet is written to the log as simulated rather than sent, so you
            can rehearse a campaign without anybody receiving it.
          </p>
        </Card>
      </div>
    </>
  );
}
