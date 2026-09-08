import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatMoney, formatPercent, toCents } from "@/lib/money";
import { effectiveVatRate } from "@/lib/vat";
import { getContract } from "@/lib/contracts";
import { documentsForContract } from "@/lib/documents";
import { titleWithExtension } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import DocumentList from "@/components/DocumentList";
import UploadForm from "@/components/UploadForm";
import {
  addChangeRequest,
  recordPayment,
  deleteContractDocument,
  setChangeRequestStatus,
  setContractCommissionRate,
  updateInstallment,
  updateVat,
  uploadContractDocuments,
} from "../actions";

const dateFor = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const detail = await getContract(id);
  if (!detail) notFound();

  const { contract, unit, project, client, agent, installments, totals, vatSetup } = detail;
  const blended = effectiveVatRate(vatSetup);
  const [requests, contractDocuments] = await Promise.all([
    db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.contractId, id))
      .orderBy(desc(changeRequests.requestedOn)),
    documentsForContract(id),
  ]);

  const openLines = installments.filter((l) => !(l.paidCents > 0 || l.status === "PAID"));
  const isSplit = toCents(contract.vatBaseReduced) > 0 && toCents(contract.vatBaseStandard) > 0;

  return (
    <>
      <BackLink href="/contracts" label={`${t("common.backTo")} ${t("contracts.title").toLowerCase()}`} />
      <PageHeader
        title={contract.reference}
        subtitle={`${client.firstName} ${client.lastName} . ${project.name} ${unit.code}${
          agent ? ` . ${t("contracts.agent")}: ${agent.name}` : ""
        }`}
        action={
          <Link href={`/clients/${client.id}`} className="btn btn-secondary">
            {t("contracts.client")}
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("contracts.netPrice")} value={formatMoney(totals.netCents, locale)} />
        <Stat
          label={t("contracts.vat")}
          value={formatMoney(totals.scheduleVatCents, locale)}
          hint={`${t("contracts.effectiveRate")} ${formatPercent(Number(blended.toFixed(3)), locale)}`}
        />
        <Stat label={t("contracts.paid")} value={formatMoney(totals.paidTotalCents, locale)} />
        <Stat label={t("dash.outstanding")} value={formatMoney(totals.outstandingCents, locale)} />
      </div>

      <div className="mb-4">
          <Card title={t("contracts.schedule")}>
          {installments.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("contracts.stage")}</th>
                    <th className="num">{t("contracts.percent")}</th>
                    <th className="num">{t("contracts.net")}</th>
                    <th className="num">{t("contracts.vatCol")}</th>
                    <th className="num">{t("common.total")}</th>
                    <th className="num">{t("contracts.paid")}</th>
                    <th>{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((line) => {
                    const locked = line.paidCents > 0 || line.status === "PAID";
                    return (
                      <tr key={line.id}>
                        <td className="num">{line.seq}</td>
                        <td>
                          <form
                            action={updateInstallment.bind(null, line.id)}
                            className="flex items-center gap-1 whitespace-nowrap"
                          >
                            <input
                              name="label"
                              defaultValue={line.label}
                              className="input !w-36 !py-1 !text-xs"
                              aria-label={t("contracts.stage")}
                            />
                            <input
                              name="dueDate"
                              type="date"
                              defaultValue={dateFor(line.dueDate)}
                              className="input !w-32 !py-1 !text-xs"
                              aria-label={t("contracts.due")}
                            />
                            <button
                              type="submit"
                              className="btn btn-secondary !px-2 !py-1 !text-xs"
                              title={t("common.save")}
                            >
                              {t("common.save")}
                            </button>
                          </form>
                        </td>
                        <td className="num">{Number(line.percentage)}%</td>
                        <td className="num">{formatMoney(line.netCents, locale)}</td>
                        <td className="num">
                          {formatMoney(line.vatCents, locale)}
                          <div className="text-xs text-brand-graphite/50">
                            {formatPercent(Number(Number(line.vatRateApplied).toFixed(3)), locale)}
                          </div>
                        </td>
                        <td className="num font-semibold">{formatMoney(line.totalCents, locale)}</td>
                        <td className="num">{formatMoney(line.paidCents, locale)}</td>
                        <td>
                          {locked ? (
                            <span title={t("contracts.lockedHint")}>
                              <Pill tone={line.status === "PAID" ? "good" : "warn"}>
                                {line.status === "PAID" ? t("contracts.paid") : t("contracts.locked")}
                              </Pill>
                            </span>
                          ) : (
                            <Pill>open</Pill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-line font-semibold">
                    <td colSpan={3}>{t("common.total")}</td>
                    <td className="num">{formatMoney(totals.scheduleNetCents, locale)}</td>
                    <td className="num">{formatMoney(totals.scheduleVatCents, locale)}</td>
                    <td className="num">{formatMoney(totals.scheduleTotalCents, locale)}</td>
                    <td className="num">{formatMoney(totals.paidTotalCents, locale)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-brand-graphite/60">{t("contracts.lockedHint")}</p>
        </Card>

      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("contracts.recordPayment")}>
            <form action={recordPayment.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="installmentId">
                  {t("contracts.stage")}
                </label>
                <select id="installmentId" name="installmentId" className="select">
                  {openLines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.seq}. {l.label} . {formatMoney(l.totalCents - l.paidCents, locale)}
                    </option>
                  ))}
                  <option value="">not assigned to a stage</option>
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
                <input id="paidOn" name="paidOn" type="date" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="receiptNumber">
                  {t("contracts.receipt")}
                </label>
                <input id="receiptNumber" name="receiptNumber" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="method">
                  {t("contracts.method")}
                </label>
                <input id="method" name="method" placeholder="bank transfer" className="input" />
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn btn-primary w-full">
                  {t("common.save")}
                </button>
              </div>
            </form>

            {detail.payments.length > 0 ? (
              <table className="data mt-4">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th className="num">{t("contracts.amount")}</th>
                    <th>{t("contracts.receipt")}</th>
                    <th>{t("contracts.method")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{dateFor(p.paidOn)}</td>
                      <td className="num">{formatMoney(toCents(p.amount), locale)}</td>
                      <td>{p.receiptNumber ?? ""}</td>
                      <td>{p.method ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Card>

          <Card title={t("contracts.changeRequests")}>
            {requests.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data mb-4">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("common.name")}</th>
                    <th className="num">Cost</th>
                    <th>{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>{dateFor(r.requestedOn)}</td>
                      <td>
                        <div className="font-semibold">{r.title}</div>
                        {r.description ? (
                          <div className="text-xs text-brand-graphite/60">{r.description}</div>
                        ) : null}
                      </td>
                      <td className="num">{r.costImpact ? formatMoney(toCents(r.costImpact), locale) : ""}</td>
                      <td>
                        <form
                          action={setChangeRequestStatus.bind(null, r.id, id)}
                          className="flex items-center gap-1 whitespace-nowrap"
                        >
                          <select
                            name="status"
                            defaultValue={r.status}
                            className="select !w-32 !py-1 !text-xs"
                            aria-label={t("common.status")}
                          >
                            <option value="SUBMITTED">submitted</option>
                            <option value="IN_REVIEW">in review</option>
                            <option value="APPROVED">approved</option>
                            <option value="REJECTED">rejected</option>
                            <option value="COMPLETED">completed</option>
                          </select>
                          <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                            {t("common.save")}
                          </button>
                        </form>
                        <div className="mt-1 space-y-0.5">
                          {contractDocuments
                            .filter((d) => d.changeRequestId === r.id)
                            .map((d) => (
                              <span key={d.id} className="flex items-center gap-2">
                                <a
                                  href={`/api/files/${d.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-brand-teal-dark hover:underline"
                                >
                                  {titleWithExtension(d)}
                                </a>
                                <a
                                  href={`/api/files/${d.id}?download=1`}
                                  className="text-xs text-brand-graphite/60 hover:underline"
                                >
                                  {t("common.download").toLowerCase()}
                                </a>
                              </span>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <form action={addChangeRequest.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="title">
                  {t("common.name")}
                </label>
                <input id="title" name="title" required className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="description">
                  {t("common.notes")}
                </label>
                <textarea id="description" name="description" rows={2} className="textarea" />
              </div>
              <div>
                <label className="label" htmlFor="costImpact">
                  Cost
                </label>
                <input id="costImpact" name="costImpact" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="changeFiles">
                  Attach the PDF of the request
                </label>
                <input
                  id="changeFiles"
                  name="files"
                  type="file"
                  multiple
                  className="input !py-1.5 text-xs"
                />
              </div>
              <div className="flex items-end sm:col-span-2">
                <button type="submit" className="btn btn-primary w-full">
                  {t("common.add")}
                </button>
              </div>
            </form>
            <p className="mt-3 text-xs text-brand-graphite/60">
              Attachments are kept for ever, so the history of what the client asked for is never
              lost.
            </p>
          </Card>
          <Card title={t("contracts.documents")}>
            <DocumentList
              items={contractDocuments}
              emptyMessage={t("common.none")}
              locale={locale}
              action={(doc) => (
                <form action={deleteContractDocument.bind(null, doc.id, id)}>
                  <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                    {t("common.delete")}
                  </button>
                </form>
              )}
            />
            <div className="mt-4 border-t border-brand-line pt-4">
              <UploadForm
                action={uploadContractDocuments.bind(null, id)}
                categories={["CONTRACT", "RECEIPT", "FLOOR_PLAN", "IDENTIFICATION", "OTHER"]}
                defaultCategory="CONTRACT"
                submitLabel="Upload"
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t("contracts.vatSetup")}>
            <form action={updateVat.bind(null, id)} className="space-y-3">
              <div>
                <label className="label" htmlFor="netPriceEdit">
                  {t("contracts.netPrice")}
                </label>
                <input
                  id="netPriceEdit"
                  name="netPrice"
                  defaultValue={Number(contract.netPrice).toFixed(2)}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="vatModeEdit">
                  Mode
                </label>
                <select
                  id="vatModeEdit"
                  name="vatMode"
                  className="select"
                  defaultValue={
                    isSplit
                      ? "split"
                      : toCents(contract.vatBaseStandard) > 0
                        ? "single_standard"
                        : "single_reduced"
                  }
                >
                  <option value="single_reduced">whole price at the reduced rate</option>
                  <option value="single_standard">whole price at the standard rate</option>
                  <option value="split">split between the two rates</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="reducedRateEdit">
                    {t("contracts.vatReducedRate")}
                  </label>
                  <input
                    id="reducedRateEdit"
                    name="reducedRate"
                    defaultValue={Number(contract.vatRateReduced)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="standardRateEdit">
                    {t("contracts.vatStandardRate")}
                  </label>
                  <input
                    id="standardRateEdit"
                    name="standardRate"
                    defaultValue={Number(contract.vatRateStandard)}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="reducedBaseEdit">
                  {t("contracts.vatReducedBase")}
                </label>
                <input
                  id="reducedBaseEdit"
                  name="reducedBase"
                  defaultValue={Number(contract.vatBaseReduced).toFixed(2)}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="standardBaseEdit">
                  {t("contracts.vatStandardBase")}
                </label>
                <input
                  id="standardBaseEdit"
                  name="standardBase"
                  defaultValue={Number(contract.vatBaseStandard).toFixed(2)}
                  className="input"
                />
                <p className="mt-1 text-xs text-brand-graphite/60">
                  The two amounts must add up to the price before VAT.
                </p>
              </div>
              <button type="submit" className="btn btn-primary w-full">
                {t("contracts.applyToOpen")}
              </button>
              <p className="text-xs text-brand-graphite/60">
                {openLines.length} open installment(s) will be recalculated. Anything already paid keeps the
                figures it was invoiced at.
              </p>
            </form>
          </Card>

          {agent ? (
            <Card title={t("agents.rate")}>
              <form action={setContractCommissionRate.bind(null, id)} className="space-y-3">
                <div>
                  <label className="label" htmlFor="commissionRate">
                    {agent.name}
                  </label>
                  <input
                    id="commissionRate"
                    name="commissionRate"
                    defaultValue={
                      contract.commissionRate === null ? "" : Number(contract.commissionRate).toString()
                    }
                    placeholder={`agent default ${Number(agent.commissionRate)}`}
                    className="input"
                  />
                  <p className="mt-1 text-xs text-brand-graphite/60">
                    Leave it empty to use the agent rate. It is calculated on the price before VAT.
                  </p>
                </div>
                <button type="submit" className="btn btn-primary w-full">
                  {t("common.save")}
                </button>
              </form>
            </Card>
          ) : null}

          <Card title={t("contracts.vatHistory")}>
            {detail.vatHistory.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <ol className="space-y-3 text-xs">
                {detail.vatHistory.map((h) => (
                  <li key={h.id} className="border-l-2 border-brand-line pl-3">
                    <div className="font-semibold text-slate-700">
                      {new Date(h.createdAt).toLocaleString(locale === "el" ? "el-GR" : "en-GB")}
                    </div>
                    <div className="text-brand-graphite/60">{h.changedByEmail}</div>
                    <div className="mt-1">from {h.fromSummary}</div>
                    <div>to {h.toSummary}</div>
                    <div className="mt-1 text-brand-graphite/60">applied to installments {h.appliedToSeqs}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
