import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { documentsForProjectWithUnits, floorPlansByUnit } from "@/lib/documents";
import { categoryLabel, fileLabel, isImage } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { LightboxGrid, LightboxLink } from "@/components/Lightbox";
import UploadForm from "@/components/UploadForm";
import Pagination, { paginate } from "@/components/Pagination";
import { deleteProjectDocument, uploadProjectDocuments } from "../actions";

const PER_PAGE = 25;

const statusTone = (status: string) =>
  status === "AVAILABLE" ? "good" : status === "RESERVED" ? "warn" : "neutral";

const area = (value: string | null) => (value ? `${Number(value)} m2` : "");

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { locale, t } = await getTranslator();
  const { page, perPage, offset } = paginate(query, PER_PAGE);

  const found = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  const project = found[0];
  if (!project) notFound();

  const [rows, [totals], allFiles, plansByUnit] = await Promise.all([
    db
      .select()
      .from(units)
      .where(eq(units.projectId, id))
      .orderBy(asc(units.code))
      .limit(perPage)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
        reserved: sql<number>`count(*) filter (where ${units.status} = 'RESERVED')::int`,
        sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
        totalValue: sql<string>`coalesce(sum(${units.netPrice}), 0)`,
        soldValue: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} in ('SOLD','DELIVERED')), 0)`,
      })
      .from(units)
      .where(eq(units.projectId, id)),
    documentsForProjectWithUnits(id),
    floorPlansByUnit(id),
  ]);

  return (
    <>
      <BackLink
        href="/projects"
        label={`${t("common.backTo")} ${t("projects.title").toLowerCase()}`}
      />
      <PageHeader
        title={project.name}
        subtitle={[project.location, project.completionBy].filter(Boolean).join(" . ")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${id}/edit`} className="btn btn-secondary">
              {t("projects.edit")}
            </Link>
            <Link
              href={`/projects/${id}/units/new`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              {t("units.new")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("dash.units")}
          value={String(totals?.count ?? 0)}
          hint={`${totals?.sold ?? 0} ${t("dash.sold").toLowerCase()}, ${
            totals?.available ?? 0
          } ${t("dash.available").toLowerCase()}${
            (totals?.reserved ?? 0) > 0 ? `, ${totals?.reserved} reserved` : ""
          }`}
        />
        <Stat
          label={t("projects.totalAmount")}
          value={formatAmount(toCents(totals?.totalValue ?? "0"), locale)}
        />
        <Stat
          label={t("projects.soldAmount")}
          value={formatAmount(toCents(totals?.soldValue ?? "0"), locale)}
        />
        <Stat
          label={t("common.status")}
          value={t(`projects.status.${project.status}` as MessageKey)}
        />
      </div>

      <div className="mb-4">
        <Card title={t("units.title")}>
          {rows.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("units.code")}</th>
                    <th className="ctr">{t("units.floor")}</th>
                    <th className="ctr">{t("units.bedrooms")}</th>
                    <th className="ctr">{t("units.covered")}</th>
                    <th className="ctr">{t("units.veranda")}</th>
                    <th className="ctr">{t("units.roofGarden")}</th>
                    <th className="ctr">{t("units.netPrice")}</th>
                    <th className="ctr">{t("common.status")}</th>
                    <th className="ctr">{t("units.floorPlan")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const plans = plansByUnit.get(u.id) ?? [];
                    return (
                      <tr key={u.id}>
                        <td className="font-semibold">{u.code}</td>
                        <td className="ctr">{u.floor ?? ""}</td>
                        <td className="ctr">{u.bedrooms ?? ""}</td>
                        <td className="ctr">{area(u.coveredArea)}</td>
                        <td className="ctr">{area(u.verandaArea)}</td>
                        <td className="ctr">{area(u.roofGardenArea)}</td>
                        <td className="ctr font-semibold">
                          {formatAmount(toCents(u.netPrice), locale)}
                        </td>
                        <td className="ctr">
                          <Pill tone={statusTone(u.status) as "good" | "warn" | "neutral"}>
                            {t(`units.status.${u.status}` as MessageKey)}
                          </Pill>
                        </td>
                        <td className="ctr">
                          <LightboxLink
                            items={plans.map((doc) => ({
                              id: doc.id,
                              label: fileLabel(doc, u.code),
                              isImage: isImage(doc.mimeType),
                            }))}
                          />
                        </td>
                        <td>
                          <Link
                            href={`/projects/${id}/units/${u.id}`}
                            className="btn btn-secondary !px-3 !py-1 !text-xs"
                          >
                            {t("common.edit")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            basePath={`/projects/${id}`}
            params={query}
            info={{ page, perPage, total: totals?.count ?? 0 }}
            labels={{
              previous: t("common.previous"),
              next: t("common.next"),
              showing: t("common.showing"),
              of: t("common.of"),
            }}
          />

          <div className="mt-4 border-t border-brand-line pt-4">
            <Link href={`/projects/${id}/units/new`} className="btn btn-primary">
              {t("units.addRow")}
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("projects.files")}>
            {allFiles.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <>
                <LightboxGrid
                  items={allFiles.map((row) => ({
                    id: row.document.id,
                    label: fileLabel(row.document, row.unitCode),
                    isImage: isImage(row.document.mimeType),
                  }))}
                />

                <ul className="mt-3 divide-y divide-brand-line text-sm">
                  {allFiles.map((row) => (
                    <li
                      key={row.document.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <a
                          href={`/api/files/${row.document.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-brand-teal-dark hover:underline"
                        >
                          {fileLabel(row.document, row.unitCode)}
                        </a>
                        <div className="text-xs text-brand-graphite/60">
                          {new Date(row.document.createdAt).toLocaleDateString(
                            locale === "el" ? "el-GR" : "en-GB",
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill>{categoryLabel(row.document.category)}</Pill>
                        <a
                          href={`/api/files/${row.document.id}?download=1`}
                          className="btn btn-secondary !px-2 !py-1 !text-xs"
                        >
                          {t("common.download")}
                        </a>
                        {row.document.unitId ? (
                          <Link
                            href={`/projects/${id}/units/${row.document.unitId}`}
                            className="btn btn-secondary !px-2 !py-1 !text-xs"
                          >
                            {t("common.edit")}
                          </Link>
                        ) : (
                          <form action={deleteProjectDocument.bind(null, row.document.id, id)}>
                            <button
                              type="submit"
                              className="btn btn-secondary !px-2 !py-1 !text-xs"
                            >
                              {t("common.delete")}
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="mt-4 border-t border-brand-line pt-4">
              <UploadForm
                action={uploadProjectDocuments.bind(null, id)}
                categories={["PROGRESS_PHOTO", "OTHER"]}
                defaultCategory="PROGRESS_PHOTO"
                titlePlaceholder="Site works September"
                submitLabel={t("common.add")}
                hint="A file added here belongs to the whole project. Files added on an apartment show here too, named after that apartment."
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t("projects.details")}>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="label">{t("projects.location")}</dt>
                <dd>{project.location ?? ""}</dd>
              </div>
              <div>
                <dt className="label">{t("projects.completion")}</dt>
                <dd>{project.completionBy ?? ""}</dd>
              </div>
              {project.description ? (
                <div>
                  <dt className="label">{t("projects.description")}</dt>
                  <dd>{project.description}</dd>
                </div>
              ) : null}
            </dl>
            <Link href={`/projects/${id}/edit`} className="btn btn-secondary mt-3 w-full">
              {t("projects.edit")}
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
