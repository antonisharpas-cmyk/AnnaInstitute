"use client";

import { useActionState, useState } from "react";
import { startFreshAction, type FreshState } from "./freshActions";

/** The button that clears the sales records, behind a typed word. */
export default function FreshStart({
  labels,
}: {
  labels: { type: string; button: string; working: string; wrongWord: string; done: string; failed: string };
}) {
  const [state, action, pending] = useActionState<FreshState, FormData>(startFreshAction, null);
  const [word, setWord] = useState("");
  const fill = (text: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);

  if (state?.ok) {
    return (
      <p className="rounded border border-[color:var(--color-positive)] bg-brand-paper px-3 py-2 text-sm" data-fresh-done>
        {fill(labels.done, state.result)}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3" data-fresh-form>
      {state && !state.ok ? (
        <p className="text-sm text-[color:var(--color-negative)]" data-fresh-said>
          {state.wrongWord ? labels.wrongWord : fill(labels.failed, { error: state.error })}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="freshConfirm">
          {labels.type}
        </label>
        <input
          id="freshConfirm"
          name="confirm"
          value={word}
          onChange={(event) => setWord(event.target.value)}
          autoComplete="off"
          className="input sm:max-w-xs"
        />
      </div>
      <button
        type="submit"
        disabled={pending || word.trim() !== "CLEAR"}
        className="btn btn-primary !bg-[color:var(--color-negative)]"
        data-fresh-button
      >
        {pending ? labels.working : labels.button}
      </button>
    </form>
  );
}
