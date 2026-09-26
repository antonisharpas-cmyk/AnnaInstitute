import Link from "next/link";
import { getTranslator } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { allCommissionLines, papersFor } from "@/lib/commissions";
import { dayAndTime } from "@/lib/when";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";
import DateField from "@/components/DateField";

const PER_PAGE = 10;

/**
 * Every commission in one table.
 *
 * One row per commission line: who earned it, on which sale, what was
 * generated, what has been paid (nought until something is), when each of
 * those happened, the two papers, and where it stands. The papers open in a new
 * tab from the row. Paying an agent is done on the agent's own page, where the
 * sale and its papers are.
 */
type Standing = "PENDING" | "PARTIAL" | "PAID" | "COMPLETED" | "CANCELLED";

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    from?: string;
    to?: string;
    by?: string;
  }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim().toLowerCase();
  const status = params.status ?? "";
  const by = params.by === "paid" ? "paid" : "generated";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const all = await allCommissionLines();
  const papers = await papersFor(all.map((row) => row.line.id));

  /* Where a line stands, in the words the office uses. */
  const standingOf = (row: (typeof all)[number]): Standing => {
    if (row.line.status === "CANCELLED") return "CANCELLED";
    const paid = toCents(row.paid);
    const amount = toCents(row.line.amount);
    if (paid <= 0) return "PENDING";
    if (paid < amount) return "PARTIAL";
    return papers.get(row.line.id)?.complete ? "COMPLETED" : "PAID";
  };

  /* Two days, the second one included, read as the office's own days. */
  const dayStart = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const from = dayStart(params.from);
  const toDay = dayStart(params.to);
  const until = toDay ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1) : null;

  const matching = all.filter((r) => {
    const standing = standingOf(r);
    if (status === "PENDING" && standing !== "PENDING" && standing !== "PARTIAL") return false;
    if (status === "PAID" && standing !== "PAID" && standing !== "COMPLETED") return false;
    if (status === "COMPLETED" && standing !== "COMPLETED") return false;
    if (status === "CANCELLED" && standing !== "CANCELLED") return false;

    if (from || until) {
      const at = by === "paid" ? (r.paidAt ? new Date(r.paidAt) : null) : new Date(r.line.createdAt);
      if (!at) return false;
      if (from && at < from) return false;
      if (until && at >= until) return false;
    }

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

  const live = matching.filter((r) => r.line.status !== "CANCELLED");
  const generated = live.reduce((a, r) => a + toCents(r.line.amount), 0);
  const settled = live.reduce((a, r) => a + toCents(r.paid), 0);

  const pill = (standing: Standing) => {
    switch (standing) {
      case "COMPLETED":
        return <Pill tone="good">{t("commissions.completed")}</Pill>;
      case "PAID":
        return <Pill tone="teal">{t("commissions.paidPapersMissing")}</Pill>;
      case "PARTIAL":
        return <Pill tone="warn">{t("commissions.partiallyPaid")}</Pill>;
      case "CANCELLED":
        return <Pill tone="bad">{t("commissions.cancelled")}</Pill>;
      default:
        return <Pill tone="warn">{t("commissions.pending")}</Pill>;
    }
  };

  const paper = (file: { id: string } | null, label: string) =>
    file ? (
      <a
        href={`/api/files/${file.id}`}
        target="_blank"
        rel="noreferrer"
        className="text-brand-teal-dark hover:underline"
      >
        {"✓"} {label}
      </a>
    ) : (
      <span className="text-brand-graphite/50">
        {"–"} {label}
      </span>
    );

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

      <Card>
        <SearchBox
          action="/commissions"
          query={params.q ?? ""}
          placeholder={t("commissions.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
        >
          <div className="w-44">
            <label className="label" htmlFor="status">
              {t("common.status")}
            </label>
            <select id="status" name="status" defaultValue={status} className="select">
              <option value="">{t("common.all")}</option>
              <option value="PENDING">{t("commissions.pending")}</option>
              <option value="PAID">{t("commissions.paidFilter")}</option>
              <option value="COMPLETED">{t("commissions.completed")}</option>
              <option value="CANCELLED">{t("commissions.cancelled")}</option>
            </select>
          </div>
          {/* A period, read against the day a commission was generated or the
              day it was paid, whichever the office picks. */}
          <div className="w-44">
            <label className="label" htmlFor="by">
              {t("commissions.periodBy")}
            </label>
            <select id="by" name="by" defaultValue={by} className="select">
              <option value="generated">{t("commissions.byGenerated")}</option>
              <option value="paid">{t("commissions.byPaid")}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cFrom">
              {t("common.from")}
            </label>
            <DateField id="cFrom" name="from" defaultValue={params.from ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="cTo">
              {t("common.to")}
            </label>
            <DateField id="cTo" name="to" defaultValue={params.to ?? ""} />
          </div>
        </SearchBox>

        <div className="mt-4 overflow-x-auto">
          {rows.length === 0 ? (
            <Empty
              message={
                query || status || params.from || params.to
                  ? t("commissions.noneFound")
                  : t("common.none")
              }
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("contracts.agent")}</th>
                  <th>{t("commissions.sale")}</th>
                  <th>{t("commissions.line")}</th>
                  <th className="ctr">{t("agents.generated")}</th>
                  <th className="ctr">{t("agents.paidOut")}</th>
                  <th>{t("commissions.generatedOn")}</th>
                  <th>{t("commissions.paidOn")}</th>
                  <th>{t("commissions.papers")}</th>
                  <th className="ctr">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const standing = standingOf(r);
                  const mine = papers.get(r.line.id);
                  const paidCents = toCents(r.paid);
                  return (
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
                        <div className="text-xs text-brand-graphite/60">{r.agent.company ?? ""}</div>
                      </td>
                      <td>
                        {r.project && r.unit ? `${r.project.name} ${r.unit.code}` : ""}
                        <div className="text-xs text-brand-graphite/60">
                          {r.client ? `${r.client.firstName} ${r.client.lastName}` : ""}
                          {r.contract ? (
                            <>
                              {r.client ? " . " : ""}
                              <Link
                                href={`/contracts/${r.contract.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-brand-teal-dark hover:underline"
                              >
                                {r.contract.reference}
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {r.line.kind === "RATE"
                          ? t("commissions.onThePrice")
                          : (r.line.label ?? t("commissions.extra"))}
                        {r.line.kind === "RATE" ? (
                          <div className="whitespace-nowrap text-xs text-brand-graphite/60">
                            {formatPercent(Number(r.line.rate), locale)} {t("common.of")}{" "}
                            {formatAmount(toCents(r.line.baseAmount), locale)}
                          </div>
                        ) : null}
                      </td>
                      <td
                        className={`ctr nowrap font-semibold ${
                          standing === "CANCELLED" ? "line-through text-brand-graphite/50" : ""
                        }`}
                      >
                        {formatAmount(toCents(r.line.amount), locale)}
                      </td>
                      <td className="ctr nowrap">{formatAmount(Math.max(0, paidCents), locale)}</td>
                      <td className="nowrap text-xs">{dayAndTime(r.line.createdAt, locale)}</td>
                      <td className="nowrap text-xs">
                        {r.paidAt ? dayAndTime(r.paidAt, locale) : ""}
                      </td>
                      <td className="nowrap text-xs">
                        <div className="whitespace-nowrap">{paper(mine?.invoice ?? null, t("commissions.agentInvoice"))}</div>
                        <div className="whitespace-nowrap">{paper(mine?.receipt ?? null, t("commissions.agentReceipt"))}</div>
                      </td>
                      <td className="ctr">{pill(standing)}</td>
                    </tr>
                  );
                })}
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
    </>
  );
}
