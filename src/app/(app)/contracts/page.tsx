import { optionsFor, shownCode } from "@/lib/choices";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, formatPercent } from "@/lib/money";
import { CONTRACT_ORDER, contractStatusTone, listContracts } from "@/lib/contracts";
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
import { IconContracts } from "@/components/icons";
import SearchBox from "@/components/SearchBox";
import SortTh from "@/components/SortTh";
import Pick from "@/components/Pick";
import Pagination, { paginate } from "@/components/Pagination";
import ViewsBar from "@/components/ViewsBar";
import RowKeys from "@/components/RowKeys";
import ConfirmButton from "@/components/ConfirmButton";
import { deleteContract } from "./actions";

const PER_PAGE = 15;

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
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
    const last = decodeURIComponent(jar.get(lastCookie("contracts"))?.value ?? "");
    if (last) redirect(`/contracts?${last}&saved=1`);
  }

  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);
  const filters = filterQuery(params as Record<string, string | undefined>);

  const sort = readSort(params as Record<string, string | undefined>, Object.keys(CONTRACT_ORDER), {
    key: "date",
    dir: "desc",
  });

  const [{ rows, total }, views, hidden] = await Promise.all([
    listContracts({ query, status, sort: sort.key, dir: sort.dir, limit: perPage, offset }),
    viewsFor(user.id, "contracts"),
    hiddenColumns(user.id, "contracts"),
  ]);

  const { on, hidden: away } = shownColumns("contracts", hidden);
  const link = (key: string) =>
    sortHref("/contracts", params as Record<string, string | undefined>, key, sort);
  const currentView = views.find((view) => view.id === params.view) ?? null;

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
          filtered={anyFilter(params as Record<string, string | undefined>)}
          resetLabel={t("list.resetAll")}
        >
          <Pick
            name="status"
            label={t("common.status")}
            chosen={many(status)}
            anything={t("common.all")}
            choices={await optionsFor("contractStatus", t, { everything: true })}
          />
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
                    {on("reference") ? (
                      <SortTh
                        label={t("contracts.name")}
                        by="reference"
                        current={sort}
                        href={link("reference")}
                      />
                    ) : null}
                    {on("client") ? (
                      <SortTh
                        label={t("contracts.client")}
                        by="client"
                        current={sort}
                        href={link("client")}
                      />
                    ) : null}
                    {on("unit") ? (
                      <SortTh
                        label={t("contracts.unit")}
                        by="unit"
                        current={sort}
                        href={link("unit")}
                      />
                    ) : null}
                    {on("price") ? (
                      <SortTh
                        className="ctr"
                        label={t("contracts.netPrice")}
                        by="price"
                        current={sort}
                        href={link("price")}
                      />
                    ) : null}
                    {on("vat") ? (
                      <SortTh
                        className="ctr"
                        label={t("contracts.vat")}
                        by="vat"
                        current={sort}
                        href={link("vat")}
                      />
                    ) : null}
                    {on("plan") ? (
                      <SortTh
                        className="ctr"
                        label={t("contracts.installmentsCount")}
                        by="plan"
                        current={sort}
                        href={link("plan")}
                      />
                    ) : null}
                    {on("total") ? (
                      <SortTh
                        className="ctr"
                        label={t("common.total")}
                        by="total"
                        current={sort}
                        href={link("total")}
                      />
                    ) : null}
                    {on("paid") ? (
                      <SortTh
                        className="ctr"
                        label={t("contracts.paid")}
                        by="paid"
                        current={sort}
                        href={link("paid")}
                      />
                    ) : null}
                    {on("outstanding") ? (
                      <SortTh
                        className="ctr"
                        label={t("dash.outstanding")}
                        by="outstanding"
                        current={sort}
                        href={link("outstanding")}
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
                    {on("actions") ? <th>{t("common.actions")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.contract.id} data-id={r.contract.id}>
                      {on("reference") ? (
                        <td>
                          <a
                            /* The name opens the record, as a plain link so it never misses. */
                            data-open
                            href={`/contracts/${r.contract.id}`}
                            className="font-semibold hover:underline"
                          >
                            {r.contract.reference}
                          </a>
                          <div className="text-xs text-brand-graphite/60">
                            {day(r.contract.contractDate)}
                          </div>
                          {/* An antiparochi in a list of sales should not look
                              like a sale: nobody is paying for anything. */}
                          {r.contract.kind === "LAND_EXCHANGE" ? (
                            <div className="mt-0.5">
                              <Pill tone="teal">{t("contracts.kind.LAND_EXCHANGE")}</Pill>
                            </div>
                          ) : null}
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
                        <td className="ctr">{formatPercent(Number(r.contract.vatRate), locale)}</td>
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
                        <td className="ctr">
                          {formatAmount(r.paidCents, locale)}
                          {r.refundedCents > 0 ? (
                            <span className="block text-xs text-[color:var(--color-negative)]">
                              {t("refunds.paidBack")} {formatAmount(r.refundedCents, locale)}
                            </span>
                          ) : null}
                        </td>
                      ) : null}

                      {on("outstanding") ? (
                        <td className="ctr font-semibold">
                          {/* Nought outstanding on a schedule that had something
                              in it is not a blank, it is paid off, and it is
                              worth a word rather than a figure. */}
                          {r.scheduledCents > 0 && r.outstandingCents <= 0 ? (
                            <Pill tone="good">{t("contracts.paidInFull")}</Pill>
                          ) : (
                            formatAmount(r.outstandingCents, locale)
                          )}
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
                            {t(`contracts.status.${shownCode(r.contract.status, r.contract.statusChoice)}` as MessageKey)}
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
                            <ConfirmButton
                              action={deleteContract.bind(null, r.contract.id)}
                              label={t("common.delete")}
                              confirm={t("remove.sure")}
                              title={t("remove.contractWhat")}
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
    </>
  );
}
