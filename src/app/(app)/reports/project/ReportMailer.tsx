"use client";

import { useRef, useState } from "react";
import SubmitButton from "@/components/SubmitButton";

type Row = { name: string; email: string };

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Emailing the report to whoever the office writes in.
 *
 * Each line is one person: their name and their email address. The name is
 * what {name} becomes in that person's email, so one text written once greets
 * everybody by their own name. Write the subject and the text, which start from
 * a ready text the office can change. Every email carries the PDF, made out to
 * that person.
 */
export default function ReportMailer({
  action,
  defaults,
  project,
  labels,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults: { subject: string; body: string; date: string };
  project: string;
  labels: Record<string, string>;
}) {
  const [rows, setRows] = useState<Row[]>([{ name: "", email: "" }]);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const ready = rows.filter((one) => one.name.trim() && looksLikeEmail(one.email));
  const many = rows.filter((one) => one.name.trim() || one.email.trim()).length > 1;
  const usesName = /\{\{?\s*name\s*\}?\}/i.test(`${subject} ${body}`);
  const first = ready[0];
  const fill = (text: string) =>
    text
      .replace(/\{\{?\s*name\s*\}?\}/gi, first?.name.trim() || labels.theirName)
      .replace(/\{\{?\s*project\s*\}?\}/gi, project)
      .replace(/\{\{?\s*date\s*\}?\}/gi, defaults.date);

  const change = (index: number, field: keyof Row, value: string) =>
    setRows((list) => list.map((one, i) => (i === index ? { ...one, [field]: value } : one)));

  /* {name} goes where the cursor is, or at the end. */
  const insertName = () => {
    const box = bodyRef.current;
    const at = box ? box.selectionStart : body.length;
    setBody(`${body.slice(0, at)}{name}${body.slice(at)}`);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(at + 6, at + 6);
    });
  };

  return (
    <form action={action} className="space-y-4" data-report-mailer>
      {/* 1. Who: a name and an email address on each line. */}
      <div>
        <p className="label">{labels.to}</p>
        <div className="space-y-2">
          {rows.map((one, index) => {
            const started = Boolean(one.name.trim() || one.email.trim());
            return (
              <div key={index} className="flex flex-wrap items-center gap-2" data-recipient-row={index}>
                <input
                  name="toName"
                  value={one.name}
                  onChange={(event) => change(index, "name", event.target.value)}
                  placeholder={labels.namePlaceholder}
                  required={started}
                  aria-label={labels.nameLabel}
                  className="input min-w-44 flex-1"
                />
                <input
                  name="toEmail"
                  type="email"
                  value={one.email}
                  onChange={(event) => change(index, "email", event.target.value)}
                  placeholder={labels.emailPlaceholder}
                  required={started}
                  aria-label={labels.emailLabel}
                  className="input min-w-56 flex-1"
                />
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRows((list) => list.filter((_, i) => i !== index))}
                    className="btn btn-secondary !px-2 !py-1 !text-xs"
                    aria-label={labels.remove}
                    data-remove-row
                  >
                    {labels.remove}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setRows((list) => [...list, { name: "", email: "" }])}
          className="btn btn-secondary mt-2 !px-3 !py-1 !text-xs"
          data-add-row
        >
          {labels.addPerson}
        </button>
        <p className="mt-1 text-xs text-brand-graphite/60" data-picked-count>
          {ready.length} {labels.readyCount}. {labels.eachOwn}
        </p>
      </div>

      {/* 2. What */}
      <div>
        <label className="label" htmlFor="reportSubject">
          {labels.subject}
        </label>
        <input id="reportSubject" name="subject" required value={subject} onChange={(event) => setSubject(event.target.value)} className="input" />
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="label !mb-0" htmlFor="reportBody">
            {labels.body}
          </label>
          <button type="button" onClick={insertName} className="btn btn-secondary !px-2 !py-0.5 !font-mono !text-xs" data-insert-name>
            {"{name}"}
          </button>
        </div>
        <textarea
          id="reportBody"
          ref={bodyRef}
          name="body"
          required
          rows={11}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="input font-sans"
        />
        {many && !usesName ? (
          <p className="mt-1 text-xs font-semibold text-[color:var(--color-warning,#b7791f)]" data-name-hint>
            {labels.nameMissing}
          </p>
        ) : (
          <p className="mt-1 text-xs text-brand-graphite/60" data-name-hint>
            {labels.nameHint}
          </p>
        )}
      </div>

      {/* 3. What it looks like, for the first person written in */}
      <div className="rounded border border-brand-line bg-brand-surface p-3 text-sm" data-report-preview-mail>
        <p className="label">
          {labels.preview} {first?.name.trim() || labels.theirName}
        </p>
        <p className="mb-2 font-semibold">{fill(subject)}</p>
        <pre className="whitespace-pre-wrap font-sans text-sm">{fill(body)}</pre>
        <p className="mt-2 text-xs text-brand-graphite/60">{labels.attached}</p>
      </div>

      {ready.length === 0 ? (
        <p className="text-sm text-brand-graphite/60">{labels.pickSomeone}</p>
      ) : (
        <SubmitButton className="btn btn-primary" pendingLabel={labels.sending}>
          {ready.length === 1 ? `${labels.sendOne} ${first?.name.trim() ?? ""}` : `${labels.sendMany} (${ready.length})`}
        </SubmitButton>
      )}
    </form>
  );
}
