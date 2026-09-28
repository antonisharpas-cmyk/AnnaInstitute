import { optionsFor } from "@/lib/choices";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ProjectForm from "../ProjectForm";
import { createProject } from "../actions";

export default async function NewProjectPage() {
  const { t } = await getTranslator();
  const companyList = await db.select().from(companies).orderBy(asc(companies.name));

  return (
    <>
      <BackLink
        href="/projects"
        label={`${t("common.backTo")} ${t("projects.title").toLowerCase()}`}
      />
      <PageHeader title={t("projects.newTitle")} />
      <div className="max-w-3xl">
        <Card title={t("projects.details")}>
          <ProjectForm
            action={createProject}
            companies={companyList}
            cancelHref="/projects"
            t={t}
            statuses={await optionsFor("projectStatus", t)}
          />
          <p className="mt-3 text-xs text-brand-graphite/60">
            The units are added on the project page once it is saved.
          </p>
        </Card>
      </div>
    </>
  );
}
