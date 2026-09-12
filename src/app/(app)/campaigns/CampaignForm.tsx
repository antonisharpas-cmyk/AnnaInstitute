"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Writing a campaign.
 *
 * Email and WhatsApp are ticked independently, and each has its own box, because
 * an email with a subject and four paragraphs is not what anybody wants to read
 * on their phone. Files are attached to the email as they are; WhatsApp carries
 * a link to the same files.
 */
export default function CampaignForm({
  action,
  audience,
  priceLists,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  audience: "CLIENTS_CONSENTED" | "AGENTS";
  priceLists: { id: string; label: string }[];
  labels: Record<string, string>;
}) {
  const [viaEmail, setViaEmail] = useState(true);
  const [viaWhatsapp, setViaWhatsapp] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="audience" value={audience} />

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
                rows={8}
                required={viaEmail}
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
