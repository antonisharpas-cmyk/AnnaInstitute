import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, commissionPayments } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { allCommissionLines } from "@/lib/commissions";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import { recordCommissionPayment } from "../agents/actions";

const PER_PAGE = 10;

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim().toLowerCase();
  const status = params.status ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  /**
   * A commission belongs to one sale: one apartment on one contract. The rows
   * are joined through the assignment, which is where the agent is recorded.
   */
  const all = await allCommissionLines();

  const matching = all.filter((r) => {
    const paidCents = toCents(r.paid);
    const owed = toCents(r.line.amount) - paidCents;
    if (status === "PAID" && owed > 0) return false;
    if (status === "PENDING" && owed <= 0) return false;
    if (!query) return true;
    const haystack = [
      r.agent.name,
      r.agent.company,
      r.contract?.reference,
      r.unit?.code,
      r.project?.name,
      r.client ? `${r.client.firstName} ${r.client.lastName}` : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const rows = matching.slice(offset, offset + perPage);

  const [paymentRows, agentList] = await Promise.all([
    db
      .select({ payment: commissionPayments, agent: agents })
      .from(commissionPayments)
      .innerJoin(agents, eq(agents.id, commissionPayments.agentId))
      .orderBy(desc(commissionPayments.paidOn))
      .limit(20),
    db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.name)),
  ]);

  const generated = matching.reduce((a, r) => a + toCents(r.line.amount), 0);
  const settled = matching.reduce((a, r) => a + toCents(r.paid), 0);

  return (
    <>
      <PageHeader
        title={t("commissions.title")}
        action={
          <Link href="/agents" className="btn btn-secondary">
            {t("agents.title")}
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t("agents.generated")} value={formatAmount(generated, locale)} />
        <Stat label={t("agents.paidOut")} value={formatAmount(settled, locale)} />
        <Stat label={t("agents.owed")} value={formatAmount(generated - settled, locale)} />
      </div>

      <div className="space-y-4">
        <Card>
          <SearchBox
            action="/commissions"
            query={params.q ?? ""}
            placeholder={t("commissions.searchPlaceholder")}
            searchLabel={t("common.search")}
            clearLabel={t("common.clear")}
          >
            <div className="w-48">
              <label className="label" htmlFor="status">
                {t("common.status")}
              </label>
              <select id="status" name="status" defaultValue={status} className="select">
                <option value="">{t("common.all")}</option>
                <option value="PENDING">{t("commissions.owed")}</option>
                <option value="PAID">{t("commissions.settled")}</option>
              </select>
            </div>
          </SearchBox>

          <div className="mt-4 overflow-x-auto">
            {rows.length === 0 ? (
              <Empty message={query || status ? t("commissions.noneFound") : t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("contracts.agent")}</th>
                    <th>{t("contracts.title")}</th>
                    <th>{t("commissions.sale")}</th>
                    <th>{t("commissions.line")}</th>
                    <th className="ctr">{t("commissions.base")}</th>
                    <th className="ctr">{t("agents.rate")}</th>
                    <th className="ctr">{t("contracts.amount")}</th>
                    <th className="ctr">{t("agents.paidOut")}</th>
                    <th className="ctr">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line.id}>
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
                          {r.agent.company ?? ""}
                        </div>
                      </td>
                      <td>
                        {r.contract ? (
                          <Link
                            href={`/contracts/${r.contract.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {r.contract.reference}
                          </Link>
                        ) : (
                          ""
                        )}
                      </td>
                      <td>
                        {r.project && r.unit ? `${r.project.name} ${r.unit.code}` : ""}
                        {r.client ? (
                          <div className="text-xs text-brand-graphite/60">
                            {r.client.firstName} {r.client.lastName}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {r.line.kind === "RATE"
                          ? t("commissions.onThePrice")
                          : (r.line.label ?? t("commissions.extra"))}
                      </td>
                      <td className="ctr">
                        {r.line.kind === "RATE"
                          ? formatAmount(toCents(r.line.baseAmount), locale)
                          : ""}
                      </td>
                      <td className="ctr">
                        {r.line.kind === "RATE" ? formatPercent(Number(r.line.rate), locale) : ""}
                      </td>
                      <td className="ctr font-semibold">
                        {formatAmount(toCents(r.line.amount), locale)}
                      </td>
                      <td className="ctr">{formatAmount(toCents(r.paid), locale)}</td>
                      <td className="ctr">
                        {(() => {
                          const owed = toCents(r.line.amount) - toCents(r.paid);
                          return (
                            <Pill
                              tone={owed <= 0 ? "good" : toCents(r.paid) > 0 ? "warn" : "neutral"}
                            >
                              {owed <= 0 ? t("commissions.settled") : t("commissions.owed")}
                            </Pill>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Pagination
            basePath="/commissions"
            params={params}
            info={{ page, perPage, total: matching.length }}
            labels={{
              previous: t("common.previous"),
              next: t("common.next"),
              showing: t("common.showing"),
              of: t("common.of"),
            }}
          />
        </Card>

        <Card title={t("commissions.paidOutTitle")}>
          <div className="mb-4">
            <Disclosure showLabel={t("agents.recordPayment")} hideLabel={t("common.cancel")}>
              {agentList.length === 0 ? (
                <p className="text-sm text-brand-graphite/60">Add an agent first.</p>
              ) : (
                <form
                  action={recordCommissionPayment}
                  className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2"
                >
                  <div>
                    <label className="label" htmlFor="agentId">
                      {t("contracts.agent")}
                    </label>
                    <select id="agentId" name="agentId" required className="select">
                      {agentList.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="commissionId">
                      {t("commissions.sale")}
                    </label>
                    <select id="commissionId" name="commissionId" className="select">
                      <option value="">not against one sale</option>
                      {all
                        .filter((r) => r.line.status !== "PAID")
                        .map((r) => (
                          <option key={r.line.id} value={r.line.id}>
                            {r.agent.name} . {r.contract?.reference ?? ""} {r.unit?.code ?? ""} .{" "}
                            {formatAmount(toCents(r.line.amount), locale)}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="amount">
                      {t("contracts.amount")}
                    </label>
                    <input id="amount" name="amount" required className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="paidOn">
                      {t("common.date")}
                    </label>
                    <DateField id="paidOn" name="paidOn" />
                  </div>
                  <div>
                    <label className="label" htmlFor="reference">
                      {t("commissions.reference")}
                    </label>
                    <input id="reference" name="reference" className="input" />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className="btn btn-primary">
                      {t("common.save")}
                    </button>
                  </div>
                </form>
              )}
            </Disclosure>
          </div>

          {paymentRows.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("contracts.agent")}</th>
                    <th className="ctr">{t("contracts.amount")}</th>
                    <th>{t("commissions.reference")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((r) => (
                    <tr key={r.payment.id}>
                      <td>{day(r.payment.paidOn)}</td>
                      <td>
                        <Link
                          href={`/agents/${r.agent.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {r.agent.name}
                        </Link>
                      </td>
                      <td className="ctr">{formatAmount(toCents(r.payment.amount), locale)}</td>
                      <td>{r.payment.reference ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
