import { optionsFor, shownCode } from "@/lib/choices";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, clients, contracts, projects, subowners } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { apartmentsByClient, clientFilters, CLIENT_ORDER } from "@/lib/clients";
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
import { IconClients } from "@/components/icons";
import SearchBox from "@/components/SearchBox";
import SortTh from "@/components/SortTh";
import Pick from "@/components/Pick";
import Pagination, { paginate } from "@/components/Pagination";
import ViewsBar from "@/components/ViewsBar";
import BulkBar from "@/components/BulkBar";
import RowKeys from "@/components/RowKeys";
import { InlineText } from "@/components/Inline";
import { bulkClientBin, bulkClientMarketing, setClientField } from "./actions";
import ArmedSubmit from "@/components/ArmedSubmit";

const PER_PAGE = 20;

const statusTone = (status: string) =>
  status === "SOLD" || status === "DELIVERED" ? "good" : status === "RESERVED" ? "warn" : "neutral";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    project?: string;
    partner?: string;
    source?: string;
    agent?: string;
    state?: string;
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
    const last = decodeURIComponent(jar.get(lastCookie("clients"))?.value ?? "");
    if (last) redirect(`/clients?${last}&saved=1`);
  }

  const query = (params.q ?? "").trim();
  const project = params.project ?? "";
  const partner = params.partner ?? "";
  const source = params.source ?? "";
  const agent = params.agent ?? "";
  const state = params.state === "closed" ? "closed" : "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);
  const sort = readSort(params as Record<string, string | undefined>, Object.keys(CLIENT_ORDER), {
    key: "name",
    dir: "asc",
  });
  const order = sort.dir === "asc" ? asc(CLIENT_ORDER[sort.key]) : desc(CLIENT_ORDER[sort.key]);
  const filters = filterQuery(params as Record<string, string | undefined>);
  const where = clientFilters({ query, project, partner, source, agent, state });

  /* How many are on each list, for the two tabs. */
  const [[openCount], [closedCount]] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(clients)
      .where(sql`${clients.deletedAt} is null and ${clients.closedAt} is null`),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(clients)
      .where(sql`${clients.deletedAt} is null and ${clients.closedAt} is not null`),
  ]);

  const [[counted], rows, views, hidden, buildings, partnerList, agentList] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(clients)
      .where(where),
    db
      .select({
        client: clients,
        contractCount: sql<number>`count(${contracts.id})::int`,
        /**
         * The enquiry they were converted from, if any, as a subquery rather
         * than a join: a client can have more than one enquiry against them and
         * a join would count their contracts twice over.
         */
        leadSource: sql<
          string | null
        >`(select l.source_kind from leads l where l.client_id = ${clients.id} order by l.created_at desc limit 1)`,
        leadSourceText: sql<
          string | null
        >`(select l.source from leads l where l.client_id = ${clients.id} order by l.created_at desc limit 1)`,
      })
      .from(clients)
      .leftJoin(contracts, eq(contracts.clientId, clients.id))
      .where(where)
      .groupBy(clients.id)
      .orderBy(order)
      .limit(perPage)
      .offset(offset),
    viewsFor(user.id, "clients"),
    hiddenColumns(user.id, "clients"),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    db
      .select({ id: subowners.id, name: subowners.name })
      .from(subowners)
      .where(eq(subowners.isActive, true))
      .orderBy(asc(subowners.name)),
    /* Every agent, for the filter: "which of these are Andreas's". */
    db.select({ id: agents.id, name: agents.name }).from(agents).orderBy(asc(agents.name)),
  ]);

  const apartments = await apartmentsByClient(rows.map((r) => r.client.id));
  const total = counted?.total ?? 0;
  const { on, hidden: away } = shownColumns("clients", hidden);
  const link = (key: string) =>
    sortHref("/clients", params as Record<string, string | undefined>, key, sort);
  const currentView = views.find((view) => view.id === params.view) ?? null;

  return (
    <>
      <PageHeader
        title={t("clients.title")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/bin" className="btn btn-secondary" prefetch={false}>
              {t("bin.title")}
            </Link>
            <Link href="/clients/new" className="btn btn-primary" prefetch={false}>
              {t("clients.new")}
            </Link>
          </div>
        }
      />

      {/*
        The working list and the Closed one, side by side.

        Plain links, because they go to the same address with a different
        question on it, which is the navigation the router has been known to
        fetch and never show.
      */}
      {/* eslint-disable @next/next/no-html-link-for-pages */}
      <div className="mb-4 flex flex-wrap gap-2">
        <a href="/clients?all=1" className="tab" data-on={state === "" ? "true" : "false"}>
          {t("clients.tab.open")}
          <span className="tabcount">{openCount?.total ?? 0}</span>
        </a>
        <a
          href="/clients?state=closed"
          className="tab"
          data-on={state === "closed" ? "true" : "false"}
        >
          {t("clients.tab.closed")}
          <span className="tabcount">{closedCount?.total ?? 0}</span>
        </a>
      </div>
      {/* eslint-enable @next/next/no-html-link-for-pages */}

      <Card>
        <ViewsBar
          list="clients"
          views={views}
          query={filters}
          currentView={currentView}
          restored={Boolean(params.saved)}
          columns={COLUMNS.clients}
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
          action="/clients"
          query={query}
          placeholder={t("clients.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
          keep={{ view: params.view, state: state || undefined }}
          filtered={anyFilter(params as Record<string, string | undefined>)}
          resetLabel={t("list.resetAll")}
        >
          <Pick
            name="project"
            label={t("clients.building")}
            chosen={many(project)}
            anything={t("common.all")}
            choices={buildings.map((b) => ({ value: b.id, label: b.name }))}
          />

          <Pick
            name="partner"
            label={t("clients.partner")}
            chosen={many(partner)}
            anything={t("common.all")}
            choices={[
              { value: "ours", label: t("clients.oursOnly") },
              ...partnerList.map((company) => ({ value: company.id, label: company.name })),
            ]}
          />

          <Pick
            name="source"
            label={t("clients.source")}
            chosen={many(source)}
            anything={t("common.all")}
            /*
              One list, not two. The enquiry sources were offered a second time
              with "from an enquiry" after each of them, which read as ten
              choices where there are five, and the two sets overlapped. The
              client's own source is the one the office sets and the one the
              column shows, so that is the one to filter by.
            */
            choices={(await optionsFor("clientSource", t, { everything: true })).map((one) => ({
              value: `own:${one.value}`,
              label: one.label,
            }))}
          />
          <Pick
            name="agent"
            label={t("contracts.agent")}
            chosen={many(agent)}
            anything={t("common.all")}
            choices={agentList.map((one) => ({ value: one.id, label: one.name }))}
          />
        </SearchBox>

        {rows.length === 0 ? (
          filters ? (
            <NoMatch
              title={t("nothing.match")}
              note={t("nothing.matchNote")}
              clearHref="/clients?all=1"
              clearLabel={t("nothing.clear")}
            />
          ) : (
            <NothingYet
              title={t("nothing.clients")}
              note={t("nothing.clientsNote")}
              icon={<IconClients size={20} />}
              action={
                <>
                  <Link
                    href="/clients/new"
                    className="btn btn-primary !py-1 !text-xs"
                    prefetch={false}
                  >
                    {t("clients.new")}
                  </Link>
                  <Link href="/leads" className="btn btn-secondary !py-1 !text-xs" prefetch={false}>
                    {t("nav.leads")}
                  </Link>
                </>
              }
            />
          )
        ) : (
          <form action={bulkClientMarketing}>
            <input type="hidden" name="q" value={query} />
            <input type="hidden" name="project" value={project} />
            <input type="hidden" name="partner" value={partner} />
            <input type="hidden" name="source" value={source} />

            <RowKeys />

            <div className="mt-4 overflow-x-auto freeze">
              <table className="data">
                <thead>
                  <tr>
                    <th className="pick">
                      <input type="checkbox" data-pagebox aria-label={t("list.all")} />
                    </th>
                    {on("name") ? (
                      <SortTh
                        label={t("common.name")}
                        by="name"
                        current={sort}
                        href={link("name")}
                      />
                    ) : null}
                    {on("email") ? (
                      <SortTh
                        label={t("common.email")}
                        by="email"
                        current={sort}
                        href={link("email")}
                      />
                    ) : null}
                    {on("phone") ? (
                      <SortTh
                        label={t("common.phone")}
                        by="phone"
                        current={sort}
                        href={link("phone")}
                      />
                    ) : null}
                    {on("country") ? (
                      <SortTh
                        label={t("clients.country")}
                        by="country"
                        current={sort}
                        href={link("country")}
                      />
                    ) : null}
                    {on("apartments") ? (
                      <SortTh
                        label={t("clients.apartmentsPlural")}
                        by="apartments"
                        current={sort}
                        href={link("apartments")}
                      />
                    ) : null}
                    {on("building") ? (
                      <SortTh
                        label={t("clients.building")}
                        by="building"
                        current={sort}
                        href={link("building")}
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
                    {on("source") ? (
                      <SortTh
                        label={t("clients.source")}
                        by="source"
                        current={sort}
                        href={link("source")}
                      />
                    ) : null}
                    {on("since") ? (
                      <SortTh
                        label={t("clients.since")}
                        by="since"
                        current={sort}
                        href={link("since")}
                      />
                    ) : null}
                    {on("status") ? (
                      <SortTh
                        className="ctr"
                        label={t("common.status")}
                        by="status"
                        current={sort}
                        href={link("status")}
                      />
                    ) : null}
                    {on("contracts") ? (
                      <SortTh
                        className="ctr"
                        label={t("contracts.title")}
                        by="contracts"
                        current={sort}
                        href={link("contracts")}
                      />
                    ) : null}
                    {on("marketing") ? (
                      <SortTh
                        label={t("clients.marketing")}
                        by="marketing"
                        current={sort}
                        href={link("marketing")}
                      />
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const mine = apartments.get(r.client.id) ?? [];
                    // The developments this client holds something in, once each.
                    const inBuildings = [...new Map(mine.map((a) => [a.projectId, a.projectName]))];
                    // And who holds those developments. No partner line means ours.
                    const withPartners = [...new Set(mine.flatMap((a) => a.partners))];
                    const anyOurs = mine.some((a) => a.partners.length === 0);
                    return (
                      <tr key={r.client.id} data-id={r.client.id}>
                        <td className="pick">
                          <input
                            type="checkbox"
                            name="ids"
                            value={r.client.id}
                            aria-label={`${r.client.lastName} ${r.client.firstName}`}
                          />
                        </td>

                        {on("name") ? (
                          <td>
                            <a
                              /* The name opens the record, as a plain link so it never misses. */
                              data-open
                              href={`/clients/${r.client.id}`}
                              className="font-semibold hover:underline"
                            >
                              {r.client.firstName} {r.client.lastName}
                            </a>
                          </td>
                        ) : null}

                        {on("email") ? (
                          <td className="break-all">
                            <InlineText
                              label={t("common.email")}
                              kind="email"
                              value={r.client.email ?? ""}
                              save={setClientField.bind(null, r.client.id, "email")}
                            />
                          </td>
                        ) : null}

                        {on("phone") ? (
                          <td className="whitespace-nowrap">
                            <InlineText
                              label={t("common.phone")}
                              kind="tel"
                              value={r.client.phone ?? ""}
                              save={setClientField.bind(null, r.client.id, "phone")}
                            />
                          </td>
                        ) : null}

                        {on("country") ? (
                          <td className="whitespace-nowrap">{r.client.country ?? ""}</td>
                        ) : null}

                        {on("apartments") ? (
                          <td>
                            {mine.length === 0 ? (
                              <Link
                                href={`/clients/${r.client.id}`}
                                className="text-xs text-brand-teal-dark hover:underline"
                                prefetch={false}
                              >
                                {t("clients.assign")}
                              </Link>
                            ) : (
                              <ul className="space-y-1">
                                {mine.map((a) => (
                                  <li key={a.unitId}>
                                    <Link
                                      /* Just the apartment. The building it is
                                         in has a column of its own beside this
                                         one, and saying it twice on every row
                                         is what made this column wide. */
                                      href={`/projects/${a.projectId}/units/${a.unitId}`}
                                      title={`${a.projectName} ${a.code}`}
                                      className="text-brand-teal-dark hover:underline"
                                      prefetch={false}
                                    >
                                      {a.code}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        ) : null}

                        {on("building") ? (
                          <td>
                            {inBuildings.length === 0 ? (
                              ""
                            ) : (
                              <ul className="space-y-1">
                                {inBuildings.map(([projectId, name]) => (
                                  <li key={projectId}>
                                    <Link
                                      href={`/projects/${projectId}`}
                                      className="text-brand-teal-dark hover:underline"
                                      prefetch={false}
                                    >
                                      {name}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        ) : null}

                        {on("partner") ? (
                          <td className="text-xs">
                            {mine.length === 0 ? (
                              ""
                            ) : (
                              <ul className="space-y-1">
                                {withPartners.map((name) => (
                                  <li key={name}>{name}</li>
                                ))}
                                {anyOurs ? (
                                  <li className="text-brand-graphite/60">
                                    {t("clients.oursOnly")}
                                  </li>
                                ) : null}
                              </ul>
                            )}
                          </td>
                        ) : null}

                        {on("source") ? (
                          <td className="text-xs whitespace-nowrap">
                            {/*
                              The client's own source, and nothing else.

                              This column used to prefer the source of the
                              enquiry behind the client, so the list said
                              WhatsApp while the client's own record said
                              Enquiry, and editing the client showed the second
                              one. The conversion now carries the source over,
                              so there is one answer and this is it. Whatever
                              the enquiry said in its own words is kept
                              underneath.
                            */}
                            {t(`clients.source.${shownCode(r.client.source, r.client.sourceChoice)}` as MessageKey)}
                            {r.leadSourceText ? (
                              <div className="text-brand-graphite/55">{r.leadSourceText}</div>
                            ) : null}
                          </td>
                        ) : null}

                        {on("since") ? (
                          <td className="text-xs whitespace-nowrap">
                            {/* The day they became a client of ours. */}
                            {new Date(r.client.createdAt).toLocaleDateString(
                              locale === "el" ? "el-GR" : "en-GB",
                            )}
                          </td>
                        ) : null}

                        {on("status") ? (
                          <td className="ctr">
                            {mine.length === 0 ? null : (
                              <ul className="space-y-1">
                                {mine.map((a) => (
                                  <li key={a.unitId}>
                                    <Pill
                                      tone={statusTone(a.status) as "good" | "warn" | "neutral"}
                                    >
                                      {t(`units.status.${shownCode(a.status, a.statusChoice)}` as MessageKey)}
                                    </Pill>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        ) : null}

                        {on("contracts") ? <td className="ctr">{r.contractCount}</td> : null}

                        {on("marketing") ? (
                          <td>
                            {r.client.marketingOptIn ? (
                              <Pill tone="good">{t("clients.marketingOn")}</Pill>
                            ) : (
                              <Pill tone="warn">{t("clients.marketingOff")}</Pill>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <BulkBar
              total={total}
              labels={{
                chosen: t("list.chosen"),
                page: t("list.all"),
                everyMatching: t("list.everyMatching"),
                clear: t("list.clearChosen"),
                scopeAll: t("list.scopeAll"),
              }}
            >
              <button
                type="submit"
                name="marketing"
                value="on"
                className="btn btn-secondary !px-2.5 !py-1 !text-xs"
              >
                {t("list.marketingOn")}
              </button>
              <button
                type="submit"
                name="marketing"
                value="off"
                className="btn btn-secondary !px-2.5 !py-1 !text-xs"
              >
                {t("list.marketingOff")}
              </button>
              <ArmedSubmit
                formAction={bulkClientBin}
                label={t("list.moveToBin")}
                confirm={t("clients.binConfirm")}
                title={t("clients.binHint")}
              />
            </BulkBar>

            <p className="mt-2 text-xs text-brand-graphite/55">{t("list.keyboardHint")}</p>
          </form>
        )}

        <Pagination
          basePath="/clients"
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
