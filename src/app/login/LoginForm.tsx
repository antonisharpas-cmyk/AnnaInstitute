"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

type Labels = {
  email: string;
  password: string;
  submit: string;
  failed: string;
};

export default function LoginForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          {labels.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          {labels.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>

      {state?.error === "credentials" ? (
        <p className="text-sm text-[color:var(--color-negative)]">{labels.failed}</p>
      ) : null}

      {state?.error === "setup" ? (
        <div className="rounded border border-[color:var(--color-warning)] bg-white p-3 text-xs text-brand-graphite">
          <p className="mb-1 font-semibold text-[color:var(--color-warning)]">
            Not a password problem. The database is not set up yet.
          </p>
          <p>{state.detail}</p>
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {labels.submit}
      </button>
    </form>
  );
}
