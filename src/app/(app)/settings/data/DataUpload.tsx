"use client";

import { useState } from "react";

/*
 * The upload of a data archive, in pieces of 8 MB, with a bar that moves.
 *
 * A piece that fails is tried again three times before the upload stops, so a
 * moment of bad connection does not mean starting a 1.4 GB upload again.
 */
const PIECE = 8 * 1024 * 1024;

type Labels = {
  choose: string;
  upload: string;
  uploading: string;
  checking: string;
  ready: string;
  restart: string;
  restarting: string;
  back: string;
  failed: string;
};

export default function DataUpload({ labels, waiting }: { labels: Labels; waiting: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "checking" | "ready" | "restarting" | "error">(
    waiting ? "ready" : "idle",
  );
  const [done, setDone] = useState(0);
  const [message, setMessage] = useState("");

  const call = async (query: string, body?: Blob) => {
    const answer = await fetch(`/api/admin/import?${query}`, { method: "POST", body });
    const json = await answer.json().catch(() => ({}));
    if (!answer.ok) throw new Error(json.error || `${answer.status}`);
    return json;
  };

  const upload = async () => {
    if (!file) return;
    setState("uploading");
    setMessage("");
    try {
      const pieces = Math.ceil(file.size / PIECE);
      for (let index = 0; index < pieces; index++) {
        const piece = file.slice(index * PIECE, Math.min(file.size, (index + 1) * PIECE));
        let tries = 0;
        for (;;) {
          try {
            await call(`step=part&index=${index}`, piece);
            break;
          } catch (error) {
            if (++tries >= 3) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1500 * tries));
          }
        }
        setDone(Math.min(file.size, (index + 1) * PIECE));
      }
      setState("checking");
      const result = await call(`step=finish&size=${file.size}`);
      setMessage(`${Math.round(result.bytes / 1048576)} MB, ${result.files} files.`);
      setState("ready");
    } catch (error) {
      setMessage(`${labels.failed} ${(error as Error).message}`);
      setState("error");
    }
  };

  const restart = async () => {
    setState("restarting");
    try {
      await call("step=restart");
      /* Wait for the CRM to come back, then go to the sign in page. */
      await new Promise((resolve) => setTimeout(resolve, 8000));
      for (let i = 0; i < 90; i++) {
        const alive = await fetch("/login", { cache: "no-store" }).then((r) => r.ok).catch(() => false);
        if (alive) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      window.location.href = "/login";
    } catch (error) {
      setMessage(`${labels.failed} ${(error as Error).message}`);
      setState("error");
    }
  };

  const cancel = async () => {
    await call("step=cancel").catch(() => {});
    setState("idle");
    setDone(0);
    setMessage("");
  };

  const percent = file && file.size > 0 ? Math.round((done / file.size) * 100) : 0;

  return (
    <div className="space-y-3" data-data-upload>
      {state === "idle" || state === "error" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="archive">
              {labels.choose}
            </label>
            <input
              id="archive"
              type="file"
              accept=".tar,.tgz,.gz,application/x-tar,application/gzip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={!file} onClick={upload}>
            {labels.upload}
          </button>
        </div>
      ) : null}

      {state === "uploading" || state === "checking" ? (
        <div>
          <p className="text-sm">
            {state === "uploading" ? `${labels.uploading} ${percent}%` : labels.checking}
          </p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-brand-line">
            <div className="h-2 bg-brand-teal transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}

      {state === "ready" || state === "restarting" ? (
        <div className="space-y-2 rounded border border-brand-line bg-brand-surface p-3 text-sm">
          <p className="font-semibold">{labels.ready}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={state === "restarting"} onClick={restart} data-restart>
              {state === "restarting" ? labels.restarting : labels.restart}
            </button>
            <button type="button" className="btn btn-secondary" disabled={state === "restarting"} onClick={cancel}>
              {labels.back}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="text-sm text-brand-graphite/80">{message}</p> : null}
    </div>
  );
}
