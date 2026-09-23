"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import type { LeadFormState } from "./actions";

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
  team,
}: {
  action: (prev: LeadFormState, formData: FormData) => Promise<LeadFormState>;
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
    /** Whose enquiry this is. */
    assignedTo: string;
    nobody: string;
  };
  /** Every agent who can be named, for the picker that appears on demand. */
  agents: { id: string; name: string }[];
  /** The office, for the person the enquiry belongs to. */
  team: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, null);
  const was = state?.values ?? {};
  const [source, setSource] = useState(was.sourceKind ?? "WEBSITE");

  return (
    /*
      The key changes on every refused attempt, so the form is drawn again with
      what the office typed rather than emptied by React after the action.
    */
    <form key={state?.attempt ?? 0} action={formAction} className="space-y-4">
      {/*
        What went wrong, said where the mistake was made, with everything the
        office typed still on the screen.
      */}
      {state?.error ? (
        <p className="rounded border border-[color:var(--color-negative)] bg-brand-paper px-3 py-2 text-sm text-[color:var(--color-negative)]">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">
            {labels.firstName}
          </label>
          <input
            id="firstName"
            name="firstName"
            defaultValue={was.firstName ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="lastName">
            {labels.lastName}
          </label>
          <input
            id="lastName"
            name="lastName"
            defaultValue={was.lastName ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="email">
            {labels.email}
          </label>
          <input
            id="email"
            name="email"
            defaultValue={was.email ?? ""}
            type="email"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            {labels.phone}
          </label>
          <input id="phone" name="phone" defaultValue={was.phone ?? ""} className="input" />
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
              defaultValue={was.sourceOther ?? ""}
              placeholder={labels.sourceOtherHint}
              className="input"
            />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="projectName">
              {labels.project}
            </label>
            <input
              id="projectName"
              name="projectName"
              defaultValue={was.projectName ?? ""}
              className="input"
            />
          </div>
        )}
      </div>

      {/*
        Whose enquiry this is.
        
        Beside the source rather than at the bottom, because the two questions
        are asked at the same moment: where did this come from, and who is
        looking after it. An enquiry with nobody's name on it is the one nobody
        follows up.
      */}
      <div className="sm:w-1/2">
        <label className="label" htmlFor="assignedToId">
          {labels.assignedTo}
        </label>
        <select
          id="assignedToId"
          name="assignedToId"
          className="select"
          defaultValue={was.assignedToId ?? ""}
        >
          <option value="">{labels.nobody}</option>
          {team.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </select>
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
        <input
          type="checkbox"
          name="consent"
          value="on"
          defaultChecked={was.consent === "on"}
          className="mt-0.5"
        />
        <span>
          {labels.consent}
          <span className="mt-0.5 block text-xs text-brand-graphite/60">{labels.consentHint}</span>
        </span>
      </label>

      <div>
        <label className="label" htmlFor="message">
          {labels.note}
        </label>
        <textarea
          id="message"
          name="message"
          defaultValue={was.message ?? ""}
          rows={4}
          className="input"
        />
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
