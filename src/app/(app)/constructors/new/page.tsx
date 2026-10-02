import Link from "next/link";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { BackLink, Card, PageHeader } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { createConstructor } from "../actions";

export default async function NewConstructorPage() {
  await requireUser(["ADMIN"]);
  const { t } = await getTranslator();
  const box = (name: string, label: string, type = "text", required = false, wide = false) => (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} required={required} className="input" />
    </div>
  );
  return (
    <>
      <BackLink href="/constructors" label={`${t("common.backTo")} ${t("constructors.title").toLowerCase()}`} />
      <PageHeader title={t("constructors.newTitle")} />
      <div className="max-w-3xl">
        <Card title={t("constructors.details")}>
          <form action={createConstructor} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {box("name", t("common.name"), "text", true)}
              {box("company", t("constructors.company"))}
              {box("contactName", t("constructors.contact"))}
              {box("email", t("common.email"), "email")}
              {box("phone", t("common.phone"))}
              {box("vatNumber", t("constructors.vat"))}
              {box("registryNumber", t("constructors.registry"))}
              {box("address", t("constructors.address"), "text", false, true)}
              <div className="sm:col-span-2">
                <label className="label" htmlFor="notes">
                  {t("common.notes")}
                </label>
                <textarea id="notes" name="notes" rows={3} className="textarea" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked />
                {t("constructors.active")}
              </label>
            </div>
            <div className="flex gap-2 border-t border-brand-line pt-4">
              <SubmitButton>{t("common.save")}</SubmitButton>
              <Link href="/constructors" className="btn btn-secondary">
                {t("common.cancel")}
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
