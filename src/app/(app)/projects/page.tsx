import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, toCents } from "@/lib/money";
import { partnersByProject } from "@/lib/subowners";
import { readSort, sortHref } from "@/lib/sorting";
import { anyFilter, many, manyOf } from "@/lib/filters";
import {
  COLUMNS,
  filterQuery,
  hiddenColumns,
  lastCookie,
  shouldRestore,
  shownColumns,
  viewsFor,
} from "@/lib/lists";
import { Card, PageHeader, Pill } from "@/components/ui";
import { NoMatch, NothingYet } from "@/components/Nothing";
import { IconProjects } from "@/components/icons";
import SearchBox from "@/components/SearchBox";
import SortTh from "@/components/SortTh";
import Pick from "@/components/Pick";
import Pagination, { paginate } from "@/components/Pagination";
import ViewsBar from "@/components/ViewsBar";
import RowKeys from "@/components/RowKeys";

const PER_PAGE = 15;

const statusTone = (status: string) =>
  status === "DELIVERED" || status === "COMPLETED"
    ? "good"
    : status === "UNDER_CONSTRUCTION"
      ? "warn"
      : "neutral";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    company?: string;
    sort?: string;
    dir?: string;
    page?: string;
    view?: string;
    all?: string;
    saved?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  if (shouldRestore(params)) {
    const jar = await cookies();
    const last = decodeURIComponent(jar.get(lastCookie("projects"))?.value ?? "");
    if (last) redirect(`/projects?${last}&saved=1`);
  }

  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const company = params.company ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);
  const filters = filterQuery(params as Record<string, string | undefined>);

  const parts: SQL[] = [];
  if (query) {
    parts.push(
      or(ilike(projects.name, `%${query}%`), ilike(projects.location, `%${query}%`)) as SQL,
    );
  }
  const wanted = manyOf(status, [
    "PLANNING",
    "UNDER_CONSTRUCTION",
    "COMPLETED",
    "DELIVERED",
  ] as const);
  if (wanted.length === 1) parts.push(eq(projects.status, wanted[0]));
  if (wanted.length > 1) parts.push(inArray(projects.status, wanted));

  const companies_ = many(company);
  if (companies_.length === 1) parts.push(eq(projects.companyId, companies_[0]));
  if (companies_.length > 1) parts.push(inArray(projects.companyId, companies_));
  const where = parts.length > 0 ? and(...parts) : undefined;

  /**
   * How the list can be ordered. The counts and the money are aggregates of the
   * apartments, so they are ordered by the same expressions the columns are
   * built from rather than by anything stored on the development.
   */
  const ORDER: Record<string, SQL> = {
    name: sql`${projects.name}`,
    company: sql`coalesce((select c.name from companies c where c.id = ${projects.companyId}), '')`,
    partner: sql`(select min(s.name) from project_partners pp join subowners s on s.id = pp.subowner_id where pp.project_id = ${projects.id})`,
    location: sql`coalesce(${projects.location}, '')`,
    completion: sql`coalesce(${projects.completionBy}, '')`,
    status: sql`${projects.status}::text`,
    units: sql`count(${units.id})`,
    value: sql`coalesce(sum(${units.netPrice}), 0)`,
    sold: sql`coalesce(sum(${units.netPrice}) filter (where ${units.status} in ('SOLD','DELIVERED')), 0)`,
  };

  const sort = readSort(params as Record<string, string | undefined>, Object.keys(ORDER), {
    key: "name",
    dir: "asc",
  });
  const link = (key: string) =>
    sortHref("/projects", params as Record<string, string | undefined>, key, sort);

  const selection = {
    project: projects,
    unitCount: sql<number>`count(${units.id})::int`,
    soldCount: sql<number>`count(${units.id}) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
    availableCount: sql<number>`count(${units.id}) filter (where ${units.status} = 'AVAILABLE')::int`,
    reservedCount: sql<number>`count(${units.id}) filter (where ${units.status} = 'RESERVED')::int`,
    totalValue: sql<string>`coalesce(sum(${units.netPrice}), 0)`,
    soldValue: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} in ('SOLD','DELIVERED')), 0)`,
    company: companies,
  };

  const [[counted], rows, companyList, views, hidden, held] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(projects)
      .where(where),
    db
      .select(selection)
      .from(projects)
      .leftJoin(units, eq(units.projectId, projects.id))
      .leftJoin(companies, eq(companies.id, projects.companyId))
      .where(where)
      .groupBy(projects.id, companies.id)
      .orderBy(sort.dir === "asc" ? asc(ORDER[sort.key]) : desc(ORDER[sort.key]))
      .limit(perPage)
      .offset(offset),
    db.select().from(companies).orderBy(asc(companies.name)),
    viewsFor(user.id, "projects"),
    hiddenColumns(user.id, "projects"),
    partnersByProject(),
  ]);

  const total = counted?.total ?? 0;
  const { on, hidden: away } = shownColumns("projects", hidden);

  /** Our own share of a development: whatever its partners do not hold. */
  const ourShare = (projectId: string) =>
    Math.max(0, 100 - (held.get(projectId) ?? []).reduce((sum, p) => sum + (p.share ?? 0), 0));
  const currentView = views.find((view) => view.id === params.view) ?? null;

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        action={
          <Link href="/projects/new" className="btn btn-primary" prefetch={false}>
            {t("projects.new")}
          </Link>
        }
      />

      <Card>
        <ViewsBar
          list="projects"
          views={views}
          query={filters}
          currentView={currentView}
          restored={Boolean(params.saved)}
          columns={COLUMNS.projects}
          hidden={away}
          labels={{
            all: t("list.all"),
            saveAs: t("list.saveAs"),
            saveAsHint: t("list.saveAsHint"),
            name: t("list.viewName"),
            everyone: t("list.everyone"),
            save: t("list.saveView"),
            update: t("list.updateView"),
            reset: t("list.resetView"),
            showAll: t("list.reset"),
            changed: t("list.changed"),
            remove: t("list.removeView"),
            mine: t("list.mine"),
            shared: t("list.shared"),
            restored: t("list.restored"),
            columns: t("list.columns"),
            columnsHint: t("list.columnsHint"),
            done: t("list.columnsDone"),
            always: t("list.always"),
          }}
        />

        <SearchBox
          action="/projects"
          query={query}
          placeholder={t("projects.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
          keep={{ view: params.view }}
          filtered={anyFilter(params as Record<string, string | undefined>)}
          resetLabel={t("list.resetAll")}
        >
          <Pick
            name="status"
            label={t("common.status")}
            chosen={many(status)}
            anything={t("common.all")}
            choices={(["PLANNING", "UNDER_CONSTRUCTION", "COMPLETED", "DELIVERED"] as const).map(
              (one) => ({ value: one, label: t(`projects.status.${one}` as MessageKey) }),
            )}
          />

          <Pick
            name="company"
            label={t("projects.company")}
            chosen={many(company)}
            anything={t("common.all")}
            choices={companyList.map((c) => ({ value: c.id, label: c.name }))}
          />
        </SearchBox>

        {rows.length === 0 ? (
          filters ? (
            <NoMatch
              title={t("nothing.match")}
              note={t("nothing.matchNote")}
              clearHref="/projects?all=1"
              clearLabel={t("nothing.clear")}
            />
          ) : (
            <NothingYet
              title={t("nothing.projects")}
              note={t("nothing.projectsNote")}
              icon={<IconProjects size={20} />}
              action={
                <Link
                  href="/projects/new"
                  className="btn btn-primary !py-1 !text-xs"
                  prefetch={false}
                >
                  {t("projects.new")}
                </Link>
              }
            />
          )
        ) : (
          <>
            <RowKeys />

            <div className="mt-4 overflow-x-auto freeze">
              <table className="data">
                <thead>
                  <tr>
                    {on("name") ? (
                      <SortTh
                        label={t("common.name")}
                        by="name"
                        current={sort}
                        href={link("name")}
                      />
                    ) : null}
                    {on("company") ? (
                      <SortTh
                        label={t("projects.company")}
                        by="company"
                        current={sort}
                        href={link("company")}
                      />
                    ) : null}
                    {on("partner") ? (
                      <SortTh
                        label={t("clients.partner")}
                        by="partner"
                        current={sort}
                        href={link("partner")}
                      />
                    ) : null}
                    {on("location") ? (
                      <SortTh
                        label={t("projects.location")}
                        by="location"
                        current={sort}
                        href={link("location")}
                      />
                    ) : null}
                    {on("completion") ? (
                      <SortTh
                        className="ctr"
                        label={t("projects.completion")}
                        by="completion"
                        current={sort}
                        href={link("completion")}
                      />
                    ) : null}
                    {on("status") ? (
                      <SortTh
                        label={t("common.status")}
                        by="status"
                        current={sort}
                        href={link("status")}
                      />
                    ) : null}
                    {on("units") ? (
                      <SortTh
                        className="ctr"
                        label={t("units.title")}
                        by="units"
                        current={sort}
                        href={link("units")}
                      />
                    ) : null}
                    {on("value") ? (
                      <SortTh
                        className="ctr"
                        label={t("projects.totalAmount")}
                        by="value"
                        current={sort}
                        href={link("value")}
                      />
                    ) : null}
                    {on("sold") ? (
                      <SortTh
                        className="ctr"
                        label={t("projects.soldAmount")}
                        by="sold"
                        current={sort}
                        href={link("sold")}
                      />
                    ) : null}
                    {on("actions") ? <th>{t("common.actions")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.project.id} data-id={r.project.id}>
                      {on("name") ? (
                        <td className="whitespace-nowrap">
                          <a
                            /* The name opens the record, as a plain link so it never misses. */
                            data-open
                            href={`/projects/${r.project.id}`}
                            className="font-semibold hover:underline"
                          >
                            {r.project.name}
                          </a>
                        </td>
                      ) : null}

                      {on("company") ? (
                        <td>
                          {r.company ? (
                            r.company.name
                          ) : (
                            <span className="text-xs text-brand-graphite/50">
                              {t("projects.noCompany")}
                            </span>
                          )}
                        </td>
                      ) : null}

                      {on("partner") ? (
                        <td className="text-xs">
                          {(held.get(r.project.id) ?? []).map((p) => (
                            <div key={p.name} className="whitespace-nowrap">
                              {p.name}
                              {p.share === null ? "" : ` ${p.share}%`}
                            </div>
                          ))}
                          <div className="whitespace-nowrap text-brand-graphite/60">
                            {t("subowners.ourselves")} {ourShare(r.project.id)}%
                          </div>
                        </td>
                      ) : null}

                      {on("location") ? <td>{r.project.location ?? ""}</td> : null}

                      {on("completion") ? (
                        <td className="ctr">{r.project.completionBy ?? ""}</td>
                      ) : null}

                      {on("status") ? (
                        <td>
                          <Pill tone={statusTone(r.project.status) as "good" | "warn" | "neutral"}>
                            {t(`projects.status.${r.project.status}` as MessageKey)}
                          </Pill>
                        </td>
                      ) : null}

                      {on("units") ? (
                        <td className="ctr">
                          <div className="font-semibold">{r.unitCount}</div>
                          <div className="mt-0.5 space-y-0.5 whitespace-nowrap text-xs text-brand-graphite/60">
                            <div>
                              {r.soldCount} {t("dash.sold").toLowerCase()}
                            </div>
                            <div>
                              {r.availableCount} {t("dash.available").toLowerCase()}
                            </div>
                            <div>
                              {r.reservedCount} {t("units.status.RESERVED").toLowerCase()}
                            </div>
                          </div>
                        </td>
                      ) : null}

                      {on("value") ? (
                        <td className="ctr font-semibold">
                          {formatAmount(toCents(r.totalValue), locale)}
                        </td>
                      ) : null}

                      {on("sold") ? (
                        <td className="ctr">
                          {formatAmount(toCents(r.soldValue), locale)}
                          <div className="text-xs text-brand-graphite/60">
                            {r.soldCount}{" "}
                            {r.soldCount === 1 ? t("projects.unit") : t("projects.units")}
                          </div>
                        </td>
                      ) : null}

                      {on("actions") ? (
                        <td className="whitespace-nowrap">
                          <Link
                            href={`/projects/${r.project.id}`}
                            prefetch={false}
                            className="btn btn-secondary !px-3 !py-1 !text-xs"
                          >
                            {t("common.open")}
                          </Link>{" "}
                          <Link
                            href={`/projects/${r.project.id}/edit`}
                            className="btn btn-secondary !px-3 !py-1 !text-xs"
                            prefetch={false}
                          >
                            {t("common.edit")}
                          </Link>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-brand-graphite/55">{t("list.keyboardHint")}</p>
          </>
        )}

        <Pagination
          basePath="/projects"
          params={params as Record<string, string | undefined>}
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
