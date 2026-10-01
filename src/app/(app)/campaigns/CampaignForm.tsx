"use client";

import { useState } from "react";
import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";

export type TemplateChoice = {
  key: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  bodyWhatsapp: string;
  toClients: boolean;
  toAgents: boolean;
  toSubowners: boolean;
  toLeads?: boolean;
};

export type GroupCounts = { clients: number; agents: number; subowners: number; leads?: number };

/**
 * Writing a campaign.
 *
 * Three things are chosen here and none of them is assumed: who it goes to,
 * how it is sent, and what it says. Email and WhatsApp are ticked independently,
 * and each has its own box, because an email with a subject and four paragraphs
 * is not what anybody wants to read on their phone. Picking a ready made message
 * fills the boxes in, and everything stays editable afterwards.
 */
export default function CampaignForm({
  action,
  templates,
  chosenTemplate,
  counts,
  groups,
  priceLists,
  about = [],
  aboutDefault = "",
  leadChoices = [],
  projectChoices = [],
  projectsDefault = [],
  leadsDefault = [],
  labels,
}: {
  /** Leads already chosen, when the campaign was started from one. */
  leadsDefault?: string[];
  /** Every open lead, to tick one by one. */
  leadChoices?: { id: string; label: string; hint: string }[];
  /** Every development, for a campaign that shows some of them. */
  projectChoices?: { id: string; name: string }[];
  projectsDefault?: string[];
  /** The developments and apartments a campaign can be about, as "project:<id>" and "unit:<id>". */
  about?: { value: string; label: string; group: string }[];
  aboutDefault?: string;
  action: (formData: FormData) => void | Promise<void>;
  templates: TemplateChoice[];
  chosenTemplate?: string;
  counts: GroupCounts;
  groups: { clients: boolean; agents: boolean; subowners: boolean; leads?: boolean };
  priceLists: { id: string; label: string }[];
  labels: Record<string, string>;
}) {
  const picked = templates.find((template) => template.key === chosenTemplate);

  const [templateKey, setTemplateKey] = useState(picked?.key ?? "");
  const [subject, setSubject] = useState(picked?.subject ?? "");
  const [body, setBody] = useState(picked?.body ?? "");
  const [whatsapp, setWhatsapp] = useState(picked?.bodyWhatsapp ?? "");

  const [toClients, setToClients] = useState(picked ? picked.toClients : groups.clients);
  const [toAgents, setToAgents] = useState(picked ? picked.toAgents : groups.agents);
  const [toSubowners, setToSubowners] = useState(picked ? picked.toSubowners : groups.subowners);
  const [toLeads, setToLeads] = useState(picked ? Boolean(picked.toLeads) : Boolean(groups.leads));
  const [leadMode, setLeadMode] = useState<"all" | "chosen">(leadsDefault.length > 0 ? "chosen" : "all");
  const [chosenLeads, setChosenLeads] = useState<string[]>(leadsDefault);
  const [leadTerm, setLeadTerm] = useState("");
  const [shownProjects, setShownProjects] = useState<string[]>(projectsDefault);

  const [viaEmail, setViaEmail] = useState(true);
  const [viaWhatsapp, setViaWhatsapp] = useState(Boolean(picked?.bodyWhatsapp));
  const [aboutValue, setAboutValue] = useState(aboutDefault);

  /*
   * The placeholders that need the development or the apartment. Said on the
   * form, before saving, rather than found in a client's inbox.
   */
  const words = `${viaEmail ? `${subject} ${body}` : ""} ${viaWhatsapp ? whatsapp : ""}`;
  const needsProject = /\{\{\s*(project|location|details|completion)\s*\}\}/i.test(words);
  const needsUnit = /\{\{\s*(unit|price)\s*\}\}/i.test(words);
  const aboutWarning =
    needsUnit && !aboutValue.startsWith("unit:")
      ? labels.aboutNeedsUnit
      : needsProject && !aboutValue
        ? labels.aboutNeedsProject
        : "";

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const template = templates.find((t) => t.key === key);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.body);
    setWhatsapp(template.bodyWhatsapp);
    setToClients(template.toClients);
    setToAgents(template.toAgents);
    setToSubowners(template.toSubowners);
    setToLeads(Boolean(template.toLeads));
  };

  /* A message that shows developments needs at least one ticked. */
  const showsProjects = /\{\{\s*(projects|project_names)\s*\}\}/i.test(words);
  const leadWords = leadTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const leadsShown = leadChoices.filter((one) =>
    leadWords.every((word) => `${one.label} ${one.hint}`.toLowerCase().includes(word)),
  );
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((one) => one !== id);

  const reach =
    (toClients ? counts.clients : 0) +
    (toAgents ? counts.agents : 0) +
    (toSubowners ? counts.subowners : 0) +
    (toLeads ? (leadMode === "chosen" && chosenLeads.length > 0 ? chosenLeads.length : (counts.leads ?? 0)) : 0);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="templateKey" value={templateKey} />

      {templates.length > 0 ? (
        <div>
          <label className="label" htmlFor="template">
            {labels.template}
          </label>
          <select
            id="template"
            value={templateKey}
            onChange={(event) => applyTemplate(event.target.value)}
            className="select"
          >
            <option value="">{labels.noTemplate}</option>
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brand-graphite/60">
            {templates.find((t) => t.key === templateKey)?.description ?? labels.templateNote}
          </p>
        </div>
      ) : null}

      {about.length > 0 ? (
        <div>
          <label className="label" htmlFor="about">
            {labels.about}
          </label>
          <select
            id="about"
            name="about"
            value={aboutValue}
            onChange={(event) => setAboutValue(event.target.value)}
            className="select"
          >
            <option value="">{labels.aboutNothing}</option>
            {[...new Set(about.map((one) => one.group))].map((group) => (
              <optgroup key={group} label={group}>
                {about
                  .filter((one) => one.group === group)
                  .map((one) => (
                    <option key={one.value} value={one.value}>
                      {one.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.aboutNote}</p>
          {aboutWarning ? (
            <p className="mt-1 text-xs font-semibold text-[color:var(--color-negative)]" data-about-warning>
              {aboutWarning}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="title">
          {labels.title}
        </label>
        <input
          id="title"
          name="title"
          required
          placeholder={labels.titlePlaceholder}
          className="input"
        />
        <p className="mt-1 text-xs text-brand-graphite/60">{labels.titleNote}</p>
      </div>

      <fieldset className="rounded border border-brand-line p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
          {labels.whoGetsIt}
        </legend>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="toClients"
              checked={toClients}
              onChange={(event) => setToClients(event.target.checked)}
            />
            <span>
              {labels.groupClients}{" "}
              <span className="text-brand-graphite/60">({counts.clients})</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="toAgents"
              checked={toAgents}
              onChange={(event) => setToAgents(event.target.checked)}
            />
            <span>
              {labels.groupAgents} <span className="text-brand-graphite/60">({counts.agents})</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="toSubowners"
              checked={toSubowners}
              onChange={(event) => setToSubowners(event.target.checked)}
            />
            <span>
              {labels.groupSubowners}{" "}
              <span className="text-brand-graphite/60">({counts.subowners})</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="toLeads"
              checked={toLeads}
              onChange={(event) => setToLeads(event.target.checked)}
            />
            <span>
              {labels.groupLeads} <span className="text-brand-graphite/60">({counts.leads ?? 0})</span>
            </span>
          </label>
        </div>

        {/* Every enquiry, or only the ones ticked here. */}
        {toLeads ? (
          <div className="mt-3 rounded border border-brand-line bg-brand-surface p-3" data-lead-picker>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="leadMode"
                  value="all"
                  checked={leadMode === "all"}
                  onChange={() => setLeadMode("all")}
                />
                {labels.leadsAll}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="leadMode"
                  value="chosen"
                  checked={leadMode === "chosen"}
                  onChange={() => setLeadMode("chosen")}
                />
                {labels.leadsChosen}
                {leadMode === "chosen" ? (
                  <span className="text-xs text-brand-graphite/60">
                    ({chosenLeads.length} {labels.leadsPicked})
                  </span>
                ) : null}
              </label>
            </div>
            {leadMode === "chosen" ? (
              <>
                <input
                  value={leadTerm}
                  onChange={(event) => setLeadTerm(event.target.value)}
                  placeholder={labels.leadsSearch}
                  className="input mt-2"
                  data-lead-search
                />
                <ul className="mt-2 max-h-56 overflow-y-auto rounded border border-brand-line bg-white text-sm">
                  {leadsShown.map((one) => (
                    <li key={one.id} className="border-b border-brand-line last:border-0">
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={chosenLeads.includes(one.id)}
                          onChange={(event) => setChosenLeads(toggle(chosenLeads, one.id, event.target.checked))}
                          data-lead={one.label}
                        />
                        <span className="font-medium">{one.label}</span>
                        <span className="text-xs text-brand-graphite/60">{one.hint}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {/* Ticked ones stay chosen while the search hides them. */}
                {chosenLeads.map((id) => (
                  <input key={id} type="hidden" name="leadIds" value={id} />
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        <p className="mt-2 text-xs text-brand-graphite/60">
          {reach} {labels.willReceive}. {labels.groupsNote}
        </p>
      </fieldset>

      {/* The developments a campaign shows, for {{projects}}. */}
      {showsProjects || shownProjects.length > 0 ? (
        <fieldset className="rounded border border-brand-line p-3" data-show-projects>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {labels.showProjects}
          </legend>
          <div className="flex flex-wrap gap-4">
            {projectChoices.map((one) => (
              <label key={one.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="projectIds"
                  value={one.id}
                  checked={shownProjects.includes(one.id)}
                  onChange={(event) => setShownProjects(toggle(shownProjects, one.id, event.target.checked))}
                />
                {one.name}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-brand-graphite/60">{labels.showProjectsNote}</p>
          {showsProjects && shownProjects.length === 0 ? (
            <p className="mt-1 text-xs font-semibold text-[color:var(--color-negative)]" data-projects-warning>
              {labels.showProjectsNeeded}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <fieldset className="rounded border border-brand-line p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
          {labels.howToSend}
        </legend>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="viaEmail"
              checked={viaEmail}
              onChange={(e) => setViaEmail(e.target.checked)}
            />
            <span>{labels.email}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="viaWhatsapp"
              checked={viaWhatsapp}
              onChange={(e) => setViaWhatsapp(e.target.checked)}
            />
            <span>{labels.whatsapp}</span>
          </label>
        </div>
        <p className="mt-2 text-xs text-brand-graphite/60">{labels.bothNote}</p>
      </fieldset>

      {viaEmail ? (
        <fieldset className="rounded border border-brand-line p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {labels.theEmail}
          </legend>
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="subject">
                {labels.subject}
              </label>
              <input
                id="subject"
                name="subject"
                required={viaEmail}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={labels.subjectPlaceholder}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="body">
                {labels.body}
              </label>
              <textarea
                id="body"
                name="body"
                rows={10}
                required={viaEmail}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={labels.bodyPlaceholder}
                className="textarea"
              />
            </div>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="body" value="" />
      )}

      {viaWhatsapp ? (
        <fieldset className="rounded border border-brand-line p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {labels.theWhatsapp}
          </legend>
          <label className="label" htmlFor="bodyWhatsapp">
            {labels.body}
          </label>
          <textarea
            id="bodyWhatsapp"
            name="bodyWhatsapp"
            rows={5}
            required={viaWhatsapp}
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            placeholder={labels.whatsappPlaceholder}
            className="textarea"
          />
          <p className="mt-2 text-xs text-brand-graphite/60">{labels.whatsappNote}</p>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="files">
            {labels.files}
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
            className="input !py-1.5 text-xs"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.filesNote}</p>
        </div>

        <div>
          <label className="label" htmlFor="shareLinkId">
            {labels.priceList}
          </label>
          <select id="shareLinkId" name="shareLinkId" className="select">
            <option value="">{labels.noPriceList}</option>
            {priceLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.priceListNote}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-brand-line pt-4">
        <SubmitButton>{labels.save}</SubmitButton>
        <Link href="/campaigns" className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
