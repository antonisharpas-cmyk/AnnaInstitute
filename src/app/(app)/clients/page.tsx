import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { apartmentsByClient, clientFilters } from "@/lib/clients";
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
import Pagination, { paginate } from "@/components/Pagination";
import ViewsBar from "@/components/ViewsBar";
import BulkBar from "@/components/BulkBar";
import RowKeys from "@/components/RowKeys";
import Peek, { PeekLine } from "@/components/Peek";
import { InlineText } from "@/components/Inline";
import { bulkClientBin, bulkClientMarketing, setClientField } from "./actions";

const PER_PAGE = 20;

const statusTone = (status: string) =>
  status === "SOLD" || status === "DELIVERED" ? "good" : status === "RESERVED" ? "warn" : "neutral";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    held?: string;
    page?: string;
    view?: string;
    peek?: string;
    all?: string;
    saved?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await requireUser(["ADMIN"]);
  const { t } = await getTranslator();

  if (shouldRestore(params)) {
    const jar = await cookies();
    const last = decodeURIComponent(jar.get(lastCookie("clients"))?.value ?? "");
    if (last) redirect(`/clients?${last}&saved=1`);
  }

  const query = (params.q ?? "").trim();
  const held = params.held ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);
  const filters = filterQuery(params as Record<string, string | undefined>);
  const where = clientFilters({ query, held });

  const [[counted], rows, views, hidden, ordered] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(clients)
      .where(where),
    db
      .select({
        client: clients,
        contractCount: sql<number>`count(${contracts.id})::int`,
      })
      .from(clients)
      .leftJoin(contracts, eq(contracts.clientId, clients.id))
      .where(where)
      .groupBy(clients.id)
      .orderBy(asc(clients.lastName), asc(clients.firstName))
      .limit(perPage)
      .offset(offset),
    viewsFor(user.id, "clients"),
    hiddenColumns(user.id, "clients"),
    params.peek
      ? db
          .select({ id: clients.id })
          .from(clients)
          .where(where)
          .orderBy(asc(clients.lastName), asc(clients.firstName))
          .limit(2000)
      : Promise.resolve([] as { id: string }[]),
  ]);

  const apartments = await apartmentsByClient(rows.map((r) => r.client.id));
  const total = counted?.total ?? 0;
  const { on, hidden: away } = shownColumns("clients", hidden);
  const currentView = views.find((view) => view.id === params.view) ?? null;
  const orderedIds = ordered.map((row) => row.id);

  const here = (extra?: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...extra })) {
      if (value) search.set(key, String(value));
    }
    search.delete("saved");
    const text = search.toString();
    return text ? `/clients?${text}` : "/clients?all=1";
  };

  const withoutPeek = () => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "peek" && key !== "saved") search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `/clients?${text}` : "/clients?all=1";
  };

  const peeked = params.peek ? (rows.find((row) => row.client.id === params.peek) ?? null) : null;
  const at = params.peek ? orderedIds.indexOf(params.peek) : -1;
  const peekedApartments = peeked ? (apartments.get(peeked.client.id) ?? []) : [];

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

      <div className="peeklayout" data-open={Boolean(peeked)}>
        <Card>
          <ViewsBar
            list="clients"
            views={views}
            query={filters}
            currentView={currentView}
            restored={Boolean(params.saved)}
            columns={COLUMNS.clients}
            hidden={away}
            backTo={here()}
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
            keep={{ view: params.view }}
          >
            <div className="w-44">
              <label className="label" htmlFor="held">
                {t("clients.apartmentsPlural")}
              </label>
              <select id="held" name="held" defaultValue={held} className="select">
                <option value="">{t("common.all")}</option>
                <option value="yes">{t("clients.withApartment")}</option>
                <option value="no">{t("clients.withoutApartment")}</option>
              </select>
            </div>
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
                    <Link
                      href="/leads"
                      className="btn btn-secondary !py-1 !text-xs"
                      prefetch={false}
                    >
                      {t("nav.leads")}
                    </Link>
                  </>
                }
              />
            )
          ) : (
            <form action={bulkClientMarketing}>
              <input type="hidden" name="q" value={query} />
              <input type="hidden" name="held" value={held} />

              <RowKeys />

              <div className="mt-4 overflow-x-auto freeze">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="pick">
                        <input type="checkbox" data-pagebox aria-label={t("list.all")} />
                      </th>
                      {on("name") ? <th>{t("common.name")}</th> : null}
                      {on("email") ? <th>{t("common.email")}</th> : null}
                      {on("phone") ? <th>{t("common.phone")}</th> : null}
                      {on("country") ? <th>{t("clients.country")}</th> : null}
                      {on("apartments") ? <th>{t("clients.apartmentsPlural")}</th> : null}
                      {on("status") ? <th className="ctr">{t("common.status")}</th> : null}
                      {on("contracts") ? <th className="ctr">{t("contracts.title")}</th> : null}
                      {on("marketing") ? <th>{t("clients.marketing")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const mine = apartments.get(r.client.id) ?? [];
                      return (
                        <tr
                          key={r.client.id}
                          data-id={r.client.id}
                          data-peeked={params.peek === r.client.id}
                        >
                          <td className="pick">
                            <input
                              type="checkbox"
                              name="ids"
                              value={r.client.id}
                              aria-label={`${r.client.lastName} ${r.client.firstName}`}
                            />
                          </td>

                          {on("name") ? (
                            <td className="whitespace-nowrap">
                              <a
                                /* A plain link, so opening the panel never misses. */
                                href={here({ peek: r.client.id })}
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
                                    <li key={a.unitId} className="whitespace-nowrap">
                                      <Link
                                        href={`/projects/${a.projectId}/units/${a.unitId}`}
                                        className="text-brand-teal-dark hover:underline"
                                        prefetch={false}
                                      >
                                        {a.projectName} {a.code}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
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
                                        {t(`units.status.${a.status}` as MessageKey)}
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
                <button
                  type="submit"
                  formAction={bulkClientBin}
                  className="btn btn-ghost !px-2.5 !py-1 !text-xs"
                >
                  {t("list.moveToBin")}
                </button>
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

        {peeked ? (
          <Peek
            title={`${peeked.client.firstName} ${peeked.client.lastName}`.trim()}
            subtitle={peeked.client.country ?? undefined}
            at={at >= 0 ? at + 1 : 1}
            of={orderedIds.length || 1}
            previousHref={at > 0 ? here({ peek: orderedIds[at - 1] }) : null}
            nextHref={
              at >= 0 && at < orderedIds.length - 1 ? here({ peek: orderedIds[at + 1] }) : null
            }
            closeHref={withoutPeek()}
            openHref={`/clients/${peeked.client.id}`}
            labels={{
              close: t("peek.close"),
              previous: t("peek.previous"),
              next: t("peek.next"),
              open: t("peek.open"),
              position: t("peek.position"),
            }}
          >
            <PeekLine label={t("common.email")}>{peeked.client.email ?? "―"}</PeekLine>
            <PeekLine label={t("common.phone")}>{peeked.client.phone ?? "―"}</PeekLine>
            <PeekLine label={t("clients.marketing")}>
              {peeked.client.marketingOptIn ? (
                <Pill tone="good">{t("clients.marketingOn")}</Pill>
              ) : (
                <Pill tone="warn">{t("clients.marketingOff")}</Pill>
              )}
            </PeekLine>
            <PeekLine label={t("contracts.title")}>{peeked.contractCount}</PeekLine>
            <PeekLine label={t("clients.apartmentsPlural")}>
              {peekedApartments.length === 0 ? (
                "―"
              ) : (
                <ul className="space-y-0.5">
                  {peekedApartments.map((a) => (
                    <li key={a.unitId}>
                      <Link
                        href={`/projects/${a.projectId}/units/${a.unitId}`}
                        className="text-brand-teal-dark hover:underline"
                        prefetch={false}
                      >
                        {a.projectName} {a.code}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </PeekLine>
          </Peek>
        ) : null}
      </div>
    </>
  );
}
