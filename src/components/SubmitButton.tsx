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
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <span className="spinner" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
