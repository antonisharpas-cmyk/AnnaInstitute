import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";

/**
 * Recording money, and asking for a change, from either side of the same deal.
 *
 * A contract is about one apartment and one buyer, so the office should not have
 * to remember which page a job lives on: a payment can be receipted from the
 * contract or from the buyer's own profile, and the form is this one either way.
 * Written once, so the two can never ask different questions or save different
 * things.
 */

/**
 * How the money arrived.
 *
 * A list rather than a text box, because "Cash", "cash", "CASH" and "Καπνός"
 * in the same column is what makes a report useless later. Anything unusual
 * goes under Other and the note beside it says what it was.
 */
export const PAYMENT_METHODS = ["CASH", "BANK", "CHEQUE", "CARD", "OTHER"] as const;

export type ScheduleLine = {
  id: string;
  seq: number;
  label: string;
  /** Formatted for reading, since the money is formatted by the caller. */
  amount: string;
};

export function PaymentForm({
  action,
  lines,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  lines: ScheduleLine[];
  labels: {
    stage: string;
    notAgainstOne: string;
    amount: string;
    date: string;
    receipt: string;
    method: string;
    methods: Record<string, string>;
    chooseMethod: string;
    files: string;
    filesNote: string;
    fileTitle: string;
    fileTitlePlaceholder: string;
    save: string;
  };
  /** Ties the field ids apart when two of these are on one page. */
}) {
  return (
    <form
      action={action}
      className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-3"
    >
      <div>
        <label className="label">{labels.stage}</label>
        <select name="installmentId" className="select">
          <option value="">{labels.notAgainstOne}</option>
          {lines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.seq}. {line.label} . {line.amount}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{labels.amount}</label>
        <input name="amount" required className="input" />
      </div>
      <div>
        <label className="label">{labels.date}</label>
        <DateField name="paidOn" />
      </div>
      <div>
        <label className="label">{labels.receipt}</label>
        <input name="receiptNumber" className="input" />
      </div>
      <div>
        <label className="label">{labels.method}</label>
        <select name="method" className="select" defaultValue="">
          <option value="">{labels.chooseMethod}</option>
          {PAYMENT_METHODS.map((one) => (
            <option key={one} value={one}>
              {labels.methods[one] ?? one}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">{labels.files}</label>
        <input name="files" type="file" multiple className="input !py-1.5 text-xs" />
        <p className="mt-1 text-xs text-brand-graphite/60">{labels.filesNote}</p>
      </div>
      <div>
        <label className="label">{labels.fileTitle}</label>
        <input name="fileTitle" placeholder={labels.fileTitlePlaceholder} className="input" />
      </div>
      <div className="flex items-end">
        <SubmitButton>{labels.save}</SubmitButton>
      </div>
    </form>
  );
}

export function ChangeRequestForm({
  action,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  labels: {
    name: string;
    notes: string;
    amount: string;
    files: string;
    add: string;
  };
}) {
  return (
    <form
      action={action}
      className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label className="label">{labels.name}</label>
        <input name="title" required className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">{labels.notes}</label>
        <textarea name="description" rows={2} className="textarea" />
      </div>
      <div>
        <label className="label">{labels.amount}</label>
        <input name="costImpact" className="input" />
      </div>
      <div>
        <label className="label">{labels.files}</label>
        <input name="files" type="file" multiple className="input !py-1.5 text-xs" />
      </div>
      <div className="flex items-end sm:col-span-2">
        <SubmitButton>{labels.add}</SubmitButton>
      </div>
    </form>
  );
}
