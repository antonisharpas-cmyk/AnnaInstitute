"use client";

import { useActionState, useEffect, useState } from "react";
import { humanLabel } from "@/lib/fileLabels";
import { updateClient } from "../actions";

export type ClientRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  idType: "ID_CARD" | "PASSPORT" | "YELLOW_SLIP" | null;
  idNumber: string | null;
  country: string | null;
  address: string | null;
  source: string;
  notes: string | null;
};

type State = { ok: true } | { error: string } | null;

const ID_LABELS: Record<string, string> = {
  ID_CARD: "Identity card",
  PASSPORT: "Passport",
  YELLOW_SLIP: "Yellow slip",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-brand-line py-2 last:border-b-0">
      <span className="label !mb-0 w-44 shrink-0">{label}</span>
      <span className="min-w-0 break-words text-sm">{value}</span>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-brand-line py-2 last:border-b-0">
      <label className="label !mb-0 w-44 shrink-0" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="input max-w-sm flex-1"
      />
    </div>
  );
}

/**
 * The client's own details, read only until somebody presses Edit, and then
 * editable in the same card rather than on another page.
 */
export default function PersonalInfo({
  client,
  labels,
}: {
  client: ClientRecord;
  labels: {
    title: string;
    edit: string;
    save: string;
    cancel: string;
    name: string;
    surname: string;
    email: string;
    phone: string;
    idType: string;
    idNumber: string;
    country: string;
    address: string;
    source: string;
    notes: string;
  };
}) {
  const [editing, setEditing] = useState(false);
  const action = updateClient.bind(null, client.id);
  const [state, formAction, pending] = useActionState<State, FormData>(action, null);

  useEffect(() => {
    if (state && "ok" in state) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <section className="card">
        <header className="flex items-center justify-between gap-3 border-b border-brand-line px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-graphite">
            {labels.title}
          </h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-secondary !px-3 !py-1 !text-xs"
          >
            {labels.edit}
          </button>
        </header>
        <div className="px-4 py-2">
          <Row label={labels.name} value={client.firstName} />
          <Row label={labels.surname} value={client.lastName} />
          <Row label={labels.email} value={client.email ?? ""} />
          <Row label={labels.phone} value={client.phone ?? ""} />
          <Row label={labels.idType} value={client.idType ? ID_LABELS[client.idType] : ""} />
          <Row label={labels.idNumber} value={client.idNumber ?? ""} />
          <Row label={labels.country} value={client.country ?? ""} />
          <Row label={labels.address} value={client.address ?? ""} />
          <Row label={labels.source} value={humanLabel(client.source)} />
          <div className="py-2">
            <span className="label">{labels.notes}</span>
            <p className="whitespace-pre-wrap text-sm">{client.notes ?? ""}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <header className="flex items-center justify-between gap-3 border-b border-brand-line px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-graphite">
          {labels.title}
        </h2>
      </header>
      <form action={formAction} className="px-4 py-2">
        <Field label={labels.name} name="firstName" defaultValue={client.firstName} required />
        <Field label={labels.surname} name="lastName" defaultValue={client.lastName} required />
        <Field label={labels.email} name="email" type="email" defaultValue={client.email ?? ""} />
        <Field label={labels.phone} name="phone" defaultValue={client.phone ?? ""} />

        <div className="flex flex-wrap items-center gap-2 border-b border-brand-line py-2">
          <label className="label !mb-0 w-44 shrink-0" htmlFor="idType">
            {labels.idType}
          </label>
          <select
            id="idType"
            name="idType"
            defaultValue={client.idType ?? ""}
            className="select max-w-sm flex-1"
          >
            <option value="">not recorded</option>
            <option value="ID_CARD">{ID_LABELS.ID_CARD}</option>
            <option value="PASSPORT">{ID_LABELS.PASSPORT}</option>
            <option value="YELLOW_SLIP">{ID_LABELS.YELLOW_SLIP}</option>
          </select>
        </div>

        <Field label={labels.idNumber} name="idNumber" defaultValue={client.idNumber ?? ""} />
        <Field label={labels.country} name="country" defaultValue={client.country ?? ""} />
        <Field label={labels.address} name="address" defaultValue={client.address ?? ""} />

        <div className="flex flex-wrap items-center gap-2 border-b border-brand-line py-2">
          <label className="label !mb-0 w-44 shrink-0" htmlFor="source">
            {labels.source}
          </label>
          <select
            id="source"
            name="source"
            defaultValue={client.source}
            className="select max-w-sm flex-1"
          >
            <option value="BUYER">Buyer</option>
            <option value="ENQUIRY">Enquiry</option>
            <option value="WEBSITE">Website</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="AGENT_REFERRAL">Agent Referral</option>
            <option value="LAND_OWNER">Land Owner</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className="py-2">
          <label className="label" htmlFor="notes">
            {labels.notes}
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={client.notes ?? ""}
            className="textarea"
          />
        </div>

        {state && "error" in state ? (
          <p className="mb-2 text-sm text-[color:var(--color-negative)]">{state.error}</p>
        ) : null}

        <div className="flex gap-2 pb-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {labels.save}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="btn btn-secondary"
            disabled={pending}
          >
            {labels.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
