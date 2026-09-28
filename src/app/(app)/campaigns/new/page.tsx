import { getTranslator } from "@/i18n";
import { activePriceListLinks } from "@/lib/priceList";
import { detailsForProject, detailsForUnit, listTemplates } from "@/lib/templates";
import { BackLink, Card, PageHeader } from "@/components/ui";
import CampaignForm, { type TemplateChoice } from "../CampaignForm";
import { audienceFor, createCampaign } from "../actions";

/**
 * A new campaign.
 *
 * It can start blank, from a ready made message, or from an apartment: coming
 * here from a property the office has just created fills the details in and
 * leaves the send button to a person.
 */
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ audience?: string; template?: string; unit?: string; project?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();

  const [links, everyone, templates] = await Promise.all([
    activePriceListLinks(),
    audienceFor({ toClients: true, toAgents: true, toSubowners: true }),
    listTemplates(),
  ]);

  const counts = {
    clients: everyone.filter((r) => r.group === "CLIENTS").length,
    agents: everyone.filter((r) => r.group === "AGENTS").length,
    subowners: everyone.filter((r) => r.group === "SUBOWNERS").length,
  };

  // What the message is about, when it was started from an apartment or a
  // development. The person placeholders are left alone: they are filled per
  // recipient at the moment of sending.
  const extras = params.unit
    ? await detailsForUnit(params.unit, locale)
    : params.project
      ? await detailsForProject(params.project, locale)
      : null;

  /* The month is known whatever the campaign was started from: the price list
     is sent without an apartment or a development, and its subject names the month. */
  const month = new Date().toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { month: "long", year: "numeric" });
  const fill = (text: string) => {
    if (!extras) return text.replaceAll("{{month}}", month);
    let filled = text;
    for (const [key, value] of Object.entries(extras)) {
      filled = filled.replaceAll(`{{${key}}}`, value);
    }
    return filled;
  };

  const greek = locale === "el";
  const choices: TemplateChoice[] = templates.map((template) => ({
    key: template.key,
    name: template.name,
    description: template.description,
    subject: fill((greek ? template.subjectEl : template.subject) ?? template.subject ?? ""),
    body: fill((greek ? template.bodyEl : template.body) ?? template.body),
    bodyWhatsapp: fill(
      (greek ? template.bodyWhatsappEl : template.bodyWhatsapp) ?? template.bodyWhatsapp ?? "",
    ),
    toClients: template.toClients,
    toAgents: template.toAgents,
    toSubowners: template.toSubowners,
  }));

  const groups = {
    clients: params.audience !== "AGENTS" && params.audience !== "SUBOWNERS",
    agents: params.audience === "AGENTS",
    subowners: params.audience === "SUBOWNERS",
  };

  return (
    <>
      <BackLink
        href="/campaigns"
        label={`${t("common.backTo")} ${t("nav.campaigns").toLowerCase()}`}
      />
      <PageHeader
        title={t("campaigns.newCampaign")}
        subtitle={
          extras
            ? `${extras.unit ? `${extras.unit} . ` : ""}${extras.project}`
            : t("campaigns.newCampaignNote")
        }
      />
      <div className="max-w-4xl">
        <Card title={t("campaigns.theMessage")}>
          <CampaignForm
            action={createCampaign}
            templates={choices}
            chosenTemplate={params.template}
            counts={counts}
            groups={groups}
            priceLists={links.map((l) => ({
              id: l.id,
              label: l.note ?? new Date(l.createdAt).toISOString().slice(0, 10),
            }))}
            labels={{
              template: t("campaigns.template"),
              noTemplate: t("campaigns.noTemplate"),
              templateNote: t("campaigns.templateNote"),
              whoGetsIt: t("campaigns.whoGetsIt"),
              groupClients: t("campaigns.groupClients"),
              groupAgents: t("campaigns.groupAgents"),
              groupSubowners: t("campaigns.groupSubowners"),
              groupsNote: t("campaigns.groupsNote"),
              willReceive: t("campaigns.willReceive"),
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
