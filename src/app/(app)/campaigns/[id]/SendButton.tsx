"use client";

import { useState, useTransition } from "react";

export default function SendButton({
  campaignId,
  action,
  count,
}: {
  campaignId: string;
  action: (campaignId: string) => Promise<void>;
  count: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <button type="button" className="btn btn-primary w-full" onClick={() => setConfirming(true)}>
        Send to {count} recipient(s)
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">
        Send now? This cannot be taken back once it has left.
      </p>
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={pending}
        onClick={() => start(() => void action(campaignId))}
      >
        {pending ? "Sending" : "Yes, send it"}
      </button>
      <button
        type="button"
        className="btn btn-secondary w-full"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </div>
  );
}
