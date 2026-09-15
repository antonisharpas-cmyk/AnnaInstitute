import { IconAlert } from "@/components/icons";

/**
 * The page somebody sees when the database is behind the code.
 *
 * It replaces the whole CRM on purpose: every page would fail on the same
 * missing piece, so one clear instruction is more use than twenty stack traces.
 * The commands are written out in full, including the part people forget, which
 * is that the local database can only be opened by one process at a time.
 */
export default function SchemaGap({
  gaps,
  labels,
}: {
  gaps: { what: string; migration: string }[];
  labels: {
    title: string;
    note: string;
    missing: string;
    how: string;
    stop: string;
    run: string;
    start: string;
    warn: string;
  };
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="card p-6">
        <span className="nothing-mark" style={{ margin: 0 }}>
          <IconAlert size={20} />
        </span>

        <h1 className="mt-3 text-lg font-semibold text-brand-ink">{labels.title}</h1>
        <p className="mt-1 text-sm text-brand-graphite">{labels.note}</p>

        <p className="statlabel mt-5">{labels.missing}</p>
        <ul className="mt-1 space-y-1 text-sm">
          {gaps.map((gap) => (
            <li key={gap.what} className="flex items-baseline justify-between gap-3">
              <span>{gap.what}</span>
              <span className="pill">{gap.migration}</span>
            </li>
          ))}
        </ul>

        <p className="statlabel mt-5">{labels.how}</p>
        <ol className="mt-1 space-y-1.5 text-sm">
          <li>1. {labels.stop}</li>
          <li>
            2. <code className="kbd">npm run db:migrate</code>
          </li>
          <li>3. {labels.start}</li>
        </ol>

        <p className="mt-4 text-xs text-brand-graphite/70">{labels.warn}</p>
      </div>
    </main>
  );
}
