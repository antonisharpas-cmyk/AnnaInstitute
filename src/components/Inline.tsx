"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Changing one field without leaving the list.
 *
 * The whole point of a CRM list is that most of the day's work is one small
 * change to one field, and the navigate, edit, save, come back loop is what
 * makes that work feel slow. So the cell itself is the form: the new value
 * shows at once, a quiet dot says it is being saved, and if the server refuses
 * it the old value comes back with the reason under the cell, never in a
 * message box somewhere else on the screen.
 */

/**
 * A cell that has just been saved is worth a moment of green.
 *
 * It is the only way somebody changing a run of statuses can tell, at a
 * glance, which rows they have already done.
 */
function useJustSaved(): [boolean, () => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setOn(false), 1100);
    return () => clearTimeout(timer);
  }, [on]);

  return [on, () => setOn(true)];
}

export function InlineSelect({
  value,
  options,
  save,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  save: (value: string) => Promise<{ error?: string } | void>;
  label: string;
}) {
  const [shown, setShown] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saved, saySaved] = useJustSaved();

  useEffect(() => setShown(value), [value]);

  return (
    <span
      className={`inline-cell ${saved ? "just-saved" : ""}`}
      data-pending={pending}
      data-bad={error !== null}
    >
      <select
        aria-label={label}
        value={shown}
        disabled={pending}
        className="inline-select"
        onChange={(event) => {
          const next = event.target.value;
          const before = shown;
          setShown(next);
          setError(null);
          start(async () => {
            const answer = await save(next);
            if (answer && "error" in answer && answer.error) {
              setShown(before);
              setError(answer.error);
            } else {
              saySaved();
            }
          });
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {pending ? <span className="inline-dot" aria-hidden="true" /> : null}
      {error ? <span className="inline-error">{error}</span> : null}
    </span>
  );
}

export function InlineText({
  value,
  save,
  label,
  placeholder,
  kind = "text",
}: {
  value: string;
  save: (value: string) => Promise<{ error?: string } | void>;
  label: string;
  placeholder?: string;
  kind?: "text" | "email" | "tel";
}) {
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState(value);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShown(value);
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) field.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === shown) return;

    const before = shown;
    setShown(next);
    setError(null);
    start(async () => {
      const answer = await save(next);
      if (answer && "error" in answer && answer.error) {
        setShown(before);
        setDraft(before);
        setError(answer.error);
      }
    });
  };

  if (!editing) {
    return (
      <span className="inline-cell" data-pending={pending} data-bad={error !== null}>
        <button
          type="button"
          className="inline-read"
          onClick={() => setEditing(true)}
          title={label}
        >
          {shown || <span className="inline-empty">{placeholder ?? "―"}</span>}
        </button>
        {pending ? <span className="inline-dot" aria-hidden="true" /> : null}
        {error ? <span className="inline-error">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-cell">
      <input
        ref={field}
        type={kind}
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        className="inline-input"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(shown);
            setEditing(false);
          }
        }}
      />
    </span>
  );
}
