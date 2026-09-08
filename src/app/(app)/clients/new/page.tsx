import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ClientForm from "../ClientForm";
import { createClient } from "../actions";

export default async function NewClientPage() {
  const { t } = await getTranslator();

  return (
    <>
      <BackLink href="/clients" label={`${t("common.backTo")} ${t("clients.title").toLowerCase()}`} />
      <PageHeader title={t("clients.newTitle")} />
      <div className="max-w-3xl">
        <Card title={t("clients.title")}>
          <ClientForm action={createClient} cancelHref="/clients" t={t} />
          <p className="mt-3 text-xs text-brand-graphite/60">
            The apartment is assigned on the client page once the record is saved.
          </p>
        </Card>
      </div>
    </>
  );
}
