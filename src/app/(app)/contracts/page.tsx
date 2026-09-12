import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent } from "@/lib/money";
import { contractStatusTone, listContracts } from "@/lib/contracts";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";

const PER_PAGE = 10;

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const { rows, total } = await listContracts({ query, status, limit: perPage, offset });

  return (
    <>
      <PageHeader
        title={t("contracts.title")}
        action={
          <Link href="/contracts/new" target="_blank" rel="noreferrer" className="btn btn-primary">
            {t("contracts.new")}
          </Link>
        }
      />

      <Card>
        <SearchBox
          action="/contracts"
          query={query}
          placeholder={t("contracts.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
        >
          <div className="w-48">
            <label className="label" htmlFor="status">
              {t("common.status")}
            </label>
            <select id="status" name="status" defaultValue={status} className="select">
              <option value="">{t("common.all")}</option>
              <option value="DRAFT">{t("contracts.status.DRAFT")}</option>
              <option value="ACTIVE">{t("contracts.status.ACTIVE")}</option>
              <option value="COMPLETED">{t("contracts.status.COMPLETED")}</option>
              <option value="CANCELLED">{t("contracts.status.CANCELLED")}</option>
            </select>
          </div>
        </SearchBox>

        <div className="mt-4 overflow-x-auto">
          {rows.length === 0 ? (
            <Empty message={query || status ? t("contracts.noneFound") : t("common.none")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("contracts.name")}</th>
                  <th>{t("contracts.client")}</th>
                  <th>{t("contracts.unit")}</th>
                  <th className="ctr">{t("contracts.netPrice")}</th>
                  <th className="ctr">{t("contracts.vat")}</th>
                  <th className="ctr">{t("contracts.installmentsCount")}</th>
                  <th className="ctr">{t("common.total")}</th>
                  <th className="ctr">{t("contracts.paid")}</th>
                  <th className="ctr">{t("dash.outstanding")}</th>
                  <th className="ctr">{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.contract.id}>
                    <td>
                      <Link
                        href={`/contracts/${r.contract.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:underline"
                      >
                        {r.contract.reference}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {r.contract.contractDate
                          ? new Date(r.contract.contractDate).toLocaleDateString(
                              locale === "el" ? "el-GR" : "en-GB",
                            )
                          : ""}
                      </div>
                    </td>
                    <td>
                      {r.client ? (
                        <Link
                          href={`/clients/${r.client.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {r.client.firstName} {r.client.lastName}
                        </Link>
                      ) : (
                        <span className="text-xs text-brand-graphite/50">{t("common.none")}</span>
                      )}
                    </td>
                    <td>
                      {r.project && r.unit ? (
                        <Link
                          href={`/projects/${r.project.id}/units/${r.unit.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {r.project.name} {r.unit.code}
                        </Link>
                      ) : (
                        <span className="text-xs text-brand-graphite/50">{t("common.none")}</span>
                      )}
                    </td>
                    <td className="ctr">
                      {formatAmount(Number(r.contract.netPrice) * 100, locale)}
                    </td>
                    <td className="ctr">{formatPercent(Number(r.contract.vatRate), locale)}</td>
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
                    <td className="ctr">{formatAmount(r.scheduledCents, locale)}</td>
                    <td className="ctr">{formatAmount(r.paidCents, locale)}</td>
                    <td className="ctr font-semibold">
                      {formatAmount(r.outstandingCents, locale)}
                    </td>
                    <td className="ctr">
                      <Pill
                        tone={
                          contractStatusTone(r.contract.status) as "good" | "warn" | "bad" | "teal"
                        }
                      >
                        {t(`contracts.status.${r.contract.status}` as MessageKey)}
                      </Pill>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <Link
                          href={`/contracts/${r.contract.id}/edit`}
                          className="btn btn-secondary !px-3 !py-1 !text-xs"
                        >
                          {t("common.edit")}
                        </Link>
                        <Link
                          href={`/contracts/new?from=${r.contract.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary !px-3 !py-1 !text-xs"
                        >
                          {t("contracts.copy")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          basePath="/contracts"
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
