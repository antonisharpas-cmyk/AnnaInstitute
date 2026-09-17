import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { latestNoteByLead, LEAD_ORDER, leadCounts, listLeads } from "@/lib/leads";
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
import { Card, PageHeader } from "@/components/ui";
import { NoMatch, NothingYet } from "@/components/Nothing";
import { IconLeads } from "@/components/icons";
import SearchBox from "@/components/SearchBox";
import SortTh from "@/components/SortTh";
import Pick from "@/components/Pick";
import Pagination, { paginate } from "@/components/Pagination";
import ViewsBar from "@/components/ViewsBar";
import BulkBar from "@/components/BulkBar";
import RowKeys from "@/components/RowKeys";
import { InlineSelect } from "@/components/Inline";
import { bulkLeadBin, bulkLeadStatus, setLeadStatusInline } from "./actions";

const PER_PAGE = 20;
/**
 * The statuses an enquiry can be in, including the one that ends it.
 *
 * Became a client is offered here because that is how somebody working down the
 * list thinks about it, but it is not stored as a state the list then has to
 * carry: choosing it creates the client record and the enquiry leaves this list
 * for the clients list, which is the office's own rule.
 */
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
  const sort = readSort(params as Record<string, string | undefined>, Object.keys(LEAD_ORDER), {
    key: "received",
    dir: "desc",
  });
  const filters = filterQuery(params as Record<string, string | undefined>);
  const filtering = filters !== "";

  const [{ rows, total }, counts, views, hidden] = await Promise.all([
    listLeads({ query, status, source, sort: sort.key, dir: sort.dir, limit: perPage, offset }),
    leadCounts(),
    viewsFor(user.id, "leads"),
    hiddenColumns(user.id, "leads"),
  ]);

  const { on, hidden: away } = shownColumns("leads", hidden);
  const latestNotes = await latestNoteByLead(rows.map((r) => r.lead.id));
  const link = (key: string) =>
    sortHref("/leads", params as Record<string, string | undefined>, key, sort);
  const currentView = views.find((view) => view.id === params.view) ?? null;

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

      {/*
        The board in three words. All is a filter like the other two rather than
        a way of clearing the others, because "show me everything" is a thing
        people ask for constantly and it should be one button, always in the
        same place, next to the two halves of the work.
      */}
      {/*
        Plain links on purpose. These three go to the same path with different
        search parameters, which is exactly the navigation the router
        intermittently fetches and never commits, so the browser does it.
      */}
      {/* eslint-disable @next/next/no-html-link-for-pages */}
      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href="/leads?all=1"
          className="tab"
          data-on={status === "" && !params.source ? "true" : "false"}
        >
          {t("list.all")}
          <span className="tabcount">{counts.total}</span>
        </a>
        <a href="/leads?status=NEW" className="tab" data-on={status === "NEW" ? "true" : "false"}>
          {t("leads.status.NEW")}
          <span className="tabcount">{counts.fresh}</span>
        </a>
        <a
          href="/leads?status=HANDLED"
          className="tab"
          data-on={status === "HANDLED" ? "true" : "false"}
        >
          {t("leads.handled")}
          <span className="tabcount">{counts.handled}</span>
        </a>
      </div>
      {/* eslint-enable @next/next/no-html-link-for-pages */}

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
          filtered={anyFilter(params as Record<string, string | undefined>)}
          resetLabel={t("list.resetAll")}
        >
          <Pick
            name="status"
            label={t("common.status")}
            chosen={many(status)}
            anything={t("common.all")}
            choices={STATUSES.map((one) => ({
              value: one,
              label: t(`leads.status.${one}` as MessageKey),
            }))}
          />
          <Pick
            name="source"
            label={t("leads.camefrom")}
            chosen={many(source)}
            anything={t("common.all")}
            choices={(["WEBSITE", "ENQUIRY", "AGENT", "WHATSAPP", "OTHER"] as const).map((one) => ({
              value: one,
              label: t(`leads.source.${one}` as MessageKey),
            }))}
          />
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
                    {on("name") ? (
                      <SortTh
                        label={t("common.name")}
                        by="name"
                        current={sort}
                        href={link("name")}
                      />
                    ) : null}
                    {on("received") ? (
                      <SortTh
                        label={t("leads.received")}
                        by="received"
                        current={sort}
                        href={link("received")}
                      />
                    ) : null}
                    {on("contact") ? (
                      <SortTh
                        label={t("leads.contact")}
                        by="contact"
                        current={sort}
                        href={link("contact")}
                      />
                    ) : null}
                    {on("source") ? (
                      <SortTh
                        label={t("leads.camefrom")}
                        by="source"
                        current={sort}
                        href={link("source")}
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
                    {on("about") ? (
                      <SortTh
                        label={t("leads.about")}
                        by="about"
                        current={sort}
                        href={link("about")}
                      />
                    ) : null}
                    {on("note") ? (
                      <SortTh
                        label={t("leads.note")}
                        by="note"
                        current={sort}
                        href={link("note")}
                      />
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.lead.id} data-id={r.lead.id}>
                      <td className="pick">
                        <input
                          type="checkbox"
                          name="ids"
                          value={r.lead.id}
                          aria-label={r.lead.email ?? r.lead.id}
                        />
                      </td>

                      {on("name") ? (
                        <td>
                          <a
                            /* The name opens the record, as a plain link so it never misses. */
                            data-open
                            href={`/leads/${r.lead.id}`}
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
                          {/*
                            The last thing written about this enquiry, which is
                            what somebody scanning the list wants. The whole
                            record, with its dates, is on the enquiry itself.
                          */}
                          {latestNotes.get(r.lead.id) ?? r.lead.message ?? ""}
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
                  {/* A conversion is a record at a time, so it is not offered here. */}
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
    </>
  );
}
