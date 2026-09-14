import Link from "next/link";
import { getTranslator } from "@/i18n";
import { listSubowners } from "@/lib/subowners";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";

const PER_PAGE = 20;

export default async function SubownersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const active = params.active ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const { rows, total } = await listSubowners({ query, active, limit: perPage, offset });

  return (
    <>
      <PageHeader
        title={t("subowners.title")}
        subtitle={t("subowners.subtitle")}
        action={
          <Link href="/subowners/new" target="_blank" rel="noreferrer" className="btn btn-primary">
            {t("subowners.new")}
          </Link>
        }
      />

      <Card>
        <SearchBox
          action="/subowners"
          query={query}
          placeholder={t("subowners.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
        >
          <div className="w-48">
            <label className="label" htmlFor="active">
              {t("common.status")}
            </label>
            <select id="active" name="active" defaultValue={active} className="select">
              <option value="">{t("common.all")}</option>
              <option value="yes">{t("agents.active")}</option>
              <option value="no">{t("agents.inactive")}</option>
            </select>
          </div>
        </SearchBox>

        <div className="mt-4 overflow-x-auto">
          {rows.length === 0 ? (
            <Empty message={query || active ? t("subowners.noneFound") : t("subowners.noneYet")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("subowners.contact")}</th>
                  <th>{t("leads.email")}</th>
                  <th>{t("leads.phone")}</th>
                  <th className="ctr">{t("subowners.projects")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.subowner.id}>
                    <td>
                      <Link
                        href={`/subowners/${r.subowner.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:underline"
                      >
                        {r.subowner.name}
                      </Link>
                      {r.subowner.company ? (
                        <div className="text-xs text-brand-graphite/60">{r.subowner.company}</div>
                      ) : null}
                    </td>
                    <td className="text-sm">{r.subowner.contactName ?? ""}</td>
                    <td className="break-all text-xs">{r.subowner.email ?? ""}</td>
                    <td className="text-xs">{r.subowner.phone ?? ""}</td>
                    <td className="ctr">{r.projectCount}</td>
                    <td>
                      <Pill tone={r.subowner.isActive ? "good" : "warn"}>
                        {r.subowner.isActive ? t("agents.active") : t("agents.inactive")}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          basePath="/subowners"
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
