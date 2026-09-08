import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import AgentForm from "../AgentForm";
import { createAgent } from "../actions";

export default async function NewAgentPage() {
  const { t } = await getTranslator();

  return (
    <>
      <BackLink href="/agents" label={`${t("common.backTo")} ${t("agents.title").toLowerCase()}`} />
      <PageHeader title={t("agents.newTitle")} />
      <div className="max-w-3xl">
        <Card title={t("agents.details")}>
          <AgentForm action={createAgent} cancelHref="/agents" t={t} />
        </Card>
      </div>
    </>
  );
}
