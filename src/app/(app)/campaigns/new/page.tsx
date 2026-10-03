import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, units } from "@/db/schema";
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
  searchParams: Promise<{ audience?: string; template?: string; unit?: string; project?: string; leads?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();

  const [links, everyone, templates] = await Promise.all([
    activePriceListLinks(),
    audienceFor({ toClients: true, toAgents: true, toSubowners: true, toLeads: true }),
    listTemplates(),
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
  /* The leads, to choose from one by one. */
  const leadChoices = everyone
    .filter((r) => r.group === "LEADS" && r.leadId)
    .map((r) => ({ id: r.leadId as string, label: r.name, hint: r.email ?? r.phone ?? "" }));

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
  /* The words about the development or the apartment stay as placeholders,
     {{project}}, {{details}} and the rest, and are filled from what the campaign
     is about when it is tested and sent. Started from one development and then
     about two, the letter then speaks of both, not only the first. */
  const fill = (text: string) => text.replaceAll("{{month}}", month);

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
    toLeads: template.toLeads,
  }));

  const groups = {
    clients: params.audience !== "AGENTS" && params.audience !== "SUBOWNERS" && params.audience !== "LEADS",
    agents: params.audience === "AGENTS",
    subowners: params.audience === "SUBOWNERS",
    leads: params.audience === "LEADS",
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
            groups={groups}
            about={about}
            aboutDefault={aboutDefault}
            leadChoices={leadChoices}
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
              leadsAll: t("campaigns.leadsAll"),
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
