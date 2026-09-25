"use client";

import { useFormStatus } from "react-dom";

/**
 * A save button that knows it has been pressed.
 *
 * It goes quiet and shows a spinner while the server is working, which stops
 * the double click that would otherwise record a payment twice.
 */
export default function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
  pending: sentByHand,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  /** For a form sent by hand, which React cannot see as pending. */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = sentByHand ?? status.pending;

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <span className="spinner" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
