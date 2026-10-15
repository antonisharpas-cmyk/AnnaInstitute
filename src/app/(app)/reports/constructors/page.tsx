import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent } from "@/lib/money";
import { monthLabel, projectsInScope, rangeFrom, scopeChoices, scopeFrom } from "@/lib/reports";
import { constructorChoices, constructorJobs, constructorMonths, constructorPaymentLines } from "@/lib/constructorReport";
import { many } from "@/lib/filters";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { BarSeries, Figure, SERIES, shortMoney } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import Pagination, { paginate } from "@/components/Pagination";
import { periodLabels } from "../labels";

/** What share of the agreed has been paid, as a whole percentage. */
const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "");

/**
 * Constructors.
 *
 * Each constructor on each development: what was agreed, what was paid, what
 * is waiting and what is still to pay, the money month by month, and every
 * payment with its invoice and receipt. Narrowed by period, by development and
 * by constructor, several of each.
 */
export default async function ConstructorReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; project?: string; builder?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  /* A building contract runs for years: the report opens on everything. */
  const picked = rangeFrom({ ...params, period: params.period ?? (params.from || params.to ? undefined : "all") });
  const period = picked.period;
  const range = period === "all" ? { from: new Date(2000, 0, 1), to: new Date(2100, 0, 1) } : picked.range;
  const scope = scopeFrom({ project: params.project });
  const builders = many(params.builder).join(",");
  const { page, perPage, offset } = paginate(params as Record<string, string | undefined>, 10);

  const [only, choices, builderChoices] = await Promise.all([projectsInScope(scope), scopeChoices(), constructorChoices()]);
  const filter = { range, only, builders };
  const [jobs, months, lines] = await Promise.all([
    constructorJobs(filter),
    /* The chart reads up to two years ahead, so payments set for coming months show as pending. */
    constructorMonths(
      period === "all" ? { ...filter, range: { from: new Date(2000, 0, 1), to: new Date(new Date().getFullYear() + 2, 11, 31) } } : filter,
    ),
    constructorPaymentLines(filter, perPage, offset),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const sum = (pick: (job: (typeof jobs)[number]) => number) => jobs.reduce((total, job) => total + pick(job), 0);
  const agreed = sum((job) => job.agreed);
  const paid = sum((job) => job.paid);
  const pending = sum((job) => job.pending);
  const remaining = sum((job) => job.remaining);
  const missing = sum((job) => job.papersMissing);
  const paidTotal = sum((job) => job.paidTotal);
  const pendingTotal = sum((job) => job.pendingTotal);
  const withVat = (cents: number) => `${money(cents)} ${t("vat.withVatShort")}`;
  const day = (value: Date) => value.toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");

  return (
    <>
      <BackLink href="/reports" label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`} />
      <PageHeader title={t("reports.constructors")} subtitle={t("reports.constructorsNote")} />

      <PeriodPicker
        basePath="/reports/constructors"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        defaultPeriod="all"
        scope={{ ...scope, partner: "", buildings: choices.buildings, partners: [], noPartner: true }}
        extra={{
          name: "builder",
          label: t("constructors.title"),
          chosen: builders,
          anything: t("reports.everyConstructor"),
          choices: builderChoices,
        }}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-constructor-figures>
        <Figure label={t("constructors.agreed")} value={money(agreed)} hint={`${jobs.length} ${t("reports.agreements")}`} />
        <Figure
          label={t("constructors.paid")}
          value={money(paid)}
          hint={`${share(paid, agreed) ? `${share(paid, agreed)} ${t("reports.ofAgreed")} . ` : ""}${withVat(paidTotal)}`}
          tone="good"
        />
        <Figure label={t("constructors.pending")} value={money(pending)} hint={withVat(pendingTotal)} tone={pending > 0 ? "warn" : undefined} />
        <Figure label={t("constructors.remaining")} value={money(remaining)} />
        <Figure label={t("reports.papersMissing")} value={String(missing)} tone={missing > 0 ? "bad" : undefined} hint={t("reports.papersMissingHint")} />
      </div>

      <div className="mb-4">
        <Card title={t("reports.constructorMonthly")}>
          <BarSeries
            empty={t("reports.noData")}
            labels={months.map((row) => monthLabel(row.month, locale))}
            series={[
              { label: t("constructors.paid"), colour: SERIES.primary, values: months.map((row) => row.paidCents), format: shortMoney },
              { label: t("constructors.pending"), colour: SERIES.secondary, values: months.map((row) => row.pendingCents), format: shortMoney },
            ]}
          />
        </Card>
      </div>

      <div className="mb-4">
        <Card title={t("reports.byConstructor")} flush>
          {jobs.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto" data-constructor-jobs>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("reports.constructorWord")}</th>
                    <th>{t("constructors.project")}</th>
                    <th className="num">{t("constructors.agreed")}</th>
                    <th className="num">{t("constructors.paid")}</th>
                    <th className="num">%</th>
                    <th className="num">{t("reports.paidWithVat")}</th>
                    <th className="num">{t("constructors.pending")}</th>
                    <th className="num">{t("constructors.remaining")}</th>
                    <th className="num">{t("reports.papersMissing")}</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Link href={`/constructors/${job.constructorId}`} className="font-semibold hover:underline">
                          {job.builder}
                        </Link>
                      </td>
                      <td>{job.project}</td>
                      <td className="num whitespace-nowrap">{money(job.agreed)}</td>
                      <td className="num whitespace-nowrap">{money(job.paid)}</td>
                      <td className="num">{share(job.paid, job.agreed)}</td>
                      <td className="num whitespace-nowrap">{money(job.paidTotal)}</td>
                      <td className={`num whitespace-nowrap ${job.pending > 0 ? "font-semibold" : "text-brand-graphite/40"}`}>{money(job.pending)}</td>
                      <td className="num whitespace-nowrap">{money(job.remaining)}</td>
                      <td className={`num ${job.papersMissing > 0 ? "font-semibold text-[color:var(--color-negative)]" : "text-brand-graphite/40"}`}>
                        {job.papersMissing}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td colSpan={2}>{t("common.total")}</td>
                    <td className="num whitespace-nowrap">{money(agreed)}</td>
                    <td className="num whitespace-nowrap">{money(paid)}</td>
                    <td className="num">{share(paid, agreed)}</td>
                    <td className="num whitespace-nowrap">{money(paidTotal)}</td>
                    <td className="num whitespace-nowrap">{money(pending)}</td>
                    <td className="num whitespace-nowrap">{money(remaining)}</td>
                    <td className="num">{missing}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title={`${t("reports.everyConstructorPayment")} (${lines.total})`} flush>
        {lines.rows.length === 0 ? (
          <Empty message={t("reports.noData")} />
        ) : (
          <div className="overflow-x-auto" data-constructor-lines>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("reports.constructorWord")}</th>
                  <th>{t("constructors.project")}</th>
                  <th>{t("constructors.kind")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("constructors.invoice")}</th>
                  <th>{t("constructors.receipt")}</th>
                  <th className="num">{t("vat.beforeVat")}</th>
                  <th className="num">{t("vat.vat")}</th>
                  <th className="num">{t("vat.withVat")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.rows.map((row) => {
                  /* A paper is only expected of a payment made, not of one cancelled or entered as history. */
                  const expected = row.status === "PAID" && !row.history;
                  const paper = (has: boolean) =>
                    has ? (
                      <Pill tone="good">{t("reports.paperIn")}</Pill>
                    ) : expected ? (
                      <Pill tone="bad">{t("reports.paperMissing")}</Pill>
                    ) : (
                      <span className="text-brand-graphite/40">{t("reports.paperNotYet")}</span>
                    );
                  return (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{day(row.at)}</td>
                      <td>
                        <Link href={`/constructors/${row.constructorId}`} className="hover:underline">
                          {row.builder}
                        </Link>
                      </td>
                      <td>{row.project}</td>
                      <td>
                        {row.kind}
                        {row.history ? (
                          <span className="ml-1">
                            <Pill>{t("history.pill")}</Pill>
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <Pill tone={row.status === "PAID" ? "good" : row.status === "PENDING" ? "warn" : "neutral"}>
                          {t(`constructors.status.${row.status}` as MessageKey)}
                        </Pill>
                      </td>
                      <td>{paper(row.hasInvoice)}</td>
                      <td>{paper(row.hasReceipt)}</td>
                      <td className="num whitespace-nowrap">{money(row.cents)}</td>
                      <td className="num whitespace-nowrap">
                        {money(row.vatCents)}
                        <div className="text-xs text-brand-graphite/60">{formatPercent(row.vatRate, locale)}</div>
                      </td>
                      <td className="num whitespace-nowrap font-semibold">{money(row.totalCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 pb-3">
          <Pagination
            basePath="/reports/constructors"
            params={params as Record<string, string | undefined>}
            info={{ page, perPage, total: lines.total }}
            labels={{
              previous: t("common.previous"),
              next: t("common.next"),
              showing: t("common.showing"),
              of: t("common.of"),
            }}
          />
        </div>
      </Card>
    </>
  );
}
