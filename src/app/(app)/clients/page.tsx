import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { apartmentsByClient } from "@/lib/clients";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";

const PER_PAGE = 10;

const statusTone = (status: string) =>
  status === "SOLD" || status === "DELIVERED" ? "good" : status === "RESERVED" ? "warn" : "neutral";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; held?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const held = params.held ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const filters: SQL[] = [];
  if (query) {
    // One box, matching a name, an email address or a telephone number.
    filters.push(
      or(
        ilike(clients.firstName, `%${query}%`),
        ilike(clients.lastName, `%${query}%`),
        ilike(clients.email, `%${query}%`),
        ilike(clients.phone, `%${query}%`),
        sql`concat(${clients.firstName}, ' ', ${clients.lastName}) ilike ${`%${query}%`}`,
      ) as SQL,
    );
  }
  if (held === "yes") {
    filters.push(sql`exists (select 1 from units u where u.client_id = ${clients.id})`);
  }
  if (held === "no") {
    filters.push(sql`not exists (select 1 from units u where u.client_id = ${clients.id})`);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [[counted], rows] = await Promise.all([
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
  ]);

  const apartments = await apartmentsByClient(rows.map((r) => r.client.id));
  const total = counted?.total ?? 0;

  return (
    <>
      <PageHeader
        title={t("clients.title")}
        action={
          <Link href="/clients/new" target="_blank" rel="noreferrer" className="btn btn-primary">
            {t("clients.new")}
          </Link>
        }
      />

      <Card>
        <SearchBox
          action="/clients"
          query={query}
          placeholder={t("clients.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
        >
          <div className="w-44">
            <label className="label" htmlFor="held">
              {t("clients.apartmentsPlural")}
            </label>
            <select id="held" name="held" defaultValue={held} className="select">
              <option value="">{t("common.all")}</option>
              <option value="yes">with an apartment</option>
              <option value="no">without one</option>
            </select>
          </div>
        </SearchBox>

        <div className="mt-4 overflow-x-auto">
          {rows.length === 0 ? (
            <Empty message={query || held ? t("clients.noneFound") : t("common.none")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("common.email")}</th>
                  <th>{t("common.phone")}</th>
                  <th>{t("clients.country")}</th>
                  <th>{t("clients.apartmentsPlural")}</th>
                  <th className="ctr">{t("common.status")}</th>
                  <th className="ctr">{t("contracts.title")}</th>
                  <th>{t("clients.marketing")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const held = apartments.get(r.client.id) ?? [];
                  return (
                    <tr key={r.client.id}>
                      <td>
                        <Link
                          href={`/clients/${r.client.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {r.client.firstName} {r.client.lastName}
                        </Link>
                      </td>
                      <td className="break-all">{r.client.email ?? ""}</td>
                      <td className="whitespace-nowrap">{r.client.phone ?? ""}</td>
                      <td className="whitespace-nowrap">{r.client.country ?? ""}</td>
                      <td>
                        {held.length === 0 ? (
                          <Link
                            href={`/clients/${r.client.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-brand-teal-dark hover:underline"
                          >
                            {t("clients.assign")}
                          </Link>
                        ) : (
                          <ul className="space-y-1">
                            {held.map((a) => (
                              <li key={a.unitId} className="whitespace-nowrap">
                                <Link
                                  href={`/projects/${a.projectId}/units/${a.unitId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-teal-dark hover:underline"
                                >
                                  {a.projectName} {a.code}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="ctr">
                        {held.length === 0 ? null : (
                          <ul className="space-y-1">
                            {held.map((a) => (
                              <li key={a.unitId}>
                                <Pill tone={statusTone(a.status) as "good" | "warn" | "neutral"}>
                                  {t(`units.status.${a.status}` as MessageKey)}
                                </Pill>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="ctr">{r.contractCount}</td>
                      <td>
                        {r.client.marketingOptIn ? (
                          <Pill tone="good">{t("clients.marketingOn")}</Pill>
                        ) : (
                          <Pill tone="warn">{t("clients.marketingOff")}</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          basePath="/clients"
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
