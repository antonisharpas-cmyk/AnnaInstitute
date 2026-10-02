"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/*
 * The company's logo: choosing the picture is enough.
 *
 * The picture shows in the box straight away, from the computer itself, and
 * is sent at the same moment. When the server has it, the line under the box
 * says so and the page is drawn again with the saved one. Any picture will do:
 * the server turns it into the PNG the papers print.
 */
export default function LogoUpload({
  issuer,
  name,
  current,
  color,
  labels,
}: {
  issuer: string;
  name: string;
  /** The address of the saved logo, or nothing yet. */
  current: string | null;
  color: string;
  labels: {
    choose: string;
    uploading: string;
    hint: string;
    saved: string;
    failed: string;
    none: string;
    remove: string;
  };
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  /* Marked once the page can answer the choice, which the tests wait for. */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  /* The saved one has arrived from the server: show that instead of the copy. */
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
    setPreview(null);
  }, [current]);

  const send = async (body: FormData) => {
    setState("sending");
    setMessage("");
    try {
      body.set("issuer", issuer);
      const answer = await fetch("/api/companies/logo", { method: "POST", body });
      const json = await answer.json().catch(() => ({}));
      if (!answer.ok) throw new Error(json.error || `${answer.status}`);
      setState("saved");
      setMessage(labels.saved);
      router.refresh();
      /*
        The same last line as everywhere else in the CRM (see AfterSave): the
        router now and then fetches the page again and never draws it. If the
        saved logo is not on the page a moment later, the page is loaded again.
      */
      const before = latest.current;
      window.setTimeout(() => {
        if (latest.current === before) window.location.reload();
      }, 2500);
    } catch (error) {
      setState("error");
      setMessage(`${labels.failed} ${(error as Error).message}`);
    }
  };

  const shown = preview ?? current;

  return (
    <div className="space-y-2" data-logo-form data-ready={ready ? "yes" : undefined} data-logo-state={state}>
      <div
        className="flex h-24 w-56 items-center justify-center rounded border border-brand-line bg-white p-2"
        style={{ borderTop: `4px solid ${color}` }}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={name} className="max-h-20 max-w-full object-contain" data-company-logo />
        ) : (
          <span className="text-xs text-brand-graphite/60">{labels.none}</span>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="logo">
            {labels.choose}
          </label>
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="text-sm"
            disabled={state === "sending"}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              setPreview(URL.createObjectURL(file));
              const body = new FormData();
              body.set("logo", file);
              void send(body);
              event.currentTarget.value = "";
            }}
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.hint}</p>
        </div>
        {current ? (
          <button
            type="button"
            className="btn btn-secondary !px-2 !py-1 !text-xs"
            disabled={state === "sending"}
            onClick={() => {
              setPreview(null);
              const body = new FormData();
              body.set("remove", "yes");
              void send(body);
            }}
          >
            {labels.remove}
          </button>
        ) : null}
      </div>
      {state === "sending" ? (
        <p className="text-xs text-brand-graphite/70">{labels.uploading}...</p>
      ) : message ? (
        <p
          className={`text-xs ${state === "error" ? "text-[color:var(--color-negative)]" : "text-[color:var(--color-positive)]"}`}
          data-logo-message
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
