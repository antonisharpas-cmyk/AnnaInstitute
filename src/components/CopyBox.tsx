"use client";

import { useState } from "react";

/**
 * A value with a copy button. Used for keys and endpoints, which are long enough
 * that selecting them by hand invites a mistake.
 */
export default function CopyBox({
  value,
  label,
  copyLabel = "Copy",
  copiedLabel = "Copied",
}: {
  value: string;
  label?: string;
  copyLabel?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      {label ? <p className="label">{label}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded border border-brand-line bg-brand-surface px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <button
          type="button"
          className="btn btn-secondary !px-3 !py-1 !text-xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}
