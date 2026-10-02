import { asc, desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, projects } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { projectReportData, reportRecipients } from "@/lib/projectReport";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ReportSender from "./ReportSender";

/** A development's status, as a PDF for its shareholders. */
export const dynamic = "force-dynamic";

export default async function ProjectReportPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await requireUser(["ADMIN"]);
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const list = await db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name));
  const projectId = params.project && list.some((one) => one.id === params.project) ? params.project : (list[0]?.id ?? "");
  const [data, people, history] = projectId
    ? await Promise.all([
        projectReportData(projectId),
        reportRecipients(projectId),
        db
          .select({ detail: auditLogs.detail, at: auditLogs.createdAt })
          .from(auditLogs)
          .where(and(eq(auditLogs.action, "project.report"), eq(auditLogs.entityId, projectId)))
          .orderBy(desc(auditLogs.createdAt))
          .limit(6),
      ])
    : [null, [], []];

  return (
    <>
      <BackLink href="/reports" label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`} />
      <PageHeader title={t("projectReport.title")} subtitle={t("projectReport.subtitle")} />

      <form action="/reports/project" method="get" className="card mb-4 flex flex-wrap items-end gap-2 p-3">
        <div>
          <label className="label" htmlFor="reportProject">
            {t("projectReport.project")}
          </label>
          <select id="reportProject" name="project" defaultValue={projectId} className="select !w-72">
            {list.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">
          {t("projectReport.show")}
        </button>
      </form>

      {data ? (
        <div className="space-y-4">
          <Card title={data.project.name}>
            <p className="mb-3 text-sm" data-report-figures>
              {t("projectReport.figures")
                .replace("{units}", String(data.totals.units))
                .replace("{sold}", String(data.totals.sold))
                .replace("{constructor}", data.constructor ? data.constructor.constructor.name : t("projectReport.noConstructor"))}
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <a href={`/api/reports/project?project=${projectId}`} target="_blank" rel="noreferrer" className="btn btn-secondary" data-report-preview>
                {t("projectReport.preview")}
              </a>
              <a href={`/api/reports/project?project=${projectId}&download=1`} className="btn btn-secondary">
                {t("projectReport.download")}
              </a>
            </div>
            <ReportSender
              key={projectId}
              projectId={projectId}
              people={people}
              labels={{
                who: t("projectReport.who"),
                none: t("projectReport.noShareholders"),
                noEmail: t("projectReport.noEmail"),
                extra: t("projectReport.extra"),
                extraHint: t("projectReport.extraHint"),
                note: t("projectReport.note2"),
                send: t("projectReport.send"),
                sending: t("projectReport.sending"),
                preview: t("projectReport.preview"),
              }}
            />
          </Card>
          {history.length > 0 ? (
            <Card title={t("projectReport.sent")}>
              <ul className="divide-y divide-brand-line text-sm" data-report-history>
                {history.map((one, i) => (
                  <li key={i} className="py-2">
                    <span className="font-semibold">{new Date(one.at).toLocaleString(locale === "el" ? "el-GR" : "en-GB")}</span>
                    <span className="text-brand-graphite/70"> . {one.detail}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
