import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { leadCounts, leadIdsFor, leadStatusTone, listLeads } from "@/lib/leads";
import {
  COLUMNS,
  filterQuery,
  hiddenColumns,
  lastCookie,
  shouldRestore,
  shownColumns,
  viewsFor,
} from "@/lib/lists";
import { Card, PageHeader, Pill, Stat } from "@/components/ui";
import { NoMatch, NothingYet } from "@/components/Nothing";
import { IconLeads } from "@/components/icons";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";
import ViewsBar from "@/components/ViewsBar";
import BulkBar from "@/components/BulkBar";
import RowKeys from "@/components/RowKeys";
import Peek, { PeekLine } from "@/components/Peek";
import { InlineSelect } from "@/components/Inline";
import { bulkLeadBin, bulkLeadStatus, setLeadStatusInline } from "./actions";

const PER_PAGE = 20;
const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"] as const;

const when = (value: Date, locale: string) =>
  new Date(value).toLocaleString(locale === "el" ? "el-GR" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    source?: string;
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

  /**
   * Coming back to the list as it was left.
   *
   * Only when the address carries nothing at all, so a link, a search or the
   * All chip is always obeyed. The marker in the address is what lets the bar
   * say so out loud, with one click to see everything again.
   */
  if (shouldRestore(params)) {
    const jar = await cookies();
    const last = decodeURIComponent(jar.get(lastCookie("leads"))?.value ?? "");
    if (last) redirect(`/leads?${last}&saved=1`);
  }

  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const source = params.source ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);
  const filters = filterQuery(params as Record<string, string | undefined>);
  const filtering = filters !== "";

  const [{ rows, total }, counts, views, hidden, orderedIds] = await Promise.all([
    listLeads({ query, status, source, limit: perPage, offset }),
    leadCounts(),
    viewsFor(user.id, "leads"),
    hiddenColumns(user.id, "leads"),
    params.peek ? leadIdsFor({ query, status, source }) : Promise.resolve([]),
  ]);

  const { on, hidden: away } = shownColumns("leads", hidden);
  const currentView = views.find((view) => view.id === params.view) ?? null;

  /** The address of this list, without the panel, so a link can go back to it. */
  const here = (extra?: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...extra })) {
      if (value) search.set(key, String(value));
    }
    search.delete("saved");
    const text = search.toString();
    return text ? `/leads?${text}` : "/leads?all=1";
  };

  const withoutPeek = () => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "peek" && key !== "saved") search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `/leads?${text}` : "/leads?all=1";
  };

  const peeked = params.peek ? (rows.find((row) => row.lead.id === params.peek) ?? null) : null;
  const at = params.peek ? orderedIds.indexOf(params.peek) : -1;
  const statusOptions = STATUSES.map((one) => ({
    value: one,
    label: t(`leads.status.${one}` as MessageKey),
  }));

  return (
    <>
      <PageHeader
        title={t("leads.title")}
        subtitle={t("leads.subtitle")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/bin" className="btn btn-secondary" prefetch={false}>
              {t("bin.title")}
            </Link>
            <Link href="/leads/api" className="btn btn-secondary" prefetch={false}>
              {t("leads.apiAccess")}
            </Link>
            <Link href="/leads/new" className="btn btn-primary" prefetch={false}>
              {t("leads.newLead")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat
          label={t("leads.fresh")}
          value={String(counts.fresh)}
          tone="warn"
          href="/leads?status=NEW"
        />
        <Stat
          label={t("leads.working")}
          value={String(counts.working)}
          href="/leads?status=CONTACTED"
        />
        <Stat
          label={t("leads.convertedCount")}
          value={String(counts.converted)}
          tone="good"
          href="/leads?status=CONVERTED"
        />
      </div>

      <div className="peeklayout" data-open={Boolean(peeked)}>
        <Card>
          <ViewsBar
            list="leads"
            views={views}
            query={filters}
            currentView={currentView}
            restored={Boolean(params.saved)}
            columns={COLUMNS.leads}
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
            action="/leads"
            query={query}
            placeholder={t("leads.searchPlaceholder")}
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
                {STATUSES.map((one) => (
                  <option key={one} value={one}>
                    {t(`leads.status.${one}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-48">
              <label className="label" htmlFor="source">
                {t("leads.camefrom")}
              </label>
              <select id="source" name="source" defaultValue={source} className="select">
                <option value="">{t("common.all")}</option>
                {(["WEBSITE", "ENQUIRY", "AGENT", "WHATSAPP", "OTHER"] as const).map((one) => (
                  <option key={one} value={one}>
                    {t(`leads.source.${one}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
          </SearchBox>

          {rows.length === 0 ? (
            filtering ? (
              <NoMatch
                title={t("nothing.match")}
                note={t("nothing.matchNote")}
                clearHref="/leads?all=1"
                clearLabel={t("nothing.clear")}
              />
            ) : (
              <NothingYet
                title={t("nothing.leads")}
                note={t("nothing.leadsNote")}
                icon={<IconLeads size={20} />}
                action={
                  <>
                    <Link
                      href="/leads/new"
                      className="btn btn-primary !py-1 !text-xs"
                      prefetch={false}
                    >
                      {t("leads.newLead")}
                    </Link>
                    <Link
                      href="/leads/api"
                      className="btn btn-secondary !py-1 !text-xs"
                      prefetch={false}
                    >
                      {t("leads.apiAccess")}
                    </Link>
                  </>
                }
              />
            )
          ) : (
            <form action={bulkLeadStatus}>
              <input type="hidden" name="q" value={query} />
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="source" value={source} />

              <RowKeys />

              <div className="mt-4 overflow-x-auto freeze">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="pick">
                        <input type="checkbox" data-pagebox aria-label={t("list.all")} />
                      </th>
                      {on("name") ? <th>{t("common.name")}</th> : null}
                      {on("received") ? <th>{t("leads.received")}</th> : null}
                      {on("contact") ? <th>{t("leads.contact")}</th> : null}
                      {on("source") ? <th>{t("leads.camefrom")}</th> : null}
                      {on("status") ? <th>{t("common.status")}</th> : null}
                      {on("about") ? <th>{t("leads.about")}</th> : null}
                      {on("note") ? <th>{t("leads.note")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.lead.id}
                        data-id={r.lead.id}
                        data-peeked={params.peek === r.lead.id}
                      >
                        <td className="pick">
                          <input
                            type="checkbox"
                            name="ids"
                            value={r.lead.id}
                            aria-label={r.lead.email ?? r.lead.id}
                          />
                        </td>

                        {on("name") ? (
                          <td className="whitespace-nowrap">
                            <a
                              /* A plain link, so opening the panel never misses. */
                              href={here({ peek: r.lead.id })}
                              className="font-semibold hover:underline"
                            >
                              {[r.lead.firstName, r.lead.lastName].filter(Boolean).join(" ") || "?"}
                            </a>
                          </td>
                        ) : null}

                        {on("received") ? (
                          <td className="whitespace-nowrap text-xs">
                            {when(r.lead.createdAt, locale)}
                          </td>
                        ) : null}

                        {on("contact") ? (
                          <td className="text-xs">
                            <div className="break-all">{r.lead.email ?? ""}</div>
                            <div>{r.lead.phone ?? ""}</div>
                          </td>
                        ) : null}

                        {on("source") ? (
                          <td className="text-xs">
                            <div>{t(`leads.source.${r.lead.sourceKind}` as MessageKey)}</div>
                            {r.lead.sourceKind === "OTHER" && r.lead.source ? (
                              <div className="text-brand-graphite/60">{r.lead.source}</div>
                            ) : null}
                            {r.lead.utmCampaign ? (
                              <div className="text-brand-graphite/60">{r.lead.utmCampaign}</div>
                            ) : null}
                          </td>
                        ) : null}

                        {on("status") ? (
                          <td>
                            <InlineSelect
                              label={t("common.status")}
                              value={r.lead.status}
                              options={statusOptions}
                              save={setLeadStatusInline.bind(null, r.lead.id)}
                            />
                            {r.client ? (
                              <div className="mt-0.5">
                                <Link
                                  href={`/clients/${r.client.id}`}
                                  className="text-xs text-brand-teal-dark hover:underline"
                                  prefetch={false}
                                >
                                  {r.client.firstName} {r.client.lastName}
                                </Link>
                              </div>
                            ) : null}
                          </td>
                        ) : null}

                        {on("about") ? (
                          <td className="text-xs">
                            {r.project ? (
                              <Link
                                href={`/projects/${r.project.id}`}
                                className="hover:underline"
                                prefetch={false}
                              >
                                {r.project.name}
                              </Link>
                            ) : (
                              (r.lead.projectName ?? "")
                            )}
                            {r.lead.unitCode ? <div>{r.lead.unitCode}</div> : null}
                          </td>
                        ) : null}

                        {on("note") ? (
                          <td className="max-w-80 text-xs text-brand-graphite/70">
                            {r.lead.message ?? ""}
                          </td>
                        ) : null}
                      </tr>
                    ))}
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
                <label className="flex items-center gap-1.5 text-xs font-semibold">
                  {t("list.setStatus")}
                  <select name="newStatus" className="select !w-auto !py-1 !text-xs">
                    {STATUSES.filter((one) => one !== "CONVERTED").map((one) => (
                      <option key={one} value={one}>
                        {t(`leads.status.${one}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="btn btn-primary !px-2.5 !py-1 !text-xs">
                  {t("list.apply")}
                </button>
                <button
                  type="submit"
                  formAction={bulkLeadBin}
                  className="btn btn-secondary !px-2.5 !py-1 !text-xs"
                >
                  {t("list.moveToBin")}
                </button>
              </BulkBar>

              <p className="mt-2 text-xs text-brand-graphite/55">{t("list.keyboardHint")}</p>
            </form>
          )}

          <Pagination
            basePath="/leads"
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
            title={
              [peeked.lead.firstName, peeked.lead.lastName].filter(Boolean).join(" ") ||
              t("bin.lead")
            }
            subtitle={when(peeked.lead.createdAt, locale)}
            at={at >= 0 ? at + 1 : 1}
            of={orderedIds.length || 1}
            previousHref={at > 0 ? here({ peek: orderedIds[at - 1] }) : null}
            nextHref={
              at >= 0 && at < orderedIds.length - 1 ? here({ peek: orderedIds[at + 1] }) : null
            }
            closeHref={withoutPeek()}
            openHref={`/leads/${peeked.lead.id}`}
            labels={{
              close: t("peek.close"),
              previous: t("peek.previous"),
              next: t("peek.next"),
              open: t("peek.open"),
              position: t("peek.position"),
            }}
          >
            <PeekLine label={t("common.status")}>
              <Pill tone={leadStatusTone(peeked.lead.status) as "good" | "warn" | "neutral"}>
                {t(`leads.status.${peeked.lead.status}` as MessageKey)}
              </Pill>
            </PeekLine>
            <PeekLine label={t("common.email")}>{peeked.lead.email ?? "―"}</PeekLine>
            <PeekLine label={t("common.phone")}>{peeked.lead.phone ?? "―"}</PeekLine>
            <PeekLine label={t("leads.camefrom")}>
              {t(`leads.source.${peeked.lead.sourceKind}` as MessageKey)}
              {peeked.lead.source ? ` . ${peeked.lead.source}` : ""}
            </PeekLine>
            <PeekLine label={t("leads.about")}>
              {peeked.project?.name ?? peeked.lead.projectName ?? "―"}
              {peeked.lead.unitCode ? ` ${peeked.lead.unitCode}` : ""}
            </PeekLine>
            {peeked.lead.message ? (
              <PeekLine label={t("leads.note")}>
                <span className="text-xs">{peeked.lead.message}</span>
              </PeekLine>
            ) : null}
            {peeked.client ? (
              <PeekLine label={t("nav.clients")}>
                <Link
                  href={`/clients/${peeked.client.id}`}
                  className="text-brand-teal-dark hover:underline"
                  prefetch={false}
                >
                  {peeked.client.firstName} {peeked.client.lastName}
                </Link>
              </PeekLine>
            ) : null}
          </Peek>
        ) : null}
      </div>
    </>
  );
}
