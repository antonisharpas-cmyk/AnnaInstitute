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
