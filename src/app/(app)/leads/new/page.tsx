import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { whoCanGo } from "@/lib/team";
import { optionsFor } from "@/lib/choices";
import LeadForm from "../LeadForm";
import { createLead } from "../actions";

export default async function NewLeadPage() {
  const { t } = await getTranslator();

  // Named on the enquiry when it came from one of them, so the commission has
  // an owner from the first day rather than from the day of the contract.
  const [theAgents, team] = await Promise.all([
    db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.isActive, true))
      .orderBy(asc(agents.name)),
    /* The office, for the person whose enquiry this is. */
    whoCanGo(),
  ]);

  return (
    <>
      <BackLink href="/leads" label={t("leads.backToLeads")} />
      <PageHeader title={t("leads.newLeadTitle")} subtitle={t("leads.newLeadNote")} />
      <div className="max-w-3xl">
        <Card title={t("leads.theEnquiry")}>
          <LeadForm
            action={createLead}
            cancelHref="/leads"
            agents={theAgents}
            team={team}
            labels={{
              firstName: t("common.name"),
              lastName: t("common.surname"),
              email: t("leads.email"),
              phone: t("leads.phone"),
              source: t("leads.camefrom"),
              sourceOther: t("leads.sourceOther"),
              sourceOtherHint: t("leads.sourceOtherHint"),
              /* What the enquiry is about, in the office's word for it. It was
                 labelled Development, which asked for something narrower than
                 what people actually write in it. */
              project: t("leads.about"),
              projectHint: t("leads.aboutHint"),
              note: t("leads.note"),
              noteHint: t("leads.noteHint"),
              contactNote: t("leads.contactNote"),
              agent: t("contracts.agent"),
              chooseAgent: t("leads.chooseAgent"),
              consent: t("leads.consentNow"),
              consentHint: t("leads.consentNowHint"),
              save: t("common.save"),
              cancel: t("common.cancel"),
              assignedTo: t("appointments.assignedTo"),
              nobody: t("appointments.nobody"),
              sources: await optionsFor("leadSource", t),
            }}
          />
        </Card>
      </div>
    </>
  );
}
