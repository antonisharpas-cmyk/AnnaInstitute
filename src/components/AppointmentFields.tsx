"use client";

import { useState } from "react";
import SearchSelect from "@/components/SearchSelect";

/*
 * Who an appointment is with, and where it is.
 *
 * Who: a client, a lead, an agent, or somebody the CRM has no record of, who
 * is then named here with the email the confirmation goes to. A follow up
 * asks the same who, without the where.
 *
 * Where: the office's own list from the Builder, which starts as the office, a
 * building, Studio Bagno, Ocriam or something else. A building asks which one,
 * so the letter can say the development and send its Google Maps link. Other
 * asks what it is. The box for anything to add is always there and never
 * required, for the meeting room or the floor.
 */

export type Person = { value: string; label: string; hint?: string };

export type WhoWhereLabels = {
  withKind: string;
  withClient: string;
  withLead: string;
  withAgent: string;
  withOther: string;
  who: string;
  otherName: string;
  otherEmail: string;
  otherPhone: string;
  otherNote: string;
  kind: string;
  building: string;
  chooseBuilding: string;
  other: string;
  otherHint: string;
  detail: string;
  detailHint: string;
  choose: string;
  search: string;
  noMatch: string;
};

type Group = "client" | "lead" | "agent" | "other";

export default function AppointmentFields({
  id = "appt",
  people,
  projects,
  kinds,
  labels,
  fixedWith,
  defaults,
  withWhere = true,
  firstGroup = "client",
}: {
  id?: string;
  people?: { clients: Person[]; leads: Person[]; agents: Person[] };
  projects?: { id: string; name: string }[];
  kinds?: { value: string; label: string }[];
  labels: WhoWhereLabels;
  /** On a person's own card: who it is with is already known. */
  fixedWith?: string;
  /** False for a follow up, which is only who and when. */
  withWhere?: boolean;
  /** Which kind of person the box opens on when nothing is chosen yet. */
  firstGroup?: "client" | "lead" | "agent" | "other";
  defaults?: {
    with?: string;
    type?: string;
    typeOther?: string | null;
    projectId?: string | null;
    detail?: string | null;
    otherName?: string | null;
    otherEmail?: string | null;
    otherPhone?: string | null;
  };
}) {
  const startWith = defaults?.with ?? "";
  const startGroup: Group = startWith.startsWith("lead:")
    ? "lead"
    : startWith.startsWith("agent:")
      ? "agent"
      : startWith === "other" || defaults?.otherName
        ? "other"
        : startWith.startsWith("client:")
          ? "client"
          : firstGroup;
  const [group, setGroup] = useState<Group>(startGroup);
  const [kind, setKind] = useState(defaults?.type ?? kinds?.[0]?.value ?? "OFFICE");

  const list = people
    ? { client: people.clients, lead: people.leads, agent: people.agents, other: [] }[group]
    : [];

  return (
    <>
      {fixedWith ? (
        <input type="hidden" name="with" value={fixedWith} />
      ) : people ? (
        <>
          <div>
            <label className="label" htmlFor={`${id}-group`}>
              {labels.withKind}
            </label>
            <select
              id={`${id}-group`}
              className="select"
              value={group}
              onChange={(event) => setGroup(event.target.value as Group)}
              data-with-kind
            >
              <option value="client">{labels.withClient}</option>
              <option value="lead">{labels.withLead}</option>
              <option value="agent">{labels.withAgent}</option>
              <option value="other">{labels.withOther}</option>
            </select>
          </div>
          {group === "other" ? (
            <>
              <input type="hidden" name="with" value="other" />
              <div>
                <label className="label" htmlFor={`${id}-otherName`}>
                  {labels.otherName}
                </label>
                <input
                  id={`${id}-otherName`}
                  name="otherName"
                  required
                  defaultValue={defaults?.otherName ?? ""}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor={`${id}-otherEmail`}>
                  {labels.otherEmail}
                </label>
                <input
                  id={`${id}-otherEmail`}
                  name="otherEmail"
                  type="email"
                  defaultValue={defaults?.otherEmail ?? ""}
                  className="input"
                />
                <p className="mt-1 text-xs text-brand-graphite/60">{labels.otherNote}</p>
              </div>
            </>
          ) : (
            <div>
              <label className="label" htmlFor={`${id}-with`}>
                {labels.who}
              </label>
              <SearchSelect
                key={group}
                id={`${id}-with`}
                name="with"
                required
                defaultValue={startWith.startsWith(`${group}:`) ? startWith : ""}
                choose={labels.choose}
                searchPlaceholder={labels.search}
                noMatch={labels.noMatch}
                options={list}
              />
            </div>
          )}
        </>
      ) : null}

      {withWhere ? (
        <>
          <div>
            <label className="label" htmlFor={`${id}-type`}>
              {labels.kind}
            </label>
            <select
              id={`${id}-type`}
              name="type"
              className="select"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              {(kinds ?? []).map((one) => (
                <option key={one.value} value={one.value}>
                  {one.label}
                </option>
              ))}
            </select>
          </div>

          {kind.split("~")[0] === "BUILDING" ? (
            <div>
              <label className="label" htmlFor={`${id}-project`}>
                {labels.building}
              </label>
              <select
                id={`${id}-project`}
                name="projectId"
                required
                defaultValue={defaults?.projectId ?? ""}
                className="select"
              >
                <option value="">{labels.chooseBuilding}</option>
                {(projects ?? []).map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {kind === "OTHER" ? (
            <div>
              <label className="label" htmlFor={`${id}-other`}>
                {labels.other}
              </label>
              <input
                id={`${id}-other`}
                name="typeOther"
                required
                defaultValue={defaults?.typeOther ?? ""}
                placeholder={labels.otherHint}
                className="input"
              />
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor={`${id}-place`}>
              {labels.detail}
            </label>
            <input
              id={`${id}-place`}
              name="place"
              defaultValue={defaults?.detail ?? ""}
              placeholder={labels.detailHint}
              className="input"
            />
          </div>
        </>
      ) : null}
    </>
  );
}
