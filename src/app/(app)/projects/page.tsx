import { optionsFor, shownCode } from "@/lib/choices";
import { choiceFilter } from "@/lib/choices/filter";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { projects, subowners, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, toCents } from "@/lib/money";
import { partnersByProject } from "@/lib/subowners";
import { readSort, sortHref } from "@/lib/sorting";
import { anyFilter, many } from "@/lib/filters";
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
import ConfirmButton from "@/components/ConfirmButton";
import { projectsWithContracts } from "@/lib/deletes";
import { deleteProject } from "./actions";

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
  const wanted = choiceFilter(projects.status, projects.statusChoice, many(status), [
    "PLANNING",
    "UNDER_CONSTRUCTION",
    "COMPLETED",
    "DELIVERED",
  ]);
  if (wanted) parts.push(wanted);

  /* By the companies that hold a share of the development. */
  const companies_ = many(company);
  if (companies_.length > 0) {
    parts.push(
      sql`exists (select 1 from project_partners pp where pp.project_id = ${projects.id} and pp.subowner_id in ${companies_})` as SQL,
    );
  }
  const where = parts.length > 0 ? and(...parts) : undefined;

  /**
   * How the list can be ordered. The counts and the money are aggregates of the
   * apartments, so they are ordered by the same expressions the columns are
   * built from rather than by anything stored on the development.
   */
  const ORDER: Record<string, SQL> = {
    name: sql`${projects.name}`,
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
    /* Still offered to buyers: available, and those in negotiation. */
    availableCount: sql<number>`count(${units.id}) filter (where ${units.status} in ('AVAILABLE','NEGOTIATION'))::int`,
    negotiationCount: sql<number>`count(${units.id}) filter (where ${units.status} = 'NEGOTIATION')::int`,
    reservedCount: sql<number>`count(${units.id}) filter (where ${units.status} = 'RESERVED')::int`,
    totalValue: sql<string>`coalesce(sum(${units.netPrice}), 0)`,
    soldValue: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} in ('SOLD','DELIVERED')), 0)`,
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
      .where(where)
      .groupBy(projects.id)
      .orderBy(sort.dir === "asc" ? asc(ORDER[sort.key]) : desc(ORDER[sort.key]))
      .limit(perPage)
      .offset(offset),
    db.select({ id: subowners.id, name: subowners.name }).from(subowners).orderBy(asc(subowners.name)),
    viewsFor(user.id, "projects"),
    hiddenColumns(user.id, "projects"),
    partnersByProject(),
  ]);

  /* Which of the rows about to be drawn are held by a contract, so the delete
     is left off those and the office is not offered a button that refuses. */
  const locked = await projectsWithContracts(rows.map((r) => r.project.id));

  const total = counted?.total ?? 0;
  const { on, hidden: away } = shownColumns("projects", hidden);

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
            choices={await optionsFor("projectStatus", t, { everything: true })}
          />

          <Pick
            name="company"
            label={t("clients.partner")}
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
                        <td>
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

                      {on("partner") ? (
                        <td className="text-xs">
                          {/* The company that holds the development, or One Eleven when none does. */}
                          {(held.get(r.project.id) ?? []).map((p) => (
                            <div key={p.name}>{p.name}</div>
                          ))}
                          {(held.get(r.project.id) ?? []).length === 0 ? (
                            <div className="text-brand-graphite/60">{t("subowners.ourselves")}</div>
                          ) : null}
                        </td>
                      ) : null}

                      {on("location") ? <td>{r.project.location ?? ""}</td> : null}

                      {on("completion") ? (
                        <td className="ctr">{r.project.completionBy ?? ""}</td>
                      ) : null}

                      {on("status") ? (
                        <td>
                          <Pill tone={statusTone(r.project.status) as "good" | "warn" | "neutral"}>
                            {t(`projects.status.${shownCode(r.project.status, r.project.statusChoice)}` as MessageKey)}
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
                              {r.negotiationCount > 0 ? ` (${r.negotiationCount} ${t("units.inNegotiation")})` : ""}
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
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <Link
                              href={`/projects/${r.project.id}`}
                              prefetch={false}
                              className="btn btn-secondary !px-3 !py-1 !text-xs"
                            >
                              {t("common.open")}
                            </Link>
                            <Link
                              href={`/projects/${r.project.id}/edit`}
                              className="btn btn-secondary !px-3 !py-1 !text-xs"
                              prefetch={false}
                            >
                              {t("common.edit")}
                            </Link>
                            <ConfirmButton
                              action={deleteProject.bind(null, r.project.id)}
                              label={t("common.delete")}
                              confirm={t("remove.sure")}
                              title={t("remove.projectWhat")}
                              blocked={
                                locked.has(r.project.id) ? t("remove.heldByContracts") : null
                              }
                            />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-brand-graphite/55">
              {t("list.keyboardHint")} {t("remove.rowHint")}
            </p>
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
