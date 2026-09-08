import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ProjectForm from "../../ProjectForm";
import { updateProject } from "../../actions";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getTranslator();

  const found = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  const project = found[0];
  if (!project) notFound();

  return (
    <>
      <BackLink href={`/projects/${id}`} label={t("projects.backToProject")} />
      <PageHeader title={t("projects.edit")} subtitle={project.name} />
      <div className="max-w-3xl">
        <Card title={t("projects.details")}>
          <ProjectForm
            action={updateProject.bind(null, id)}
            project={project}
            cancelHref={`/projects/${id}`}
            t={t}
          />
        </Card>
      </div>
    </>
  );
}
