"use client";

import { useMemo, useState } from "react";
import type { PackGroup, PackItem } from "@/lib/accountantPack";

/*
 * The month's papers with a tick beside each, grouped by kind, and the two
 * things to do with what is ticked: download it as one ZIP, or email it to
 * the accountant. Voided and credited papers are listed, marked, and left
 * unticked, since the accountant usually wants what stands.
 */

type Labels = {
  groups: Record<PackGroup, string>;
  all: string;
  none: string;
  nothing: string;
  number: string;
  date: string;
  party: string;
  about: string;
  total: string;
  voided: string;
  credited: string;
  noFile: string;
  chosen: string;
  to: string;
  toHint: string;
  note: string;
  noteHint: string;
  download: string;
  downloading: string;
  send: string;
  sending: string;
};

const eur = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

export default function PackPicker({
  month,
  items,
  groups,
  defaultTo,
  labels,
}: {
  month: string;
  items: PackItem[];
  groups: PackGroup[];
  defaultTo: string;
  labels: Labels;
}) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(items.filter((one) => !one.state).map((one) => one.key)));
  const [to, setTo] = useState(defaultTo);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "download" | "send">("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  const byGroup = useMemo(() => groups.map((group) => ({ group, rows: items.filter((one) => one.group === group) })), [groups, items]);
  const chosen = items.filter((one) => ticked.has(one.key));
  const flip = (keys: string[], on: boolean) =>
    setTicked((was) => {
      const next = new Set(was);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  const call = async (mode: "download" | "send") => {
    setBusy(mode);
    setSaid(null);
    try {
      const answer = await fetch("/api/accountant/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, keys: [...ticked], mode, to, note }),
      });
      if (mode === "download" && answer.ok) {
        const blob = await answer.blob();
        const name = decodeURIComponent((answer.headers.get("Content-Disposition") ?? "").match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "papers.zip");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      } else {
        const json = await answer.json().catch(() => ({ ok: false, detail: `${answer.status}` }));
        setSaid({ ok: Boolean(json.ok), text: json.detail ?? "" });
      }
    } catch (error) {
      setSaid({ ok: false, text: (error as Error).message });
    } finally {
      setBusy("");
    }
  };

  if (items.length === 0) return <p className="text-sm text-brand-graphite/60">{labels.nothing}</p>;

  return (
    <div className="space-y-5" data-pack>
      {byGroup
        .filter((one) => one.rows.length > 0)
        .map(({ group, rows }) => {
          const keys = rows.map((one) => one.key);
          const on = keys.filter((key) => ticked.has(key)).length;
          return (
            <section key={group} data-pack-group={group}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-graphite">
                  {labels.groups[group]} ({on} / {rows.length})
                </h3>
                <button type="button" className="text-xs text-brand-teal-dark underline" onClick={() => flip(keys, true)}>
                  {labels.all}
                </button>
                <button type="button" className="text-xs text-brand-teal-dark underline" onClick={() => flip(keys, false)}>
                  {labels.none}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      <th>{labels.number}</th>
                      <th>{labels.date}</th>
                      <th>{labels.party}</th>
                      <th>{labels.about}</th>
                      <th className="ctr">{labels.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((one) => (
                      <tr key={one.key} className={one.state ? "opacity-60" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={ticked.has(one.key)}
                            onChange={(event) => flip([one.key], event.target.checked)}
                            aria-label={`${labels.groups[group]} ${one.number}`}
                            data-pack-item={one.key}
                          />
                        </td>
                        <td className="nowrap font-semibold">
                          {one.number}
                          {one.state ? (
                            <span className="ml-1 text-xs font-normal">({one.state === "voided" ? labels.voided : labels.credited})</span>
                          ) : null}
                        </td>
                        <td className="nowrap text-xs">{day(one.date)}</td>
                        <td className="text-xs">
                          {one.party}
                          <div className="text-brand-graphite/60">{one.company}</div>
                        </td>
                        <td className="text-xs">
                          {one.about}
                          {one.files === 0 ? <div className="text-[color:var(--color-negative)]">{labels.noFile}</div> : null}
                        </td>
                        <td className="ctr nowrap">{eur(one.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

      <div className="space-y-3 rounded border border-brand-line bg-brand-surface p-3">
        <p className="text-sm font-semibold" data-pack-chosen>
          {labels.chosen.replace("{n}", String(chosen.length)).replace("{total}", eur(chosen.reduce((a, one) => a + one.totalCents, 0)))}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="packTo">
              {labels.to}
            </label>
            <input id="packTo" value={to} onChange={(event) => setTo(event.target.value)} className="input" placeholder="accountant@example.com" />
            <p className="mt-1 text-xs text-brand-graphite/60">{labels.toHint}</p>
          </div>
          <div>
            <label className="label" htmlFor="packNote">
              {labels.note}
            </label>
            <input id="packNote" value={note} onChange={(event) => setNote(event.target.value)} className="input" placeholder={labels.noteHint} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" disabled={busy !== "" || chosen.length === 0} onClick={() => call("download")} data-pack-download>
            {busy === "download" ? `${labels.downloading}...` : labels.download}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy !== "" || chosen.length === 0 || !to.trim()} onClick={() => call("send")} data-pack-send>
            {busy === "send" ? `${labels.sending}...` : labels.send}
          </button>
        </div>
        {said ? (
          <p className={`text-sm ${said.ok ? "text-[color:var(--color-positive)]" : "text-[color:var(--color-negative)]"}`} data-pack-said>
            {said.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
