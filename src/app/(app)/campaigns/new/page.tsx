import { getTranslator } from "@/i18n";
import { activePriceListLinks } from "@/lib/priceList";
import { BackLink, Card, PageHeader } from "@/components/ui";
import CampaignForm from "../CampaignForm";
import { audienceFor, createCampaign } from "../actions";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ audience?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getTranslator();

  const audience = params.audience === "AGENTS" ? "AGENTS" : "CLIENTS_CONSENTED";
  const [links, recipients] = await Promise.all([activePriceListLinks(), audienceFor(audience)]);

  const withEmail = recipients.filter((r) => r.email).length;
  const withPhone = recipients.filter((r) => r.phone).length;

  return (
    <>
      <BackLink
        href="/campaigns"
        label={`${t("common.backTo")} ${t("nav.campaigns").toLowerCase()}`}
      />
      <PageHeader
        title={audience === "AGENTS" ? t("campaigns.newToAgents") : t("campaigns.newToClients")}
        subtitle={`${recipients.length} ${t("campaigns.inTheAudience")} . ${withEmail} ${t(
          "campaigns.withEmail",
        )} . ${withPhone} ${t("campaigns.withPhone")}`}
      />
      <div className="max-w-4xl">
        <Card title={t("campaigns.theMessage")}>
          <CampaignForm
            action={createCampaign}
            audience={audience}
            priceLists={links.map((l) => ({
              id: l.id,
              label: l.note ?? new Date(l.createdAt).toISOString().slice(0, 10),
            }))}
            labels={{
              title: t("campaigns.name"),
              titlePlaceholder: t("campaigns.namePlaceholder"),
              titleNote: t("campaigns.nameNote"),
              howToSend: t("campaigns.howToSend"),
              email: t("campaigns.email"),
              whatsapp: t("campaigns.whatsapp"),
              bothNote: t("campaigns.bothNote"),
              theEmail: t("campaigns.theEmail"),
              theWhatsapp: t("campaigns.theWhatsapp"),
              subject: t("campaigns.subject"),
              subjectPlaceholder: t("campaigns.subjectPlaceholder"),
              body: t("campaigns.body"),
              bodyPlaceholder: t("campaigns.bodyPlaceholder"),
              whatsappPlaceholder: t("campaigns.whatsappPlaceholder"),
              whatsappNote: t("campaigns.whatsappNote"),
              files: t("common.files"),
              filesNote: t("campaigns.filesNote"),
              priceList: t("campaigns.priceList"),
              noPriceList: t("campaigns.noPriceList"),
              priceListNote: t("campaigns.priceListNote"),
              save: t("campaigns.saveDraft"),
              cancel: t("common.cancel"),
            }}
          />
        </Card>
      </div>
    </>
  );
}
