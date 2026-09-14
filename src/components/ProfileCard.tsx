"use client";

import { useActionState, useEffect, useState } from "react";

export type ProfileField = {
  name: string;
  label: string;
  /** What the card shows when it is not being edited. Defaults to the value. */
  display?: string;
  value?: string;
  kind?: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "number";
  options?: { value: string; label: string }[];
  checked?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

type State = { ok: true } | { error: string } | null;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-brand-line py-2 last:border-b-0">
      <span className="label !mb-0 w-44 shrink-0">{label}</span>
      <span className="min-w-0 break-words text-sm">{value}</span>
    </div>
  );
}

/**
 * A record's own card: everything about it, read only until somebody presses
 * Edit, and then editable in the same place rather than on another page. The
 * same card is used for an agent and for a partner, so the two read alike.
 */
export default function ProfileCard({
  title,
  fields,
  action,
  labels,
}: {
  title: string;
  fields: ProfileField[];
  action: (prev: State, formData: FormData) => Promise<State>;
  labels: { edit: string; save: string; cancel: string };
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<State, FormData>(action, null);

  useEffect(() => {
    if (state && "ok" in state) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <section className="card">
        <header className="flex items-center justify-between gap-3 border-b border-brand-line px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-graphite">
            {title}
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
          {fields.map((field) =>
            field.kind === "textarea" ? (
              <div key={field.name} className="py-2">
                <span className="label">{field.label}</span>
                <p className="whitespace-pre-wrap text-sm">{field.display ?? field.value ?? ""}</p>
              </div>
            ) : (
              <Line
                key={field.name}
                label={field.label}
                value={
                  field.kind === "checkbox"
                    ? (field.display ?? (field.checked ? "yes" : "no"))
                    : (field.display ?? field.value ?? "")
                }
              />
            ),
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <header className="flex items-center justify-between gap-3 border-b border-brand-line px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-graphite">
          {title}
        </h2>
      </header>
      <form action={formAction} className="px-4 py-2">
        {fields.map((field) => {
          if (field.kind === "textarea") {
            return (
              <div key={field.name} className="py-2">
                <label className="label" htmlFor={field.name}>
                  {field.label}
                </label>
                <textarea
                  id={field.name}
                  name={field.name}
                  rows={3}
                  defaultValue={field.value ?? ""}
                  className="textarea"
                />
              </div>
            );
          }

          if (field.kind === "checkbox") {
            return (
              <div
                key={field.name}
                className="flex flex-wrap items-center gap-2 border-b border-brand-line py-2 last:border-b-0"
              >
                <span className="label !mb-0 w-44 shrink-0">{field.label}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={field.name} defaultChecked={field.checked} />
                  <span>{field.hint ?? ""}</span>
                </label>
              </div>
            );
          }

          if (field.kind === "select") {
            return (
              <div
                key={field.name}
                className="flex flex-wrap items-center gap-2 border-b border-brand-line py-2 last:border-b-0"
              >
                <label className="label !mb-0 w-44 shrink-0" htmlFor={field.name}>
                  {field.label}
                </label>
                <select
                  id={field.name}
                  name={field.name}
                  defaultValue={field.value ?? ""}
                  className="select max-w-sm flex-1"
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div
              key={field.name}
              className="flex flex-wrap items-center gap-2 border-b border-brand-line py-2 last:border-b-0"
            >
              <label className="label !mb-0 w-44 shrink-0" htmlFor={field.name}>
                {field.label}
              </label>
              <input
                id={field.name}
                name={field.name}
                type={field.kind === "number" ? "text" : (field.kind ?? "text")}
                inputMode={field.kind === "number" ? "decimal" : undefined}
                required={field.required}
                defaultValue={field.value ?? ""}
                placeholder={field.placeholder}
                className="input max-w-sm flex-1"
              />
            </div>
          );
        })}

        {state && "error" in state ? (
          <p className="py-2 text-sm text-[color:var(--color-negative)]">{state.error}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-brand-line py-3">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {labels.save}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary">
            {labels.cancel}
          </button>
        </div>
      </form>
    </section>
  );
}
