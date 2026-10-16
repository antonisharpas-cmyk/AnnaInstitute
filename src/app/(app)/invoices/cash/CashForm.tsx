import type { MessageKey } from "@/i18n";
import type { Option } from "@/lib/choices";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";

type CashRecord = {
  direction: string;
  entryDate: Date;
  amount: string;
  party: string;
  category: string;
  categoryChoice: string | null;
  categoryOther: string | null;
  projectId: string | null;
  ourCompanyId: string;
  description: string | null;
  notes: string | null;
};

/**
 * One cash record, new or changed: which way the money went, when, how much,
 * who, what for, which development and which of our companies. No VAT and no
 * papers, on purpose.
 */
export default function CashForm({
  action,
  entry,
  categories,
  projects,
  companies,
  names,
  t,
}: {
  action: (formData: FormData) => void | Promise<void>;
  entry?: CashRecord;
  categories: Option[];
  projects: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  names: string[];
  t: (key: MessageKey) => string;
}) {
  const shown = entry ? (entry.categoryChoice ?? entry.category) : "";
  const day = (entry?.entryDate ?? new Date()).toISOString().slice(0, 10);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-cash-form>
      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="label">{t("cash.which")}</legend>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="direction" value="OUT" defaultChecked={(entry?.direction ?? "OUT") === "OUT"} />
            {t("cash.wePaid")}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="direction" value="IN" defaultChecked={entry?.direction === "IN"} />
            {t("cash.weReceived")}
          </label>
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="entryDate">
          {t("common.date")} *
        </label>
        <DateField id="entryDate" name="entryDate" defaultValue={day} />
      </div>
      <div>
        <label className="label" htmlFor="amount">
          {t("cash.amount")} *
        </label>
        <input id="amount" name="amount" inputMode="decimal" required defaultValue={entry ? entry.amount : ""} className="input" autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="party">
          {t("cash.party")} *
        </label>
        <input id="party" name="party" required list="cash-names" defaultValue={entry?.party ?? ""} className="input" autoComplete="off" />
        <datalist id="cash-names">
          {names.map((one) => (
            <option key={one} value={one} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="category">
          {t("cash.whatFor")}
        </label>
        <select id="category" name="category" defaultValue={shown || "OTHER"} className="select">
          {categories.map((one) => (
            <option key={one.value} value={one.value}>
              {one.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="categoryOther">
          {t("cash.otherWhat")}
        </label>
        <input id="categoryOther" name="categoryOther" defaultValue={entry?.categoryOther ?? ""} className="input" autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="projectId">
          {t("projects.title")}
        </label>
        <select id="projectId" name="projectId" defaultValue={entry?.projectId ?? "NONE"} className="select">
          <option value="NONE">{t("invoices.noProject")}</option>
          {projects.map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="ourCompanyId">
          {t("cash.ourCompany")}
        </label>
        <select id="ourCompanyId" name="ourCompanyId" defaultValue={entry?.ourCompanyId ?? ""} className="select">
          {companies.map((one) => (
            <option key={one.id || "own"} value={one.id}>
              {one.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="description">
          {t("cash.description")}
        </label>
        <input id="description" name="description" defaultValue={entry?.description ?? ""} className="input" autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">
          {t("common.notes")}
        </label>
        <input id="notes" name="notes" defaultValue={entry?.notes ?? ""} className="input" autoComplete="off" />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <SubmitButton>{t("common.save")}</SubmitButton>
        <p className="text-xs text-brand-graphite/60">{t("cash.formNote")}</p>
      </div>
    </form>
  );
}
