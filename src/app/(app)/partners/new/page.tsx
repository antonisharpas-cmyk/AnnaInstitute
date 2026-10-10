import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { optionsFor } from "@/lib/choices";
import { BackLink, Card, PageHeader } from "@/components/ui";
import PartnerForm from "../PartnerForm";
import { createPartner } from "../actions";

export default async function NewPartnerPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await requireUser(["ADMIN"]);
  const { category } = await searchParams;
  const { t } = await getTranslator();
  const categories = await optionsFor("partnerCategory", t);
  const preset = categories.some((one) => one.value === category) ? category : undefined;
  return (
    <>
      <BackLink href="/partners" label={`${t("common.backTo")} ${t("partners.title").toLowerCase()}`} />
      <PageHeader title={t("partners.newTitle")} />
      <div className="max-w-3xl">
        <Card title={t("partners.details")}>
          <PartnerForm action={createPartner} categories={categories} defaultCategory={preset} t={t} />
        </Card>
      </div>
    </>
  );
}
