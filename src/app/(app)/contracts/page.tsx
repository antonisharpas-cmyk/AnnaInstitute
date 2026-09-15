import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, formatPercent } from "@/lib/money";
import { contractIdsFor, contractStatusTone, listContracts } from "@/lib/contracts";
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
import { IconContracts } from "@/components/icons";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";
import ViewsBar from "@/components/ViewsBar";
import RowKeys from "@/components/RowKeys";
import Peek, { PeekLine } from "@/components/Peek";

const PER_PAGE = 15;
const STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
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
    const last = decodeURIComponent(jar.get(lastCookie("contracts"))?.value ?? "");
    if (last) redirect(`/contracts?${last}&saved=1`);
  }

  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);
  const filters = filterQuery(params as Record<string, string | undefined>);

  const [{ rows, total }, views, hidden, orderedIds] = await Promise.all([
    listContracts({ query, status, limit: perPage, offset }),
    viewsFor(user.id, "contracts"),
    hiddenColumns(user.id, "contracts"),
    params.peek ? contractIdsFor({ query, status }) : Promise.resolve([] as string[]),
  ]);

  const { on, hidden: away } = shownColumns("contracts", hidden);
  const currentView = views.find((view) => view.id === params.view) ?? null;

  const here = (extra?: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, ...extra })) {
      if (value) search.set(key, String(value));
    }
    search.delete("saved");
    const text = search.toString();
    return text ? `/contracts?${text}` : "/contracts?all=1";
  };

  const withoutPeek = () => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "peek" && key !== "saved") search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `/contracts?${text}` : "/contracts?all=1";
  };

  const peeked = params.peek ? (rows.find((row) => row.contract.id === params.peek) ?? null) : null;
  const at = params.peek ? orderedIds.indexOf(params.peek) : -1;

  const day = (value: Date | null) =>
    value ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB") : "";

  return (
    <>
      <PageHeader
        title={t("contracts.title")}
        action={
          <Link href="/contracts/new" className="btn btn-primary" prefetch={false}>
            {t("contracts.new")}
          </Link>
        }
      />

      <div className="peeklayout" data-open={Boolean(peeked)}>
        <Card>
          <ViewsBar
            list="contracts"
            views={views}
            query={filters}
            currentView={currentView}
            restored={Boolean(params.saved)}
            columns={COLUMNS.contracts}
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
            action="/contracts"
            query={query}
            placeholder={t("contracts.searchPlaceholder")}
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
                    {t(`contracts.status.${one}` as MessageKey)}
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
                clearHref="/contracts?all=1"
                clearLabel={t("nothing.clear")}
              />
            ) : (
              <NothingYet
                title={t("nothing.contracts")}
                note={t("nothing.contractsNote")}
                icon={<IconContracts size={20} />}
                action={
                  <Link
                    href="/contracts/new"
                    className="btn btn-primary !py-1 !text-xs"
                    prefetch={false}
                  >
                    {t("contracts.new")}
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
                      {on("reference") ? <th>{t("contracts.name")}</th> : null}
                      {on("client") ? <th>{t("contracts.client")}</th> : null}
                      {on("unit") ? <th>{t("contracts.unit")}</th> : null}
                      {on("price") ? <th className="ctr">{t("contracts.netPrice")}</th> : null}
                      {on("vat") ? <th className="ctr">{t("contracts.vat")}</th> : null}
                      {on("plan") ? (
                        <th className="ctr">{t("contracts.installmentsCount")}</th>
                      ) : null}
                      {on("total") ? <th className="ctr">{t("common.total")}</th> : null}
                      {on("paid") ? <th className="ctr">{t("contracts.paid")}</th> : null}
                      {on("outstanding") ? <th className="ctr">{t("dash.outstanding")}</th> : null}
                      {on("status") ? <th className="ctr">{t("common.status")}</th> : null}
                      {on("actions") ? <th>{t("common.actions")}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.contract.id}
                        data-id={r.contract.id}
                        data-peeked={params.peek === r.contract.id}
                      >
                        {on("reference") ? (
                          <td className="whitespace-nowrap">
                            <a
                              /* A plain link, so opening the panel never misses. */
                              href={here({ peek: r.contract.id })}
                              className="font-semibold hover:underline"
                            >
                              {r.contract.reference}
                            </a>
                            <div className="text-xs text-brand-graphite/60">
                              {day(r.contract.contractDate)}
                            </div>
                          </td>
                        ) : null}

                        {on("client") ? (
                          <td>
                            {r.client ? (
                              <Link
                                href={`/clients/${r.client.id}`}
                                className="hover:underline"
                                prefetch={false}
                              >
                                {r.client.firstName} {r.client.lastName}
                              </Link>
                            ) : (
                              <span className="text-xs text-brand-graphite/50">
                                {t("common.none")}
                              </span>
                            )}
                          </td>
                        ) : null}

                        {on("unit") ? (
                          <td>
                            {r.project && r.unit ? (
                              <Link
                                href={`/projects/${r.project.id}/units/${r.unit.id}`}
                                className="hover:underline"
                                prefetch={false}
                              >
                                {r.project.name} {r.unit.code}
                              </Link>
                            ) : (
                              <span className="text-xs text-brand-graphite/50">
                                {t("common.none")}
                              </span>
                            )}
                          </td>
                        ) : null}

                        {on("price") ? (
                          <td className="ctr">
                            {formatAmount(Number(r.contract.netPrice) * 100, locale)}
                          </td>
                        ) : null}

                        {on("vat") ? (
                          <td className="ctr">
                            {formatPercent(Number(r.contract.vatRate), locale)}
                          </td>
                        ) : null}

                        {on("plan") ? (
                          <td className="ctr">
                            {r.installmentCount}
                            <div className="text-xs text-brand-graphite/60">
                              {r.contract.scheduleType === "PERIODIC"
                                ? r.contract.periodMonths === 3
                                  ? t("contracts.quarterly").toLowerCase()
                                  : t("contracts.monthly").toLowerCase()
                                : t("contracts.standardPlan").toLowerCase()}
                            </div>
                          </td>
                        ) : null}

                        {on("total") ? (
                          <td className="ctr">{formatAmount(r.scheduledCents, locale)}</td>
                        ) : null}

                        {on("paid") ? (
                          <td className="ctr">{formatAmount(r.paidCents, locale)}</td>
                        ) : null}

                        {on("outstanding") ? (
                          <td className="ctr font-semibold">
                            {formatAmount(r.outstandingCents, locale)}
                          </td>
                        ) : null}

                        {on("status") ? (
                          <td className="ctr">
                            <Pill
                              tone={
                                contractStatusTone(r.contract.status) as
                                  "good" | "warn" | "bad" | "teal"
                              }
                            >
                              {t(`contracts.status.${r.contract.status}` as MessageKey)}
                            </Pill>
                          </td>
                        ) : null}

                        {on("actions") ? (
                          <td>
                            <div className="flex flex-wrap gap-1">
                              <Link
                                href={`/contracts/${r.contract.id}`}
                                prefetch={false}
                                className="btn btn-secondary !px-3 !py-1 !text-xs"
                              >
                                {t("common.open")}
                              </Link>
                              <Link
                                href={`/contracts/${r.contract.id}/edit`}
                                className="btn btn-secondary !px-3 !py-1 !text-xs"
                                prefetch={false}
                              >
                                {t("common.edit")}
                              </Link>
                              <Link
                                href={`/contracts/new?from=${r.contract.id}`}
                                className="btn btn-secondary !px-3 !py-1 !text-xs"
                                prefetch={false}
                              >
                                {t("contracts.copy")}
                              </Link>
                            </div>
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
            basePath="/contracts"
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
            title={peeked.contract.reference}
            subtitle={
              peeked.client ? `${peeked.client.firstName} ${peeked.client.lastName}` : undefined
            }
            at={at >= 0 ? at + 1 : 1}
            of={orderedIds.length || 1}
            previousHref={at > 0 ? here({ peek: orderedIds[at - 1] }) : null}
            nextHref={
              at >= 0 && at < orderedIds.length - 1 ? here({ peek: orderedIds[at + 1] }) : null
            }
            closeHref={withoutPeek()}
            openHref={`/contracts/${peeked.contract.id}`}
            labels={{
              close: t("peek.close"),
              previous: t("peek.previous"),
              next: t("peek.next"),
              open: t("peek.open"),
              position: t("peek.position"),
            }}
            actions={
              <Link
                href={`/contracts/${peeked.contract.id}/edit`}
                className="btn btn-secondary !py-1 !text-xs"
                prefetch={false}
              >
                {t("common.edit")}
              </Link>
            }
          >
            <PeekLine label={t("common.status")}>
              <Pill
                tone={
                  contractStatusTone(peeked.contract.status) as "good" | "warn" | "bad" | "teal"
                }
              >
                {t(`contracts.status.${peeked.contract.status}` as MessageKey)}
              </Pill>
            </PeekLine>
            <PeekLine label={t("contracts.unit")}>
              {peeked.project && peeked.unit ? (
                <Link
                  href={`/projects/${peeked.project.id}/units/${peeked.unit.id}`}
                  className="text-brand-teal-dark hover:underline"
                  prefetch={false}
                >
                  {peeked.project.name} {peeked.unit.code}
                </Link>
              ) : (
                "―"
              )}
            </PeekLine>
            <PeekLine label={t("contracts.contractDate")}>
              {day(peeked.contract.contractDate) || "―"}
            </PeekLine>
            <PeekLine label={t("contracts.netPrice")}>
              {formatAmount(Number(peeked.contract.netPrice) * 100, locale)}
            </PeekLine>
            <PeekLine label={t("common.total")}>
              {formatAmount(peeked.scheduledCents, locale)}
            </PeekLine>
            <PeekLine label={t("contracts.paid")}>
              {formatAmount(peeked.paidCents, locale)}
            </PeekLine>
            <PeekLine label={t("dash.outstanding")}>
              <span className="font-semibold">{formatAmount(peeked.outstandingCents, locale)}</span>
            </PeekLine>
            <PeekLine label={t("contracts.installmentsCount")}>{peeked.installmentCount}</PeekLine>
          </Peek>
        ) : null}
      </div>
    </>
  );
}
