"use client";

import { useState } from "react";

/*
 * Who gets the development's report: the shareholders, ticked, and anybody
 * else typed one a line. Each gets their own email with their own copy.
 */
export default function ReportSender({
  projectId,
  people,
  labels,
}: {
  projectId: string;
  people: { name: string; email: string; company: string }[];
  labels: { who: string; none: string; noEmail: string; extra: string; extraHint: string; note: string; send: string; sending: string; preview: string };
}) {
  const [ticked, setTicked] = useState<Set<number>>(() => new Set(people.map((one, i) => (one.email ? i : -1)).filter((i) => i >= 0)));
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const others = extra
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const email = line.match(/[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/)?.[0] ?? "";
      const name = line.replace(email, "").replace(/[<>,;]+/g, " ").trim();
      return { name, email };
    });
  const chosen = [...people.filter((_, i) => ticked.has(i)), ...others.filter((one) => one.email)];

  const send = async () => {
    setBusy(true);
    setSaid(null);
    try {
      const answer = await fetch("/api/reports/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: projectId, recipients: chosen, note }),
      });
      const json = await answer.json().catch(() => ({ ok: false, detail: `${answer.status}` }));
      setSaid({ ok: Boolean(json.ok), text: json.detail ?? "" });
    } catch (error) {
      setSaid({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-report-sender>
      <span className="label">{labels.who}</span>
      {people.length === 0 ? <p className="text-sm text-brand-graphite/60">{labels.none}</p> : null}
      <ul className="space-y-1">
        {people.map((one, i) => (
          <li key={`${one.name}-${i}`}>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!one.email}
                checked={ticked.has(i)}
                onChange={(event) =>
                  setTicked((was) => {
                    const next = new Set(was);
                    if (event.target.checked) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
                data-report-person={one.email}
              />
              <span className="font-semibold">{one.name}</span>
              <span className="text-brand-graphite/60">
                {one.email || labels.noEmail} . {one.company}
              </span>
              {one.email ? (
                <a href={`/api/reports/project?project=${projectId}&for=${encodeURIComponent(one.name)}`} target="_blank" rel="noreferrer" className="text-xs text-brand-teal-dark underline">
                  {labels.preview}
                </a>
              ) : null}
            </label>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="reportExtra">
            {labels.extra}
          </label>
          <textarea id="reportExtra" rows={3} value={extra} onChange={(event) => setExtra(event.target.value)} className="textarea" placeholder={labels.extraHint} />
        </div>
        <div>
          <label className="label" htmlFor="reportNote">
            {labels.note}
          </label>
          <textarea id="reportNote" rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="textarea" />
        </div>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={send} data-report-send>
        {busy ? `${labels.sending}...` : `${labels.send} (${chosen.length})`}
      </button>
      {said ? (
        <p className={`text-sm ${said.ok ? "text-[color:var(--color-positive)]" : "text-[color:var(--color-negative)]"}`} data-report-said>
          {said.text}
        </p>
      ) : null}
    </div>
  );
}
