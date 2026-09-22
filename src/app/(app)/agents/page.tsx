import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agents, commissions } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";
import ConfirmButton from "@/components/ConfirmButton";
import { deleteAgent } from "./actions";

const PER_PAGE = 10;

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const active = params.active ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const filters: SQL[] = [];
  if (query) {
    filters.push(
      or(
        ilike(agents.name, `%${query}%`),
        ilike(agents.company, `%${query}%`),
        ilike(agents.email, `%${query}%`),
        ilike(agents.phone, `%${query}%`),
      ) as SQL,
    );
  }
  if (active === "yes") filters.push(eq(agents.isActive, true));
  if (active === "no") filters.push(eq(agents.isActive, false));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [[counted], rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(agents)
      .where(where),
    db
      .select({
        agent: agents,
        sales: sql<number>`count(${commissions.id})::int`,
        generated: sql<string>`coalesce(sum(${commissions.amount}), 0)`,
        paid: sql<string>`coalesce((select sum(cp.amount) from commission_payments cp where cp.agent_id = ${agents.id}), 0)`,
      })
      .from(agents)
      .leftJoin(commissions, eq(commissions.agentId, agents.id))
      .where(where)
      .groupBy(agents.id)
      .orderBy(asc(agents.name))
      .limit(perPage)
      .offset(offset),
  ]);

  const total = counted?.total ?? 0;

  return (
    <>
      <PageHeader
        title={t("agents.title")}
        action={
          <Link href="/agents/new" target="_blank" rel="noreferrer" className="btn btn-primary">
            {t("agents.new")}
          </Link>
        }
      />

      <Card>
        <SearchBox
          action="/agents"
          query={query}
          placeholder={t("agents.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
        >
          <div className="w-40">
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
            <Empty message={query || active ? t("agents.noneFound") : t("common.none")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("agents.company")}</th>
                  <th className="ctr">{t("agents.rate")}</th>
                  <th className="ctr">{t("agents.sales")}</th>
                  <th className="ctr">{t("agents.generated")}</th>
                  <th className="ctr">{t("agents.paidOut")}</th>
                  <th className="ctr">{t("agents.owed")}</th>
                  <th className="ctr">{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const generated = toCents(r.generated);
                  const paid = toCents(r.paid);
                  return (
                    <tr key={r.agent.id}>
                      <td>
                        <Link
                          href={`/agents/${r.agent.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {r.agent.name}
                        </Link>
                        <div className="text-xs text-brand-graphite/60">
                          {[r.agent.email, r.agent.phone].filter(Boolean).join(" . ")}
                        </div>
                      </td>
                      <td>{r.agent.company ?? ""}</td>
                      <td className="ctr">
                        {formatPercent(Number(r.agent.commissionRate), locale)}
                      </td>
                      <td className="ctr">{r.sales}</td>
                      <td className="ctr">{formatAmount(generated, locale)}</td>
                      <td className="ctr">{formatAmount(paid, locale)}</td>
                      <td className="ctr font-semibold">
                        {formatAmount(generated - paid, locale)}
                      </td>
                      <td className="ctr">
                        <Pill tone={r.agent.isActive ? "good" : "warn"}>
                          {r.agent.isActive ? t("agents.active") : t("agents.inactive")}
                        </Pill>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/agents/${r.agent.id}/edit`}
                            className="btn btn-secondary !px-3 !py-1 !text-xs"
                          >
                            {t("common.edit")}
                          </Link>
                          <ConfirmButton
                            action={deleteAgent.bind(null, r.agent.id)}
                            label={t("common.delete")}
                            confirm={t("remove.sure")}
                            title={t("remove.agentWhat")}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          basePath="/agents"
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
