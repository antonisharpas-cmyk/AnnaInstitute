import { getTranslator, type MessageKey } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import LeadForm from "../LeadForm";
import { createLead } from "../actions";

const SOURCES = ["ENQUIRY", "AGENT", "WHATSAPP", "WEBSITE", "OTHER"] as const;

export default async function NewLeadPage() {
  const { t } = await getTranslator();

  return (
    <>
      <BackLink href="/leads" label={t("leads.backToLeads")} />
      <PageHeader title={t("leads.newLeadTitle")} subtitle={t("leads.newLeadNote")} />
      <div className="max-w-3xl">
        <Card title={t("leads.theEnquiry")}>
          <LeadForm
            action={createLead}
            cancelHref="/leads"
            labels={{
              firstName: t("common.name"),
              lastName: t("common.surname"),
              email: t("leads.email"),
              phone: t("leads.phone"),
              source: t("leads.camefrom"),
              sourceOther: t("leads.sourceOther"),
              sourceOtherHint: t("leads.sourceOtherHint"),
              project: t("leads.project"),
              note: t("leads.note"),
              noteHint: t("leads.noteHint"),
              contactNote: t("leads.contactNote"),
              save: t("common.save"),
              cancel: t("common.cancel"),
              sources: SOURCES.map((value) => ({
                value,
                label: t(`leads.source.${value}` as MessageKey),
              })),
            }}
          />
        </Card>
      </div>
    </>
  );
}
