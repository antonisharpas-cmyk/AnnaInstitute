import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";

const PER_PAGE = 10;

const statusTone = (status: string) =>
  status === "COMPLETED" ? "good" : status === "UNDER_CONSTRUCTION" ? "warn" : "neutral";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const filters: SQL[] = [];
  if (query) {
    filters.push(
      or(ilike(projects.name, `%${query}%`), ilike(projects.location, `%${query}%`)) as SQL,
    );
  }
  if (status === "PLANNING" || status === "UNDER_CONSTRUCTION" || status === "COMPLETED") {
    filters.push(eq(projects.status, status));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [[counted], rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(projects).where(where),
    db
      .select({
        project: projects,
        unitCount: sql<number>`count(${units.id})::int`,
        soldCount: sql<number>`count(${units.id}) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
        availableCount: sql<number>`count(${units.id}) filter (where ${units.status} = 'AVAILABLE')::int`,
        reservedCount: sql<number>`count(${units.id}) filter (where ${units.status} = 'RESERVED')::int`,
        totalValue: sql<string>`coalesce(sum(${units.netPrice}), 0)`,
        soldValue: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} in ('SOLD','DELIVERED')), 0)`,
      })
      .from(projects)
      .leftJoin(units, eq(units.projectId, projects.id))
      .where(where)
      .groupBy(projects.id)
      .orderBy(asc(projects.name))
      .limit(perPage)
      .offset(offset),
  ]);

  const total = counted?.total ?? 0;

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        action={
          <Link href="/projects/new" target="_blank" rel="noreferrer" className="btn btn-primary">
            {t("projects.new")}
          </Link>
        }
      />

      <Card>
        <SearchBox
          action="/projects"
          query={query}
          placeholder={t("projects.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
        >
          <div className="w-48">
            <label className="label" htmlFor="status">
              {t("common.status")}
            </label>
            <select id="status" name="status" defaultValue={status} className="select">
              <option value="">{t("common.all")}</option>
              <option value="PLANNING">{t("projects.status.PLANNING")}</option>
              <option value="UNDER_CONSTRUCTION">{t("projects.status.UNDER_CONSTRUCTION")}</option>
              <option value="COMPLETED">{t("projects.status.COMPLETED")}</option>
            </select>
          </div>
        </SearchBox>

        <div className="mt-4 overflow-x-auto">
          {rows.length === 0 ? (
            <Empty message={query || status ? t("projects.noneFound") : t("common.none")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("projects.location")}</th>
                  <th className="ctr">{t("projects.completion")}</th>
                  <th>{t("common.status")}</th>
                  <th className="ctr" style={{ minWidth: "8.5rem" }}>
                    {t("dash.units")}
                  </th>
                  <th className="ctr">{t("projects.totalAmount")}</th>
                  <th className="ctr">{t("projects.soldAmount")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.project.id}>
                    <td>
                      <Link
                        href={`/projects/${r.project.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:underline"
                      >
                        {r.project.name}
                      </Link>
                    </td>
                    <td>{r.project.location ?? ""}</td>
                    <td className="ctr">{r.project.completionBy ?? ""}</td>
                    <td>
                      <Pill tone={statusTone(r.project.status) as "good" | "warn" | "neutral"}>
                        {t(`projects.status.${r.project.status}` as MessageKey)}
                      </Pill>
                    </td>
                    <td className="ctr">
                      <div className="font-semibold">{r.unitCount}</div>
                      <div className="mt-0.5 space-y-0.5 whitespace-nowrap text-xs text-brand-graphite/60">
                        <div>
                          {r.soldCount} {t("dash.sold").toLowerCase()}
                        </div>
                        <div>
                          {r.availableCount} {t("dash.available").toLowerCase()}
                        </div>
                        <div>{r.reservedCount} reserved</div>
                      </div>
                    </td>
                    <td className="ctr font-semibold">
                      {formatAmount(toCents(r.totalValue), locale)}
                    </td>
                    <td className="ctr">
                      {formatAmount(toCents(r.soldValue), locale)}
                      <div className="text-xs text-brand-graphite/60">
                        {r.soldCount}{" "}
                        {r.soldCount === 1 ? t("projects.unit") : t("projects.units")}
                      </div>
                    </td>
                    <td>
                      <Link
                        href={`/projects/${r.project.id}/edit`}
                        className="btn btn-secondary !px-3 !py-1 !text-xs"
                      >
                        {t("common.edit")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          basePath="/projects"
          params={params}
          info={{ page, perPage, total }}
          labels={{
            previous: t("common.previous"),
            next: t("common.next"),
            showing: t("common.showing"),
            of: t("common.of"),
          }}
        />
      </Card>
    </>
  );
}
