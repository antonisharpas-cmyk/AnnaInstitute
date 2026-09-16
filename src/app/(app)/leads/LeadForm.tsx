"use client";

import { useState } from "react";
import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";

/**
 * A lead typed in by hand.
 *
 * The same fields the website sends, so an enquiry taken on the phone or passed
 * on by an agent sits in the list next to the ones that arrive on their own. The
 * note is where the message goes, whether it came from a form or from whoever
 * took the call.
 *
 * Two things belong here rather than being fixed up afterwards. The agent, which
 * only appears once the enquiry is said to have come from one, because the
 * person taking the call is the one who knows who passed it on. And consent to
 * be contacted with offers: somebody who says yes on the telephone has said yes,
 * and asking the office to remember to tick a box on another screen later is how
 * a marketing list ends up unlawful.
 */
export default function LeadForm({
  action,
  labels,
  cancelHref,
  agents,
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
    agent: string;
    chooseAgent: string;
    consent: string;
    consentHint: string;
    save: string;
    cancel: string;
    sources: { value: string; label: string }[];
  };
  /** Every agent who can be named, for the picker that appears on demand. */
  agents: { id: string; name: string }[];
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

      {/* The agent, only when there is one to name. */}
      {source === "AGENT" ? (
        <div className="sm:w-1/2">
          <label className="label" htmlFor="agentId">
            {labels.agent}
          </label>
          <select id="agentId" name="agentId" className="select" defaultValue="">
            <option value="">{labels.chooseAgent}</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <label className="flex items-start gap-2 rounded border border-brand-line bg-brand-surface p-3 text-sm">
        <input type="checkbox" name="consent" value="on" className="mt-0.5" />
        <span>
          {labels.consent}
          <span className="mt-0.5 block text-xs text-brand-graphite/60">{labels.consentHint}</span>
        </span>
      </label>

      <div>
        <label className="label" htmlFor="message">
          {labels.note}
        </label>
        <textarea id="message" name="message" rows={4} className="input" />
        <p className="mt-1 text-xs text-brand-graphite/60">{labels.noteHint}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton>{labels.save}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
