import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ProjectForm from "../ProjectForm";
import { createProject } from "../actions";

export default async function NewProjectPage() {
  const { t } = await getTranslator();

  return (
    <>
      <BackLink href="/projects" label={`${t("common.backTo")} ${t("projects.title").toLowerCase()}`} />
      <PageHeader title={t("projects.newTitle")} />
      <div className="max-w-3xl">
        <Card title={t("projects.details")}>
          <ProjectForm action={createProject} cancelHref="/projects" t={t} />
          <p className="mt-3 text-xs text-brand-graphite/60">
            The units are added on the project page once it is saved.
          </p>
        </Card>
      </div>
    </>
  );
}
