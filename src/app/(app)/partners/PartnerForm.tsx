import Link from "next/link";
import type { MessageKey } from "@/i18n";
import type { Option } from "@/lib/choices";
import SubmitButton from "@/components/SubmitButton";
import CategoryField from "./CategoryField";

type PartnerRecord = {
  name: string;
  category: string;
  categoryOther?: string | null;
  email: string | null;
  mobile: string | null;
  locationUrl?: string | null;
  notes: string | null;
};

/** The one form for a partner, new or changed. */
export default function PartnerForm({
  action,
  partner,
  categories,
  defaultCategory,
  t,
}: {
  action: (formData: FormData) => void | Promise<void>;
  partner?: PartnerRecord;
  categories: Option[];
  defaultCategory?: string;
  t: (key: MessageKey) => string;
}) {
  return (
    <form action={action} className="space-y-4" data-partner-form>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            {t("partners.name")} *
          </label>
          <input id="name" name="name" required defaultValue={partner?.name ?? ""} className="input" autoComplete="off" />
        </div>
        <CategoryField
          categories={categories}
          defaultCategory={partner?.category ?? defaultCategory ?? ""}
          defaultOther={partner?.categoryOther ?? ""}
          labels={{
            category: t("partners.categoryLabel"),
            pick: t("partners.pickCategory"),
            other: t("partners.otherKind"),
            otherHint: t("partners.otherKindHint"),
            otherPlaceholder: t("partners.otherKindPlaceholder"),
          }}
        />
        <div>
          <label className="label" htmlFor="email">
            {t("partners.email")}
          </label>
          <input id="email" name="email" type="email" defaultValue={partner?.email ?? ""} className="input" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="mobile">
            {t("partners.mobile")}
          </label>
          <input id="mobile" name="mobile" type="tel" defaultValue={partner?.mobile ?? ""} className="input" autoComplete="off" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="locationUrl">
            {t("partners.location")}
          </label>
          <input
            id="locationUrl"
            name="locationUrl"
            type="text"
            inputMode="url"
            defaultValue={partner?.locationUrl ?? ""}
            placeholder="https://maps.app.goo.gl/..."
            className="input"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{t("partners.locationHint")}</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            {t("common.notes")}
          </label>
          <textarea id="notes" name="notes" rows={4} defaultValue={partner?.notes ?? ""} className="textarea" />
        </div>
      </div>
      <p className="text-xs text-brand-graphite/60">{t("partners.categoriesHint")}</p>
      <div className="flex gap-2 border-t border-brand-line pt-4">
        <SubmitButton>{t("common.save")}</SubmitButton>
        <Link href="/partners" className="btn btn-secondary">
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
