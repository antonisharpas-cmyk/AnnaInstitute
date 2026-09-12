"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * A lead typed in by hand.
 *
 * The same fields the website sends, so an enquiry taken on the phone or passed
 * on by an agent sits in the list next to the ones that arrive on their own. The
 * note is where the message goes, whether it came from a form or from whoever
 * took the call.
 */
export default function LeadForm({
  action,
  labels,
  cancelHref,
}: {
  action: (formData: FormData) => void | Promise<void>;
  cancelHref: string;
  labels: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    source: string;
    sourceOther: string;
    sourceOtherHint: string;
    project: string;
    note: string;
    noteHint: string;
    contactNote: string;
    save: string;
    cancel: string;
    sources: { value: string; label: string }[];
  };
}) {
  const [source, setSource] = useState("ENQUIRY");

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">
            {labels.firstName}
          </label>
          <input id="firstName" name="firstName" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="lastName">
            {labels.lastName}
          </label>
          <input id="lastName" name="lastName" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            {labels.email}
          </label>
          <input id="email" name="email" type="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            {labels.phone}
          </label>
          <input id="phone" name="phone" className="input" />
        </div>
      </div>

      <p className="text-xs text-brand-graphite/60">{labels.contactNote}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sourceKind">
            {labels.source}
          </label>
          <select
            id="sourceKind"
            name="sourceKind"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="select"
          >
            {labels.sources.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {source === "OTHER" ? (
          <div>
            <label className="label" htmlFor="sourceOther">
              {labels.sourceOther}
            </label>
            <input
              id="sourceOther"
              name="sourceOther"
              placeholder={labels.sourceOtherHint}
              className="input"
            />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="projectName">
              {labels.project}
            </label>
            <input id="projectName" name="projectName" className="input" />
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="message">
          {labels.note}
        </label>
        <textarea id="message" name="message" rows={4} className="input" />
        <p className="mt-1 text-xs text-brand-graphite/60">{labels.noteHint}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary">
          {labels.save}
        </button>
        <Link href={cancelHref} className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
