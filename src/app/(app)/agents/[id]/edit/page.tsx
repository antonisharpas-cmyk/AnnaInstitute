import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import AgentForm from "../../AgentForm";
import { updateAgent } from "../../actions";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getTranslator();

  const found = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  const agent = found[0];
  if (!agent) notFound();

  return (
    <>
      <BackLink href={`/agents/${id}`} label={`${t("common.backTo")} ${agent.name}`} />
      <PageHeader title={t("agents.edit")} subtitle={agent.name} />
      <div className="max-w-3xl">
        <Card title={t("agents.details")}>
          <AgentForm
            action={updateAgent.bind(null, id)}
            agent={agent}
            cancelHref={`/agents/${id}`}
            t={t}
          />
        </Card>
      </div>
    </>
  );
}
