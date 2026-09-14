"use client";

import { useState } from "react";
import Link from "next/link";

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
};

export type GroupCounts = { clients: number; agents: number; subowners: number };

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
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  templates: TemplateChoice[];
  chosenTemplate?: string;
  counts: GroupCounts;
  groups: { clients: boolean; agents: boolean; subowners: boolean };
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

  const [viaEmail, setViaEmail] = useState(true);
  const [viaWhatsapp, setViaWhatsapp] = useState(Boolean(picked?.bodyWhatsapp));

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
  };

  const reach =
    (toClients ? counts.clients : 0) +
    (toAgents ? counts.agents : 0) +
    (toSubowners ? counts.subowners : 0);

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
        </div>
        <p className="mt-2 text-xs text-brand-graphite/60">
          {reach} {labels.willReceive}. {labels.groupsNote}
        </p>
      </fieldset>

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
        <button type="submit" className="btn btn-primary">
          {labels.save}
        </button>
        <Link href="/campaigns" className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
