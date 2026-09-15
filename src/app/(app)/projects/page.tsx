import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, toCents } from "@/lib/money";
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
import Pagination, { paginate } from "@/components/Pagination";
import ViewsBar from "@/components/ViewsBar";
import RowKeys from "@/components/RowKeys";
import Peek, { PeekLine } from "@/components/Peek";

const PER_PAGE = 15;

const statusTone = (status: string) =>
  status === "COMPLETED" ? "good" : status === "UNDER_CONSTRUCTION" ? "warn" : "neutral";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    company?: string;
    page?: string;
    view?: string;
    peek?: string;
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
  if (status === "PLANNING" || status === "UNDER_CONSTRUCTION" || status === "COMPLETED") {
    parts.push(eq(projects.status, status));
  }
  if (company) {
    parts.push(eq(projects.companyId, company));
  }
  const where = parts.length > 0 ? and(...parts) : undefined;

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

  const [[counted], rows, companyList, views, hidden, ordered] = await Promise.all([
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
      .orderBy(asc(projects.name))
      .limit(perPage)
      .offset(offset),
    db.select().from(companies).orderBy(asc(companies.name)),
    viewsFor(user.id, "projects"),
    hiddenColumns(user.id, "projects"),
    params.peek
      ? db
          .select({ id: projects.id })
          .from(projects)
          .where(where)
          .orderBy(asc(projects.name))
          .limit(2000)
      : Promise.resolve([] as { id: string }[]),
  ]);

  const total = counted?.total ?? 0;
  const { on, hidden: away } = shownColumns("projects", hidden);
  const currentView = views.find((view) => view.id === params.view) ?? null;
  const orderedIds = ordered.map((row) => row.id);

  const here = (extra?: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...extra })) {
      if (value) search.set(key, String(value));
    }
    search.delete("saved");
    const text = search.toString();
    return text ? `/projects?${text}` : "/projects?all=1";
  };

  const withoutPeek = () => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "peek" && key !== "saved") search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `/projects?${text}` : "/projects?all=1";
  };

  const peeked = params.peek ? (rows.find((row) => row.project.id === params.peek) ?? null) : null;
  const at = params.peek ? orderedIds.indexOf(params.peek) : -1;

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

      <div className="peeklayout" data-open={Boolean(peeked)}>
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
          >
            <div className="w-48">
              <label className="label" htmlFor="status">
                {t("common.status")}
              </label>
              <select id="status" name="status" defaultValue={status} className="select">
                <option value="">{t("common.all")}</option>
                {(["PLANNING", "UNDER_CONSTRUCTION", "COMPLETED"] as const).map((one) => (
                  <option key={one} value={one}>
                    {t(`projects.status.${one}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-48">
              <label className="label" htmlFor="company">
                {t("projects.company")}
              </label>
              <select id="company" name="company" defaultValue={company} className="select">
                <option value="">{t("common.all")}</option>
                {companyList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
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
                      {on("name") ? <th>{t("common.name")}</th> : null}
                      {on("company") ? <th>{t("projects.company")}</th> : null}
                      {on("location") ? <th>{t("projects.location")}</th> : null}
                      {on("completion") ? (
                        <th className="ctr">{t("projects.completion")}</th>
                      ) : null}
                      {on("status") ? <th>{t("common.status")}</th> : null}
                      {on("units") ? (
                        <th className="ctr" style={{ minWidth: "8.5rem" }}>
                          {t("units.title")}
                        </th>
                      ) : null}
                      {on("value") ? <th className="ctr">{t("projects.totalAmount")}</th> : null}
                      {on("sold") ? <th className="ctr">{t("projects.soldAmount")}</th> : null}
                      {on("actions") ? <th>{t("common.actions")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.project.id}
                        data-id={r.project.id}
                        data-peeked={params.peek === r.project.id}
                      >
                        {on("name") ? (
                          <td className="whitespace-nowrap">
                            <a
                              /* A plain link, so opening the panel never misses. */
                              href={here({ peek: r.project.id })}
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

                        {on("location") ? <td>{r.project.location ?? ""}</td> : null}

                        {on("completion") ? (
                          <td className="ctr">{r.project.completionBy ?? ""}</td>
                        ) : null}

                        {on("status") ? (
                          <td>
                            <Pill
                              tone={statusTone(r.project.status) as "good" | "warn" | "neutral"}
                            >
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

        {peeked ? (
          <Peek
            title={peeked.project.name}
            subtitle={peeked.company?.name ?? undefined}
            at={at >= 0 ? at + 1 : 1}
            of={orderedIds.length || 1}
            previousHref={at > 0 ? here({ peek: orderedIds[at - 1] }) : null}
            nextHref={
              at >= 0 && at < orderedIds.length - 1 ? here({ peek: orderedIds[at + 1] }) : null
            }
            closeHref={withoutPeek()}
            openHref={`/projects/${peeked.project.id}`}
            labels={{
              close: t("peek.close"),
              previous: t("peek.previous"),
              next: t("peek.next"),
              open: t("peek.open"),
              position: t("peek.position"),
            }}
            actions={
              <Link
                href={`/projects/${peeked.project.id}/edit`}
                className="btn btn-secondary !py-1 !text-xs"
                prefetch={false}
              >
                {t("common.edit")}
              </Link>
            }
          >
            <PeekLine label={t("common.status")}>
              <Pill tone={statusTone(peeked.project.status) as "good" | "warn" | "neutral"}>
                {t(`projects.status.${peeked.project.status}` as MessageKey)}
              </Pill>
            </PeekLine>
            <PeekLine label={t("projects.location")}>{peeked.project.location ?? "―"}</PeekLine>
            <PeekLine label={t("projects.completion")}>
              {peeked.project.completionBy ?? "―"}
            </PeekLine>
            <PeekLine label={t("units.title")}>{peeked.unitCount}</PeekLine>
            <PeekLine label={t("dash.sold")}>{peeked.soldCount}</PeekLine>
            <PeekLine label={t("dash.available")}>{peeked.availableCount}</PeekLine>
            <PeekLine label={t("units.status.RESERVED")}>{peeked.reservedCount}</PeekLine>
            <PeekLine label={t("projects.totalAmount")}>
              {formatAmount(toCents(peeked.totalValue), locale)}
            </PeekLine>
            <PeekLine label={t("projects.soldAmount")}>
              {formatAmount(toCents(peeked.soldValue), locale)}
            </PeekLine>
          </Peek>
        ) : null}
      </div>
    </>
  );
}
