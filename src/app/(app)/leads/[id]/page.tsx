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
import { whoCanGo } from "@/lib/team";
import { followUpsForLead } from "@/lib/followUps";
import { historyForLead } from "@/lib/leads";
import { CHOOSABLE_LEAD_STATUSES } from "@/lib/leads";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import ConfirmButton from "@/components/ConfirmButton";
import {
  addFollowUp,
  addLeadNote,
  assignLead,
  convertLead,
  deleteFollowUp,
  deleteLead,
  removeLeadNote,
  setFollowUpStatus,
  setLeadStatus,
} from "../actions";

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

  /* The office, for whoever this enquiry belongs to, and what is next on it. */
  const [team, followUps, history] = await Promise.all([
    whoCanGo(),
    /* What happens next on this enquiry, which is the one thing a list of
       notes never tells anybody. */
    followUpsForLead(id),
    /* Everything that has happened to this enquiry, read from the audit trail
       so it cannot disagree with what was actually done. */
    historyForLead(id),
  ]);

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
          {/*
            No appointments card here.

            An enquiry is followed up, and a follow up is the thing with the
            date on it and the nagging attached. Two cards asking for the next
            contact, one of them without the nagging, is how an office ends up
            keeping the same thing in two places and trusting neither. Meetings
            with somebody who is still only an enquiry are arranged from the
            appointments section itself, which lists enquiries as well as
            clients.
          */}
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
            What happens next, above the record of what has happened.

            The office reads this card first: the next meeting or call, the day,
            and a line about what it is for. It is pending from the moment it is
            written, it appears in the notifications the evening before, and it
            stays there until somebody presses Done, which is the only way it
            stops asking.
          */}
          <Card title={t("leads.followUps")}>
            <form
              action={addFollowUp.bind(null, id)}
              className="mb-4 grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-[1fr_1fr_2fr_auto]"
            >
              <div>
                <label className="label" htmlFor="followUpDay">
                  {t("leads.followUpDay")}
                </label>
                <DateField id="followUpDay" name="day" required />
              </div>
              <div>
                <label className="label" htmlFor="followUpTime">
                  {t("appointments.time")}
                </label>
                <TimeField id="followUpTime" name="time" locale={locale} />
              </div>
              <div>
                <label className="label" htmlFor="followUpNote">
                  {t("leads.followUpNote")}
                </label>
                <input
                  id="followUpNote"
                  name="note"
                  placeholder={t("leads.followUpNoteHint")}
                  className="input"
                />
              </div>
              <div className="flex items-end">
                <SubmitButton>{t("common.save")}</SubmitButton>
              </div>
            </form>

            {followUps.length === 0 ? (
              <p className="text-sm text-brand-graphite/60">{t("leads.followUpNone")}</p>
            ) : (
              <ul className="divide-y divide-brand-line text-sm">
                {followUps.map((one) => (
                  <li
                    key={one.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="min-w-0">
                      <span className="font-semibold">{when(one.at, locale)}</span>
                      {one.note ? (
                        <span className="block text-xs text-brand-graphite/70">{one.note}</span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill tone={one.status === "DONE" ? "good" : "warn"}>
                        {t(
                          one.status === "DONE"
                            ? "leads.followUpDone"
                            : "leads.followUpPending",
                        )}
                      </Pill>
                      <form
                        action={setFollowUpStatus.bind(
                          null,
                          one.id,
                          id,
                          one.status === "DONE" ? "PENDING" : "DONE",
                        )}
                      >
                        <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                          {t(
                            one.status === "DONE"
                              ? "leads.followUpReopen"
                              : "leads.followUpMarkDone",
                          )}
                        </SubmitButton>
                      </form>
                      <ConfirmButton
                        action={deleteFollowUp.bind(null, one.id, id)}
                        label={t("common.delete")}
                        confirm={t("remove.sure")}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
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

          {/*
            What has happened to this enquiry, in order.

            The status moves, who it was given to, the follow ups made and
            answered, the notes, the appointments, the conversion. It is read
            out of the audit trail, which is written by the actions themselves,
            so nothing here is a second copy of anything.
          */}
          <Card title={t("leads.history")}>
            {history.length === 0 ? (
              <p className="text-sm text-brand-graphite/60">{t("leads.historyNone")}</p>
            ) : (
              <ol className="divide-y divide-brand-line text-sm">
                {history.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-baseline gap-2 py-2">
                    <span className="w-40 shrink-0 text-xs text-brand-graphite/60">
                      {when(line.at, locale)}
                    </span>
                    <span className="min-w-0 flex-1">
                      {line.said}
                      {line.detail ? (
                        <span className="text-brand-graphite/70">{` . ${line.detail}`}</span>
                      ) : null}
                      {line.who ? (
                        <span className="block text-xs text-brand-graphite/55">{line.who}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
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
          {/* Whose enquiry this is. Changed here without opening the form. */}
          <Card title={t("appointments.assignedTo")}>
            <form action={assignLead.bind(null, id)} className="flex flex-wrap gap-2">
              <select
                name="assignedToId"
                defaultValue={lead.assignedToId ?? ""}
                className="select"
              >
                <option value="">{t("appointments.nobody")}</option>
                {team.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
              <SubmitButton className="btn btn-secondary">{t("common.save")}</SubmitButton>
            </form>
          </Card>

          <Card title={t("leads.moveTo")}>
            <form action={setLeadStatus.bind(null, id)} className="flex flex-wrap gap-2">
              <select name="status" defaultValue={lead.status} className="select">
                {/*
                  New is written by the CRM when the enquiry arrives, so it is
                  only in the list while the enquiry still holds it: nobody
                  moves a lead back to new.
                */}
                {lead.status === "NEW" ? (
                  <option value="NEW">{t("leads.status.NEW")}</option>
                ) : null}
                {CHOOSABLE_LEAD_STATUSES.map((one) => (
                  <option key={one} value={one}>
                    {t(`leads.status.${one}` as MessageKey)}
                  </option>
                ))}
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
