import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, clients, leads, projects } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { leadStatusTone, notesForLead } from "@/lib/leads";
import { BackLink, Card, PageHeader, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import NoteList from "@/components/NoteList";
import { addLeadNote, convertLead, deleteLead, removeLeadNote, setLeadStatus } from "../actions";

const when = (value: Date, locale: string) =>
  new Date(value).toLocaleString(locale === "el" ? "el-GR" : "en-GB");

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-brand-line py-2 text-sm last:border-0">
      <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-brand-graphite/60">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const found = await db
    .select({ lead: leads, project: projects, client: clients, introducer: agents })
    .from(leads)
    .leftJoin(projects, eq(projects.id, leads.projectId))
    .leftJoin(clients, eq(clients.id, leads.clientId))
    .leftJoin(agents, eq(agents.id, leads.agentId))
    .where(eq(leads.id, id))
    .limit(1);

  const row = found[0];
  if (!row) notFound();
  const { lead, project, client, introducer } = row;

  const notes = await notesForLead(id);

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "?";

  return (
    <>
      <BackLink href="/leads" label={t("leads.backToLeads")} />
      <PageHeader
        title={name}
        subtitle={`${t("leads.received")} ${when(lead.createdAt, locale)}`}
        action={
          <Pill tone={leadStatusTone(lead.status) as "good" | "warn" | "neutral"}>
            {t(`leads.status.${lead.status}` as MessageKey)}
          </Pill>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("leads.theEnquiry")}>
            <Line label={t("leads.email")}>
              {lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : ""}
            </Line>
            <Line label={t("leads.phone")}>
              {lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : ""}
            </Line>
            {lead.interest ? <Line label={t("leads.about")}>{lead.interest}</Line> : null}
            {project || lead.projectName ? (
              <Line label={t("leads.project")}>
                {project ? (
                  <Link href={`/projects/${project.id}`} className="hover:underline">
                    {project.name}
                  </Link>
                ) : (
                  lead.projectName
                )}
                {lead.unitCode ? ` . ${lead.unitCode}` : ""}
              </Line>
            ) : null}
            {lead.budget ? <Line label={t("leads.budget")}>{lead.budget}</Line> : null}
            {lead.country ? <Line label={t("clients.country")}>{lead.country}</Line> : null}
            {lead.message ? (
              <div className="mt-3 border-t border-brand-line pt-3">
                <p className="label">{t("leads.theirWords")}</p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-brand-graphite">
                  {lead.message}
                </pre>
              </div>
            ) : null}
            <p className="mt-3 border-t border-brand-line pt-3 text-xs text-brand-graphite/60">
              {lead.consent ? t("leads.consentTicked") : t("leads.noConsent")}
              {lead.consentText ? `: ${lead.consentText}` : ""}
            </p>
          </Card>

          <Card title={t("leads.whereFrom")}>
            <Line label={t("leads.camefrom")}>
              {t(`leads.source.${lead.sourceKind}` as MessageKey)}
              {lead.sourceKind === "OTHER" && lead.source ? ` . ${lead.source}` : ""}
            </Line>
            {lead.formName ? <Line label={t("leads.formName")}>{lead.formName}</Line> : null}
            {lead.pageUrl ? (
              <Line label={t("leads.pageUrl")}>
                <span className="break-all font-mono text-xs">{lead.pageUrl}</span>
              </Line>
            ) : null}
            {lead.referrer ? (
              <Line label={t("leads.referrer")}>
                <span className="break-all font-mono text-xs">{lead.referrer}</span>
              </Line>
            ) : null}
            {introducer ? (
              <Line label={t("leads.agentIntroduced")}>
                <Link
                  href={`/agents/${introducer.id}`}
                  className="text-brand-teal-dark hover:underline"
                >
                  {introducer.name}
                </Link>
              </Line>
            ) : null}
            <Line label={t("clients.marketing")}>
              {lead.consent ? (
                <Pill tone="good">{t("clients.marketingOn")}</Pill>
              ) : (
                <Pill tone="warn">{t("clients.marketingOff")}</Pill>
              )}
            </Line>
            {lead.utmSource || lead.utmMedium || lead.utmCampaign ? (
              <Line label={t("leads.campaign")}>
                {[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" . ")}
              </Line>
            ) : null}
          </Card>

          {/*
            The record, not a box. Each note keeps the day it was written and
            who wrote it, newest first, ten at a time with arrows back through
            the older ones. Nothing here is ever typed over.
          */}
          <Card
            title={t("leads.notes")}
            action={
              <span className="text-xs text-brand-graphite/60">
                {notes.length} {t("leads.noteCount")}
              </span>
            }
          >
            <form action={addLeadNote.bind(null, id)} className="mb-4 space-y-2">
              <textarea
                name="body"
                rows={3}
                required
                placeholder={t("leads.notePlaceholder")}
                className="textarea"
              />
              <SubmitButton>{t("leads.noteAdd")}</SubmitButton>
            </form>

            <NoteList
              notes={notes.map((note) => ({
                id: note.id,
                body: note.body,
                when: when(note.createdAt, locale),
                writtenBy: note.writtenBy,
              }))}
              labels={{
                none: t("leads.noteNone"),
                by: t("leads.noteBy"),
                older: t("leads.noteOlder"),
                newer: t("leads.noteNewer"),
                of: t("common.of"),
                delete: t("common.delete"),
              }}
              remove={removeLeadNote.bind(null, id)}
            />
          </Card>

          {lead.payload ? (
            <Card title={t("leads.raw")}>
              <p className="mb-2 text-xs text-brand-graphite/60">{t("leads.rawNote")}</p>
              <pre className="overflow-x-auto rounded border border-brand-line bg-brand-surface p-3 font-mono text-xs">
                {lead.payload}
              </pre>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card title={t("leads.moveTo")}>
            <form action={setLeadStatus.bind(null, id)} className="flex flex-wrap gap-2">
              <select name="status" defaultValue={lead.status} className="select">
                <option value="NEW">{t("leads.status.NEW")}</option>
                <option value="CONTACTED">{t("leads.status.CONTACTED")}</option>
                <option value="QUALIFIED">{t("leads.status.QUALIFIED")}</option>
                <option value="CLOSED">{t("leads.status.CLOSED")}</option>
                {/* Choosing this makes the client and leaves the enquiries list. */}
                {lead.clientId ? null : (
                  <option value="CONVERTED">{t("leads.status.CONVERTED")}</option>
                )}
              </select>
              <button type="submit" className="btn btn-secondary">
                {t("common.save")}
              </button>
            </form>
          </Card>

          <Card title={t("leads.convert")}>
            {client ? (
              <>
                <p className="mb-3 text-sm text-brand-graphite/70">{t("leads.alreadyClient")}</p>
                <Link href={`/clients/${client.id}`} className="btn btn-primary">
                  {t("leads.openClient")}
                </Link>
              </>
            ) : (
              <form action={convertLead.bind(null, id)} className="space-y-3">
                <p className="text-xs text-brand-graphite/60">{t("leads.convertNote")}</p>
                <div>
                  <label className="label" htmlFor="firstName">
                    {t("common.name")}
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    defaultValue={lead.firstName ?? ""}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="lastName">
                    {t("common.surname")}
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    defaultValue={lead.lastName ?? ""}
                    className="input"
                  />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="optIn"
                    defaultChecked={lead.consent}
                    className="mt-0.5"
                  />
                  <span>{t("clients.marketingOn")}</span>
                </label>
                <p className="text-xs text-brand-graphite/60">{t("leads.consentNote")}</p>
                <button type="submit" className="btn btn-primary">
                  {t("leads.convert")}
                </button>
              </form>
            )}
          </Card>

          <Card>
            <form action={deleteLead.bind(null, id)}>
              <button type="submit" className="btn btn-secondary !text-xs">
                {t("leads.deleteLead")}
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
