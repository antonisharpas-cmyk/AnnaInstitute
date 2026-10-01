import Link from "next/link";
import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { createSubowner } from "../actions";

export default async function NewSubownerPage() {
  const { t } = await getTranslator();

  return (
    <>
      <BackLink href="/subowners" label={t("subowners.backToSubowners")} />
      <PageHeader title={t("subowners.new")} subtitle={t("subowners.subtitle")} />
      <div className="max-w-3xl">
        <Card title={t("subowners.details")}>
          <form action={createSubowner} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">
                  {t("common.name")}
                </label>
                <input id="name" name="name" required className="input" />
              </div>
              <div>
                <label className="label" htmlFor="company">
                  {t("subowners.company")}
                </label>
                <input id="company" name="company" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="contactName">
                  {t("subowners.contact")}
                </label>
                <input id="contactName" name="contactName" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="email">
                  {t("leads.email")}
                </label>
                <input id="email" name="email" type="email" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="phone">
                  {t("leads.phone")}
                </label>
                <input id="phone" name="phone" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="country">
                  {t("clients.country")}
                </label>
                <input id="country" name="country" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="vatNumber">
                  {t("subowners.vatNumber")}
                </label>
                <input id="vatNumber" name="vatNumber" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="registryNumber">
                  {t("subowners.registryNumber")}
                </label>
                <input id="registryNumber" name="registryNumber" className="input" />
              </div>
            </div>

            <fieldset className="rounded border border-brand-line p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite/70">
                {t("subowners.papers")}
              </legend>
              <p className="mb-3 text-xs text-brand-graphite/70">{t("subowners.papersHint")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="tic">
                  {t("subowners.tic")}
                </label>
                <input id="tic" name="tic" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="mobile">
                  {t("subowners.mobile")}
                </label>
                <input id="mobile" name="mobile" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="fax">
                  {t("subowners.fax")}
                </label>
                <input id="fax" name="fax" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="website">
                  {t("subowners.website")}
                </label>
                <input id="website" name="website" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="bankName">
                  {t("subowners.bankName")}
                </label>
                <input id="bankName" name="bankName" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="bankBeneficiary">
                  {t("subowners.bankBeneficiary")}
                </label>
                <input id="bankBeneficiary" name="bankBeneficiary" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="bankAccount">
                  {t("subowners.bankAccount")}
                </label>
                <input id="bankAccount" name="bankAccount" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="iban">
                  {t("subowners.iban")}
                </label>
                <input id="iban" name="iban" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="bic">
                  {t("subowners.bic")}
                </label>
                <input id="bic" name="bic" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="brandColor">
                  {t("subowners.brandColor")}
                </label>
                <input id="brandColor" name="brandColor" className="input" placeholder="#3D8397" />
              </div>
              <div>
                <label className="label" htmlFor="nextInvoice">
                  {t("subowners.nextInvoice")}
                </label>
                <input id="nextInvoice" name="nextInvoice" className="input" placeholder="1" inputMode="numeric" />
              </div>
              <div>
                <label className="label" htmlFor="nextReceipt">
                  {t("subowners.nextReceipt")}
                </label>
                <input id="nextReceipt" name="nextReceipt" className="input" placeholder="1" inputMode="numeric" />
              </div>
              <div>
                <label className="label" htmlFor="nextCreditNote">
                  {t("subowners.nextCreditNote")}
                </label>
                <input id="nextCreditNote" name="nextCreditNote" className="input" placeholder="1" inputMode="numeric" />
              </div>
              <div>
                <label className="label" htmlFor="logo">
                  {t("subowners.logo")}
                </label>
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg" className="text-sm" />
              </div>
              </div>
            </fieldset>

            <div>
              <label className="label" htmlFor="address">
                {t("clients.address")}
              </label>
              <input id="address" name="address" className="input" />
            </div>

            <div>
              <label className="label" htmlFor="notes">
                {t("common.notes")}
              </label>
              <textarea id="notes" name="notes" rows={3} className="textarea" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked />
              <span>{t("agents.active")}</span>
            </label>

            <div className="flex flex-wrap gap-2 border-t border-brand-line pt-4">
              <button type="submit" className="btn btn-primary">
                {t("common.save")}
              </button>
              <Link href="/subowners" className="btn btn-secondary">
                {t("common.cancel")}
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
