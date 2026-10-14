import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount } from "@/lib/money";
import { projectsInScope, rangeFrom, scopeChoices, scopeFrom } from "@/lib/reports";
import { addUp, saleLines, STAGES, UNIT_STATUSES, unitsByStatus, type SaleLine, type Stage } from "@/lib/apartmentSales";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { Figure } from "@/components/charts";
import PeriodPicker from "@/components/PeriodPicker";
import { periodLabels, periodQuery } from "../labels";

/** What share of the agreed came in, as a whole percentage. */
const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "");

const STAGE_TONE: Record<Stage, "neutral" | "good" | "warn" | "bad" | "teal"> = {
  NEGOTIATION: "neutral",
  RESERVED: "warn",
  SALE_SIGNED: "teal",
  PAID: "good",
  DELIVERED: "good",
  CANCELLED: "bad",
};

/**
 * Apartment Sales.
 *
 * The one report about the apartments and their contracts: where every
 * apartment stands, how many contracts are at each stage, cancelled ones
 * included, and the money of the sales before VAT, with VAT and in cash, each
 * agreed against received, with the reduced VAT, the penalties, the refunds
 * and the credit notes shown as part of it.
 */
export default async function ApartmentSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; project?: string; partner?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  /* A sales book is read whole: the report opens on everything, and a period narrows it. */
  const picked = rangeFrom({ ...params, period: params.period ?? (params.from || params.to ? undefined : "all") });
  const period = picked.period;
  /* Everything is everything, a contract dated ahead of today included. */
  const range = period === "all" ? { from: new Date(2000, 0, 1), to: new Date(2100, 0, 1) } : picked.range;
  const scope = scopeFrom(params);
  const [only, choices] = await Promise.all([projectsInScope(scope), scopeChoices()]);
  const [units, lines] = await Promise.all([unitsByStatus(only), saleLines(range, only)]);

  const money = (value: number) => formatAmount(value, locale);
  const total = addUp(lines);
  const query = periodQuery(params);

  /* The developments that have apartments or sales, in name order. */
  const projectNames = new Map<string, string>();
  for (const row of units) projectNames.set(row.projectId, row.project);
  for (const line of lines) projectNames.set(line.projectId, line.project);
  const developments = [...projectNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const unitCount = (projectId: string | null, status: string | null) =>
    units
      .filter((row) => (projectId === null || row.projectId === projectId) && (status === null || row.status === status))
      .reduce((sum, row) => sum + row.count, 0);
  const stageCount = (projectId: string | null, stage: Stage | null) =>
    lines.filter((line) => (projectId === null || line.projectId === projectId) && (stage === null || line.stage === stage)).length;

  const muted = (value: number) => (value === 0 ? "text-brand-graphite/40" : "");
  const stageWord = (stage: Stage) => t(`sales.stage.${stage}` as MessageKey);

  /* The money, three ways, agreed against received. */
  const moneyRows = [
    { label: t("sales.beforeVat"), agreed: total.netAgreed, received: total.netReceived },
    { label: t("sales.vat"), agreed: total.grossAgreed - total.netAgreed, received: total.grossReceived - total.netReceived },
    { label: t("sales.withVat"), agreed: total.grossAgreed, received: total.grossReceived, strong: true },
    { label: t("sales.cash"), agreed: total.cashAgreed, received: total.cashReceived },
    {
      label: t("sales.everything"),
      agreed: total.grossAgreed + total.cashAgreed,
      received: total.grossReceived + total.cashReceived,
      strong: true,
    },
  ];

  const byProject = developments
    .map((one) => ({ ...one, sum: addUp(lines.filter((line) => line.projectId === one.id)) }))
    .filter((one) => one.sum.contracts + one.sum.cancelled > 0);

  return (
    <>
      <BackLink href="/reports" label={`${t("common.backTo")} ${t("reports.title").toLowerCase()}`} />
      <PageHeader title={t("sales.title")} subtitle={t("sales.subtitle")} />

      <PeriodPicker
        basePath="/reports/apartments"
        period={period}
        from={params.from}
        to={params.to}
        labels={periodLabels(t)}
        scope={{ ...scope, ...choices }}
        defaultPeriod="all"
        exportHref={`/reports/export?report=apartments${query ? `&${query}` : ""}`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-sales-figures>
        <Figure
          label={t("sales.apartments")}
          value={String(unitCount(null, null))}
          hint={`${unitCount(null, "AVAILABLE")} ${t("units.status.AVAILABLE").toLowerCase()}`}
        />
        <Figure
          label={t("sales.contracts")}
          value={String(total.contracts)}
          hint={`${total.cancelled} ${t("sales.stage.CANCELLED").toLowerCase()}`}
        />
        <Figure
          label={t("sales.receivedWithVat")}
          value={money(total.grossReceived)}
          hint={`${t("sales.outOf")} ${money(total.grossAgreed)} (${share(total.grossReceived, total.grossAgreed) || "0%"})`}
        />
        <Figure
          label={t("sales.cashReceived")}
          value={money(total.cashReceived)}
          hint={`${t("sales.outOf")} ${money(total.cashAgreed)}`}
          tone={total.overdue > 0 ? "warn" : undefined}
        />
      </div>

      <div className="mb-4 grid gap-4">
        <Card title={t("sales.byStatus")} flush>
          {developments.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto" data-sales-status>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("projects.title")}</th>
                    {UNIT_STATUSES.map((status) => (
                      <th key={status} className="num">
                        {t(`units.status.${status}` as MessageKey)}
                      </th>
                    ))}
                    <th className="num">{t("common.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {developments.map((one) => (
                    <tr key={one.id}>
                      <td>
                        <Link href={`/projects/${one.id}`} className="hover:underline">
                          {one.name}
                        </Link>
                      </td>
                      {UNIT_STATUSES.map((status) => (
                        <td key={status} className={`num ${muted(unitCount(one.id, status))}`}>
                          {unitCount(one.id, status)}
                        </td>
                      ))}
                      <td className="num font-semibold">{unitCount(one.id, null)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td>{t("common.total")}</td>
                    {UNIT_STATUSES.map((status) => (
                      <td key={status} className="num">
                        {unitCount(null, status)}
                      </td>
                    ))}
                    <td className="num">{unitCount(null, null)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t("sales.byStage")} flush>
          {lines.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto" data-sales-stages>
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("projects.title")}</th>
                    {STAGES.map((stage) => (
                      <th key={stage} className="num !whitespace-normal">
                        {stageWord(stage)}
                      </th>
                    ))}
                    <th className="num">{t("common.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byProject.map((one) => (
                    <tr key={one.id}>
                      <td>{one.name}</td>
                      {STAGES.map((stage) => (
                        <td key={stage} className={`num ${muted(stageCount(one.id, stage))}`}>
                          {stageCount(one.id, stage)}
                        </td>
                      ))}
                      <td className="num font-semibold">{stageCount(one.id, null)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td>{t("common.total")}</td>
                    {STAGES.map((stage) => (
                      <td key={stage} className="num">
                        {stageCount(null, stage)}
                      </td>
                    ))}
                    <td className="num">{lines.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card title={t("sales.money")} flush>
          <div className="overflow-x-auto" data-sales-money>
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th className="num">{t("sales.agreed")}</th>
                  <th className="num">{t("sales.received")}</th>
                  <th className="num">{t("sales.toReceive")}</th>
                  <th className="num">{t("sales.share")}</th>
                </tr>
              </thead>
              <tbody>
                {moneyRows.map((row) => (
                  <tr key={row.label} className={row.strong ? "font-semibold" : ""}>
                    <td>{row.label}</td>
                    <td className="num">{money(row.agreed)}</td>
                    <td className="num">{money(row.received)}</td>
                    <td className="num">{money(Math.max(0, row.agreed - row.received))}</td>
                    <td className="num">{share(row.received, row.agreed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-brand-graphite/60">{t("sales.moneyNote")}</p>
          </div>
        </Card>

        <Card title={t("sales.changes")} flush>
          <div className="overflow-x-auto" data-sales-changes>
            <table className="data">
              <tbody>
                <tr>
                  <td>{t("sales.reducedVat")}</td>
                  <td className="num">{total.reducedVat}</td>
                  <td className="num">{money(total.vatSaved)}</td>
                </tr>
                <tr>
                  <td>{t("sales.creditNotes")}</td>
                  <td className="num">{total.creditNotes}</td>
                  <td className="num">{money(total.creditNoteCents)}</td>
                </tr>
                <tr>
                  <td>{t("sales.penalties")}</td>
                  <td className="num" />
                  <td className="num">{money(total.penalties)}</td>
                </tr>
                <tr>
                  <td>{t("sales.refunds")}</td>
                  <td className="num" />
                  <td className="num">{money(total.refunds)}</td>
                </tr>
                <tr>
                  <td>{t("sales.cancelledReceived")}</td>
                  <td className="num">{total.cancelled}</td>
                  <td className="num">{money(total.cancelledReceived)}</td>
                </tr>
                <tr>
                  <td>{t("sales.overdue")}</td>
                  <td className="num" />
                  <td className={`num ${total.overdue > 0 ? "font-semibold text-[color:var(--color-negative)]" : ""}`}>
                    {money(total.overdue)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-brand-graphite/60">{t("sales.changesNote")}</p>
          </div>
        </Card>
      </div>

      <div className="mb-4">
        <Card title={t("sales.byDevelopment")} flush>
          {byProject.length === 0 ? (
            <Empty message={t("reports.noData")} />
          ) : (
            <div className="overflow-x-auto" data-sales-projects>
              <table className="data text-xs">
                <thead>
                  <tr>
                    <th>{t("projects.title")}</th>
                    <th className="num">{t("sales.contracts")}</th>
                    <th className="num !whitespace-normal">{t("sales.beforeVat")}</th>
                    <th className="num !whitespace-normal">{t("sales.withVat")}</th>
                    <th className="num !whitespace-normal">{t("sales.cash")}</th>
                    <th className="num !whitespace-normal">{t("sales.reducedVat")}</th>
                    <th className="num !whitespace-normal">{t("sales.penaltiesRefunds")}</th>
                    <th className="num !whitespace-normal">{t("sales.overdue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byProject, { id: "", name: t("common.total"), sum: total }].map((one) => (
                    <tr key={one.id || "total"} className={one.id ? "" : "font-semibold"}>
                      <td>{one.name}</td>
                      <td className="num">
                        {one.sum.contracts}
                        {one.sum.cancelled > 0 ? (
                          <span className="block text-brand-graphite/60">
                            +{one.sum.cancelled} {t("sales.stage.CANCELLED").toLowerCase()}
                          </span>
                        ) : null}
                      </td>
                      <td className="num">
                        {money(one.sum.netReceived)}
                        <span className="block text-brand-graphite/60">
                          {t("sales.outOf")} {money(one.sum.netAgreed)}
                        </span>
                      </td>
                      <td className="num">
                        {money(one.sum.grossReceived)}
                        <span className="block text-brand-graphite/60">
                          {t("sales.outOf")} {money(one.sum.grossAgreed)}
                        </span>
                      </td>
                      <td className="num">
                        {money(one.sum.cashReceived)}
                        <span className="block text-brand-graphite/60">
                          {t("sales.outOf")} {money(one.sum.cashAgreed)}
                        </span>
                      </td>
                      <td className="num">
                        {one.sum.reducedVat}
                        {one.sum.vatSaved > 0 ? <span className="block text-brand-graphite/60">{money(one.sum.vatSaved)}</span> : null}
                      </td>
                      <td className="num">{money(one.sum.penalties + one.sum.refunds)}</td>
                      <td className={`num ${one.sum.overdue > 0 ? "text-[color:var(--color-negative)]" : ""}`}>
                        {money(one.sum.overdue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title={`${t("sales.everySale")} (${lines.length})`} flush>
        {lines.length === 0 ? (
          <Empty message={t("reports.noData")} />
        ) : (
          <div className="overflow-x-auto" data-sales-lines>
            <table className="data text-xs">
              <thead>
                <tr>
                  <th>{t("sales.apartment")}</th>
                  <th>{t("contracts.client")}</th>
                  <th>{t("sales.stageWord")}</th>
                  <th className="num !whitespace-normal">{t("sales.beforeVat")}</th>
                  <th className="num !whitespace-normal">{t("sales.withVat")}</th>
                  <th className="num !whitespace-normal">{t("sales.cash")}</th>
                  <th>{t("sales.notes")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line: SaleLine) => (
                  <tr key={line.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/contracts/${line.id}`} className="font-semibold hover:underline">
                        {line.project} {line.unit}
                      </Link>
                      <span className="block text-brand-graphite/60">
                        {line.reference}
                        {line.date ? `, ${line.date.toISOString().slice(0, 10)}` : ""}
                      </span>
                    </td>
                    <td>
                      {line.clientId ? (
                        <Link href={`/clients/${line.clientId}`} className="hover:underline">
                          {line.buyer}
                        </Link>
                      ) : (
                        line.buyer
                      )}
                    </td>
                    <td>
                      <Pill tone={STAGE_TONE[line.stage]}>{stageWord(line.stage)}</Pill>
                    </td>
                    <td className="num whitespace-nowrap">
                      {money(line.netReceived)}
                      <span className="block text-brand-graphite/60">
                        {t("sales.outOf")} {money(line.netAgreed)}
                      </span>
                    </td>
                    <td className="num whitespace-nowrap">
                      {money(line.grossReceived)}
                      <span className="block text-brand-graphite/60">
                        {t("sales.outOf")} {money(line.grossAgreed)}, {t("sales.vat")} {line.vatRate}%
                      </span>
                    </td>
                    <td className="num whitespace-nowrap">
                      {line.cashAgreed > 0 || line.cashReceived > 0 ? (
                        <>
                          {money(line.cashReceived)}
                          <span className="block text-brand-graphite/60">
                            {t("sales.outOf")} {money(line.cashAgreed)}
                          </span>
                        </>
                      ) : (
                        ""
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {line.reducedVat ? <Pill tone="teal">{`${t("sales.reducedVatShort")} ${money(line.vatSaved)}`}</Pill> : null}
                        {line.penalties > 0 ? <Pill tone="warn">{`${t("sales.penalty")} ${money(line.penalties)}`}</Pill> : null}
                        {line.refunds > 0 ? <Pill tone="warn">{`${t("sales.refund")} ${money(line.refunds)}`}</Pill> : null}
                        {line.creditNotes > 0 ? <Pill>{`${t("sales.creditNoteShort")} ${line.creditNotes}`}</Pill> : null}
                        {line.overdueCents > 0 ? <Pill tone="bad">{`${t("sales.overdueShort")} ${money(line.overdueCents)}`}</Pill> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
