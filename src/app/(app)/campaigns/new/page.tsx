import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, units } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { activePriceListLinks } from "@/lib/priceList";
import { detailsForProject, detailsForUnit, listTemplates } from "@/lib/templates";
import { BackLink, Card, PageHeader } from "@/components/ui";
import CampaignForm, { type TemplateChoice } from "../CampaignForm";
import { audienceFor, createCampaign } from "../actions";
import { buyerChoices } from "@/lib/campaignBuyers";

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
  searchParams: Promise<{ audience?: string; template?: string; unit?: string; project?: string; leads?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getTranslator();

  const [links, everyone, templates, buyers] = await Promise.all([
    activePriceListLinks(),
    audienceFor({ toClients: true, toAgents: true, toSubowners: true, toLeads: true }),
    listTemplates(),
    buyerChoices(),
  ]);

  /* What a campaign can be about: a development, or one apartment in it. */
  const [projectRows, unitRows] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    db
      .select({ id: units.id, code: units.code, project: projects.name })
      .from(units)
      .innerJoin(projects, eq(projects.id, units.projectId))
      .orderBy(asc(projects.name), asc(units.code)),
  ]);
  const about = [
    ...projectRows.map((one) => ({ value: `project:${one.id}`, label: one.name, group: t("campaigns.aboutProjects") })),
    ...unitRows.map((one) => ({ value: `unit:${one.id}`, label: `${one.project} ${one.code}`, group: t("campaigns.aboutUnits") })),
  ];
  const aboutDefault = params.unit ? [`unit:${params.unit}`] : params.project ? [`project:${params.project}`] : [];

  const counts = {
    clients: everyone.filter((r) => r.group === "CLIENTS").length,
    agents: everyone.filter((r) => r.group === "AGENTS").length,
    subowners: everyone.filter((r) => r.group === "SUBOWNERS").length,
    leads: everyone.filter((r) => r.group === "LEADS").length,
  };
  /* How the agents want campaigns, so the form can say who gets what. */
  const agentWays = {
    email: everyone.filter((r) => r.group === "AGENTS" && r.agentChannel !== "WHATSAPP" && r.agentChannel !== "BOTH").length,
    whatsapp: everyone.filter((r) => r.group === "AGENTS" && r.agentChannel === "WHATSAPP").length,
    both: everyone.filter((r) => r.group === "AGENTS" && r.agentChannel === "BOTH").length,
  };
  /* The agents, to choose from one by one, each with the way they want campaigns. */
  const wayWord = (channel: string | undefined) =>
    channel === "WHATSAPP" ? t("campaigns.agentsByWhatsapp") : channel === "BOTH" ? t("campaigns.agentsBoth") : t("campaigns.agentsByEmail");
  const agentChoices = everyone
    .filter((r) => r.group === "AGENTS" && r.agentId)
    .map((r) => ({
      id: r.agentId as string,
      label: r.name,
      hint: [wayWord(r.agentChannel), r.email ?? r.phone ?? ""].filter(Boolean).join(" . "),
      channel: r.agentChannel ?? "EMAIL",
    }));
  /* Everybody who can be in a campaign, with whether they have an email address and a
     mobile and how they are texted, so the form can say who gets it and how. */
  const reach = everyone.map((r) => ({
    group: r.group,
    id: r.clientId ?? r.agentId ?? r.subownerId ?? r.leadId ?? "",
    email: Boolean(r.email?.trim()),
    phone: Boolean(r.phone?.trim()),
    textChannel: r.textChannel,
    agentChannel: r.agentChannel,
  }));
  /* The clients with consent and the companies, to choose from one by one. */
  const clientChoices = everyone
    .filter((r) => r.group === "CLIENTS" && r.clientId)
    .map((r) => ({ id: r.clientId as string, label: r.name, hint: [r.email, r.phone].filter(Boolean).join(" . ") }));
  const subownerChoices = everyone
    .filter((r) => r.group === "SUBOWNERS" && r.subownerId)
    .map((r) => ({ id: r.subownerId as string, label: r.name, hint: [r.email, r.phone].filter(Boolean).join(" . ") }));
  /* The leads, to choose from one by one. */
  const leadChoices = everyone
    .filter((r) => r.group === "LEADS" && r.leadId)
    .map((r) => ({ id: r.leadId as string, label: r.name, hint: r.email ?? r.phone ?? "" }));

  // What the message is about, when it was started from an apartment or a
  // development. The person placeholders are left alone: they are filled per
  // recipient at the moment of sending.
  const extras = params.unit
    ? await detailsForUnit(params.unit, "en")
    : params.project
      ? await detailsForProject(params.project, "en")
      : null;

  /* The month is known whatever the campaign was started from: the price list
     is sent without an apartment or a development, and its subject names the month. */
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  /* The words about the development or the apartment stay as placeholders,
     {{project}}, {{details}} and the rest, and are filled from what the campaign
     is about when it is tested and sent. Started from one development and then
     about two, the letter then speaks of both, not only the first. */
  const fill = (text: string) => text.replaceAll("{{month}}", month);

  /* Every campaign goes out in English, whatever language the office has the CRM in. */
  const choices: TemplateChoice[] = templates.map((template) => ({
    key: template.key,
    name: template.name,
    description: template.description,
    subject: fill(template.subject ?? ""),
    body: fill(template.body),
    bodyWhatsapp: fill(template.bodyWhatsapp ?? ""),
    toClients: template.toClients,
    toAgents: template.toAgents,
    toSubowners: template.toSubowners,
    toLeads: template.toLeads,
    toBuyers: template.toBuyers,
  }));

  const groups = {
    clients: params.audience !== "AGENTS" && params.audience !== "SUBOWNERS" && params.audience !== "LEADS" && params.audience !== "BUYERS",
    agents: params.audience === "AGENTS",
    subowners: params.audience === "SUBOWNERS",
    leads: params.audience === "LEADS",
    buyers: params.audience === "BUYERS",
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
            agentWays={agentWays}
            agentChoices={agentChoices}
            reach={reach}
            clientChoices={clientChoices}
            subownerChoices={subownerChoices}
            groups={groups}
            about={about}
            aboutDefault={aboutDefault}
            leadChoices={leadChoices}
            buyerChoices={buyers}
            projectChoices={projectRows}
            projectsDefault={params.project ? [params.project] : []}
            leadsDefault={(params.leads ?? "").split(",").filter(Boolean)}
            priceLists={links.map((l) => ({
              id: l.id,
              label: l.note ?? new Date(l.createdAt).toISOString().slice(0, 10),
            }))}
            labels={{
              template: t("campaigns.template"),
              about: t("campaigns.about"),
              aboutNothing: t("campaigns.aboutNothing"),
              aboutSearch: t("campaigns.aboutSearch"),
              aboutRemove: t("campaigns.aboutRemove"),
              aboutNote: t("campaigns.aboutNote"),
              aboutNeedsProject: t("campaigns.aboutNeedsProject"),
              aboutNeedsUnit: t("campaigns.aboutNeedsUnit"),
              noTemplate: t("campaigns.noTemplate"),
              templateNote: t("campaigns.templateNote"),
              whoGetsIt: t("campaigns.whoGetsIt"),
              groupClients: t("campaigns.groupClients"),
              groupAgents: t("campaigns.groupAgents"),
              groupSubowners: t("campaigns.groupSubowners"),
              groupLeads: t("campaigns.groupLeads"),
              groupBuyers: t("campaigns.groupBuyers"),
              groupClientsHint: t("campaigns.groupClientsHint"),
              groupBuyersHint: t("campaigns.groupBuyersHint"),
              groupLeadsHint: t("campaigns.groupLeadsHint"),
              groupAgentsHint: t("campaigns.groupAgentsHint"),
              groupSubownersHint: t("campaigns.groupSubownersHint"),
              summaryTitle: t("campaigns.summaryTitle"),
              summaryEmpty: t("campaigns.summaryEmpty"),
              summaryGroup: t("campaigns.summaryGroup"),
              summaryPeople: t("campaigns.summaryPeople"),
              summaryNone: t("campaigns.summaryNone"),
              summaryTotal: t("campaigns.summaryTotal"),
              summaryAlsoBuyers: t("campaigns.summaryAlsoBuyers"),
              summaryRuleClients: t("campaigns.summaryRuleClients"),
              summaryRuleAgents: t("campaigns.summaryRuleAgents"),
              summaryRuleSubowners: t("campaigns.summaryRuleSubowners"),
              summaryRuleNone: t("campaigns.summaryRuleNone"),
              summaryRuleOnce: t("campaigns.summaryRuleOnce"),
              buyersAll: t("campaigns.buyersAll"),
              buyersChosen: t("campaigns.buyersChosen"),
              buyersNote: t("campaigns.buyersNote"),
              buyersNone: t("campaigns.buyersNone"),
              leadsAll: t("campaigns.leadsAll"),
              clientsAll: t("campaigns.clientsAll"),
              clientsChosen: t("campaigns.clientsChosen"),
              subownersAll: t("campaigns.subownersAll"),
              subownersChosen: t("campaigns.subownersChosen"),
              subownersSearch: t("campaigns.subownersSearch"),
              leadsChosen: t("campaigns.leadsChosen"),
              leadsSearch: t("campaigns.leadsSearch"),
              leadsPicked: t("campaigns.leadsPicked"),
              showProjects: t("campaigns.showProjects"),
              showProjectsNote: t("campaigns.showProjectsNote"),
              showProjectsNeeded: t("campaigns.showProjectsNeeded"),
              groupsNote: t("campaigns.groupsNote"),
              willReceive: t("campaigns.willReceive"),
              title: t("campaigns.name"),
              titlePlaceholder: t("campaigns.namePlaceholder"),
              titleNote: t("campaigns.nameNote"),
              howToSend: t("campaigns.howToSend"),
              email: t("campaigns.email"),
              whatsapp: t("campaigns.whatsapp"),
              bothNote: t("campaigns.bothNote"),
              agentsWays: t("campaigns.agentsWays"),
              agentsByEmail: t("campaigns.agentsByEmail"),
              agentsByWhatsapp: t("campaigns.agentsByWhatsapp"),
              agentsBoth: t("campaigns.agentsBoth"),
              agentsBothVia: t("campaigns.agentsBothVia"),
              agentsFallback: t("campaigns.agentsFallback"),
              agentsAll: t("campaigns.agentsAll"),
              howToSendOthers: t("campaigns.howToSendOthers"),
              agentsOnlyNote: t("campaigns.agentsOnlyNote"),
              agentsChosen: t("campaigns.agentsChosen"),
              bothWays: t("campaigns.bothWays"),
              onlyAgentsEmail: t("campaigns.onlyAgentsEmail"),
              onlyAgentsWhatsapp: t("campaigns.onlyAgentsWhatsapp"),
              theEmail: t("campaigns.theEmail"),
              theWhatsapp: t("campaigns.theWhatsapp"),
              subject: t("campaigns.subject"),
              subjectPlaceholder: t("campaigns.subjectPlaceholder"),
              body: t("campaigns.body"),
              bodyPlaceholder: t("campaigns.bodyPlaceholder"),
              whatsappPlaceholder: t("campaigns.whatsappPlaceholder"),
              whatsappNote: t("campaigns.whatsappNote"),
              textByChoice: t("campaigns.textByChoice"),
              textByChoiceNote: t("campaigns.textByChoiceNote"),
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
