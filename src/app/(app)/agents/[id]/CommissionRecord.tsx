import SubmitButton from "@/components/SubmitButton";
import { Pill } from "@/components/ui";
import type { CommissionPapers } from "@/lib/commissions";

/**
 * One agent's commission on one sale, and the two papers that finish it.
 *
 * Written to be read by somebody who did not build it. It says in a sentence
 * why the commission exists, what figure it was worked out on and how that
 * figure was reached, then asks for the two papers one at a time and says which
 * one it is still waiting for. When both are in it stops asking and says the
 * agent has been paid, with the date.
 *
 * The two papers are deliberately separate slots rather than one pile of files.
 * They mean different things, they arrive from different directions, and the
 * whole point of the record is that it can tell you which of the two is
 * missing.
 */
type Slot = {
  kind: "AGENT_INVOICE" | "AGENT_RECEIPT";
  title: string;
  hint: string;
  file: { id: string; title: string } | null;
};

export default function CommissionRecord({
  papers,
  headline,
  workedOut,
  madeUpOf,
  generatedOn,
  completedOn,
  waitingFor,
  upload,
  remove,
  labels,
}: {
  papers: CommissionPapers;
  /** "Commission on Magnum Opus Uno 302" */
  headline: string;
  /** "3% of 245,000, the full value of the property" */
  workedOut: string;
  /** "225,000 on the contract and 20,000 in cash" */
  madeUpOf: string | null;
  generatedOn: string;
  completedOn: string | null;
  /** What is still missing, or null when nothing is. */
  waitingFor: string | null;
  upload: (kind: "AGENT_INVOICE" | "AGENT_RECEIPT", formData: FormData) => void | Promise<void>;
  remove: (documentId: string) => void | Promise<void>;
  labels: {
    record: string;
    completed: string;
    waiting: string;
    invoice: string;
    invoiceHint: string;
    receipt: string;
    receiptHint: string;
    open: string;
    replace: string;
    add: string;
    generated: string;
  };
}) {
  const slots: Slot[] = [
    {
      kind: "AGENT_INVOICE",
      title: labels.invoice,
      hint: labels.invoiceHint,
      file: papers.invoice,
    },
    {
      kind: "AGENT_RECEIPT",
      title: labels.receipt,
      hint: labels.receiptHint,
      file: papers.receipt,
    },
  ];

  return (
    <section className="mt-3 rounded border border-brand-line bg-brand-surface p-3">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">{headline}</h4>
          <p className="text-xs text-brand-graphite/70">{labels.record}</p>
        </div>
        <Pill tone={papers.complete ? "good" : "warn"}>
          {papers.complete ? labels.completed : labels.waiting}
        </Pill>
      </header>

      <dl className="mb-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dd className="text-sm font-semibold">{workedOut}</dd>
          {madeUpOf ? <dd className="text-brand-graphite/70">{madeUpOf}</dd> : null}
        </div>
        <div>
          <dt className="label">{labels.generated}</dt>
          <dd>{generatedOn}</dd>
        </div>
        {completedOn ? (
          <div>
            <dt className="label">{labels.completed}</dt>
            <dd>{completedOn}</dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <div key={slot.kind} className="rounded border border-brand-line bg-brand-paper p-3">
            <p className="text-xs font-semibold">{slot.title}</p>
            <p className="mb-2 text-xs text-brand-graphite/60">{slot.hint}</p>

            {slot.file ? (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/files/${slot.file.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-brand-teal-dark hover:underline"
                >
                  {slot.file.title}
                </a>
                <a
                  href={`/api/files/${slot.file.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary !px-2 !py-1 !text-xs"
                >
                  {labels.open}
                </a>
                <form action={remove.bind(null, slot.file.id)}>
                  <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                    {labels.replace}
                  </button>
                </form>
              </div>
            ) : (
              <form
                action={upload.bind(null, slot.kind)}
                className="flex flex-wrap items-end gap-2"
              >
                <input
                  name="files"
                  type="file"
                  required
                  className="input !w-auto !flex-1 !py-1 !text-xs"
                />
                <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">
                  {labels.add}
                </SubmitButton>
              </form>
            )}
          </div>
        ))}
      </div>

      {waitingFor ? <p className="mt-2 text-xs text-brand-graphite/70">{waitingFor}</p> : null}
    </section>
  );
}
