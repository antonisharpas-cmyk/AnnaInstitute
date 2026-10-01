"use client";

import { useActionState, useState } from "react";
import { signIn, type SignInState } from "./actions";

type Labels = {
  email: string;
  password: string;
  submit: string;
  failed: string;
  show: string;
  hide: string;
};

export default function LoginForm({ labels }: { labels: Labels }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, null);
  /* The eye: shows the password while it is being typed, for the one time in
     ten it goes wrong, and hides it again with the same press. */
  const [shown, setShown] = useState(false);

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
        <div className="relative">
          <input
            id="password"
            name="password"
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            required
            className="input !pr-11"
          />
          <button
            type="button"
            onClick={() => setShown((was) => !was)}
            aria-label={shown ? labels.hide : labels.show}
            title={shown ? labels.hide : labels.show}
            aria-pressed={shown}
            data-password-eye
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r text-brand-graphite/60 hover:text-brand-teal-dark focus-visible:outline-2 focus-visible:outline-brand-teal"
          >
            {shown ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3l18 18" />
                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                <path d="M9.4 5.2A9.7 9.7 0 0 1 12 5c5 0 8.5 4.2 9.6 6.2a1.6 1.6 0 0 1 0 1.6 17 17 0 0 1-3.1 3.8" />
                <path d="M6.3 6.4A16.6 16.6 0 0 0 2.4 11.2a1.6 1.6 0 0 0 0 1.6C3.5 14.8 7 19 12 19a9.4 9.4 0 0 0 4.6-1.2" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.4 11.2C3.5 9.2 7 5 12 5s8.5 4.2 9.6 6.2a1.6 1.6 0 0 1 0 1.6C20.5 14.8 17 19 12 19s-8.5-4.2-9.6-6.2a1.6 1.6 0 0 1 0-1.6z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
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
