import Link from "next/link";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";

export type ExpenseRecord = {
  supplier: string;
  category: string;
  reference: string | null;
  description: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  netAmount: string;
  vatAmount: string;
  totalAmount: string;
  paidAmount: string;
  projectId: string | null;
  notes: string | null;
};

const day = (value: Date | null) => (value ? new Date(value).toISOString().slice(0, 10) : "");

const plain = (value: string | null | undefined) => {
  if (!value) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Math.abs(n) % 1 === 0 ? String(Math.round(n)) : n.toFixed(2);
};

/**
 * One invoice the company has been sent.
 *
 * VAT is kept apart from the net so the accountant can read either, and the
 * total is worked out unless somebody types their own, because a supplier's
 * rounding is theirs, not ours.
 */
export default function ExpenseForm({
  action,
  expense,
  projects,
  categories,
  cancelHref,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  expense?: ExpenseRecord;
  projects: { id: string; name: string }[];
  categories: { value: string; label: string }[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="supplier">
            {labels.supplier}
          </label>
          <input
            id="supplier"
            name="supplier"
            required
            defaultValue={expense?.supplier ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="category">
            {labels.category}
          </label>
          <select
            id="category"
            name="category"
            defaultValue={expense?.category ?? "MARKETING"}
            className="select"
          >
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="reference">
            {labels.reference}
          </label>
          <input
            id="reference"
            name="reference"
            defaultValue={expense?.reference ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="description">
            {labels.description}
          </label>
          <input
            id="description"
            name="description"
            defaultValue={expense?.description ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="issueDate">
            {labels.issued}
          </label>
          <DateField
            id="issueDate"
            name="issueDate"
            defaultValue={day(expense?.issueDate ?? null)}
          />
        </div>
        <div>
          <label className="label" htmlFor="dueDate">
            {labels.due}
          </label>
          <DateField id="dueDate" name="dueDate" defaultValue={day(expense?.dueDate ?? null)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="netAmount">
            {labels.net}
          </label>
          <input
            id="netAmount"
            name="netAmount"
            inputMode="decimal"
            defaultValue={plain(expense?.netAmount)}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="vatAmount">
            {labels.vat}
          </label>
          <input
            id="vatAmount"
            name="vatAmount"
            inputMode="decimal"
            defaultValue={plain(expense?.vatAmount)}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="totalAmount">
            {labels.total}
          </label>
          <input
            id="totalAmount"
            name="totalAmount"
            inputMode="decimal"
            defaultValue={plain(expense?.totalAmount)}
            placeholder={labels.totalNote}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="paidAmount">
            {labels.alreadyPaid}
          </label>
          <input
            id="paidAmount"
            name="paidAmount"
            inputMode="decimal"
            defaultValue={plain(expense?.paidAmount)}
            className="input"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="projectId">
            {labels.project}
          </label>
          <select
            id="projectId"
            name="projectId"
            defaultValue={expense?.projectId ?? ""}
            className="select"
          >
            <option value="">{labels.noProject}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="files">
            {labels.files}
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
            className="input !py-1.5 text-xs"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.filesNote}</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          {labels.notes}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={expense?.notes ?? ""}
          className="textarea"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-brand-line pt-4">
        <SubmitButton>{labels.save}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
