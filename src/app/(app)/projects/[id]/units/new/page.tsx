import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import UnitForm from "../../../UnitForm";
import { createUnit } from "../../../actions";

export default async function NewUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getTranslator();

  const found = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  const project = found[0];
  if (!project) notFound();

  return (
    <>
      <BackLink href={`/projects/${id}`} label={t("projects.backToProject")} />
      <PageHeader title={t("units.newTitle")} subtitle={project.name} />
      <div className="max-w-4xl">
        <Card title={t("units.details")}>
          <UnitForm action={createUnit.bind(null, id)} cancelHref={`/projects/${id}`} t={t} />
          <p className="mt-3 text-xs text-brand-graphite/60">
            Floor plans and photographs are added on the apartment page once it is saved, as many as
            you like.
          </p>
        </Card>
      </div>
    </>
  );
}
