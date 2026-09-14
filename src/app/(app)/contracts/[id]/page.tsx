import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { amountForInput, formatAmount, formatPercent, toCents } from "@/lib/money";
import { contractStatusTone, getContract } from "@/lib/contracts";
import { STAGE_CHOICES } from "@/lib/vat";
import { documentsByPayment, documentsForContract } from "@/lib/documents";
import { titleWithExtension } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DocumentList from "@/components/DocumentList";
import UploadForm from "@/components/UploadForm";
import DateField from "@/components/DateField";
import {
  addChangeRequest,
  addLine,
  deleteContract,
  deleteContractDocument,
  deletePayment,
  recordPayment,
  removeLine,
  setChangeRequestStatus,
  setDates,
  updateLine,
  uploadContractDocuments,
} from "../actions";
import SubmitButton from "@/components/SubmitButton";

const dateFor = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const detail = await getContract(id);
  if (!detail) notFound();

  const [requests, contractDocuments, paymentFiles] = await Promise.all([
    db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.contractId, id))
      .orderBy(desc(changeRequests.requestedOn)),
    documentsForContract(id),
    documentsByPayment(id),
  ]);

  const { contract, unit, project, client, agent, installments: lines, totals, payments } = detail;

  return (
    <>
      <BackLink
        href="/contracts"
        label={`${t("common.backTo")} ${t("contracts.title").toLowerCase()}`}
      />
      <PageHeader
        title={contract.reference}
        subtitle={[
          client ? `${client.firstName} ${client.lastName}` : null,
          project && unit ? `${project.name} ${unit.code}` : null,
          contract.contractDate
            ? new Date(contract.contractDate).toLocaleDateString(
                locale === "el" ? "el-GR" : "en-GB",
              )
            : null,
          agent ? `${t("contracts.agent").toLowerCase()}: ${agent.name}` : null,
        ]
          .filter(Boolean)
          .join(" . ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={contractStatusTone(contract.status) as "good" | "warn" | "bad" | "teal"}>
              {t(`contracts.status.${contract.status}` as MessageKey)}
            </Pill>
            <Link href={`/contracts/${id}/edit`} className="btn btn-secondary">
              {t("common.edit")}
            </Link>
            <Link
              href={`/contracts/new?from=${id}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              {t("contracts.copy")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={t("contracts.netPrice")} value={formatAmount(totals.netCents, locale)} />
        <Stat
          label={`${t("contracts.vat")} ${formatPercent(Number(contract.vatRate), locale)}`}
          value={formatAmount(totals.scheduleVatCents, locale)}
        />
        <Stat label={t("common.total")} value={formatAmount(totals.scheduleTotalCents, locale)} />
        <Stat label={t("contracts.paid")} value={formatAmount(totals.paidTotalCents, locale)} />
        <Stat label={t("dash.outstanding")} value={formatAmount(totals.outstandingCents, locale)} />
      </div>

      <div className="space-y-4">
        {/* 1. Who and what this contract is for. */}
        <Card title={t("contracts.theSale")}>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="label">{t("contracts.buyer")}</dt>
              <dd className="text-sm">
                {client ? (
                  <Link
                    href={`/clients/${client.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand-teal-dark hover:underline"
                  >
                    {client.firstName} {client.lastName}
                  </Link>
                ) : (
                  <span className="text-brand-graphite/50">{t("common.none")}</span>
                )}
                {client?.phone ? (
                  <div className="text-xs text-brand-graphite/60">{client.phone}</div>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="label">{t("contracts.unit")}</dt>
              <dd className="text-sm">
                {project && unit ? (
                  <Link
                    href={`/projects/${project.id}/units/${unit.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand-teal-dark hover:underline"
                  >
                    {project.name} {unit.code}
                  </Link>
                ) : (
                  <span className="text-brand-graphite/50">{t("common.none")}</span>
                )}
                {unit ? (
                  <div className="text-xs text-brand-graphite/60">
                    {t("units.netPrice")} {formatAmount(toCents(unit.netPrice), locale)}
                  </div>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="label">{t("contracts.agent")}</dt>
              <dd className="text-sm">
                {agent ? (
                  <Link
                    href={`/agents/${agent.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand-teal-dark hover:underline"
                  >
                    {agent.name}
                  </Link>
                ) : (
                  <span className="text-brand-graphite/50">{t("contracts.noAgent")}</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        {/* 2. The schedule, with its own dates. */}
        <Card title={t("contracts.schedule")}>
          <form
            action={setDates.bind(null, id)}
            className="mb-4 flex flex-wrap items-end gap-2 border-b border-brand-line pb-4"
          >
            <div>
              <label className="label" htmlFor="startDate">
                {t("contracts.firstDue")}
              </label>
              <DateField
                id="startDate"
                name="startDate"
                required
                defaultValue={dateFor(lines[0]?.dueDate)}
                className="!py-1 !text-xs"
              />
            </div>
            <div>
              <label className="label" htmlFor="everyMonths">
                {t("contracts.every")}
              </label>
              <select
                id="everyMonths"
                name="everyMonths"
                className="select !w-32 !py-1 !text-xs"
                defaultValue={contract.periodMonths ?? 3}
              >
                <option value={1}>{t("contracts.monthly")}</option>
                <option value={3}>{t("contracts.quarterly")}</option>
                <option value={6}>{t("contracts.halfYear")}</option>
                <option value={12}>{t("contracts.year")}</option>
              </select>
            </div>
            <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
              {t("contracts.applyDates")}
            </button>
            <p className="w-full text-xs text-brand-graphite/60">{t("contracts.datesNote")}</p>
          </form>

          <datalist id="stage-choices">
            {STAGE_CHOICES.map((choice) => (
              <option key={choice.label} value={locale === "el" ? choice.labelEl : choice.label} />
            ))}
          </datalist>

          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th className="ctr">#</th>
                  <th>{t("contracts.stage")}</th>
                  <th className="ctr">{t("contracts.net")}</th>
                  <th className="ctr">{t("contracts.due")}</th>
                  <th className="ctr">{t("contracts.vatCol")}</th>
                  <th className="ctr">{t("common.total")}</th>
                  <th className="ctr">{t("contracts.paid")}</th>
                  <th className="ctr">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const locked = line.paidCents > 0 || line.lockedAt !== null;
                  return (
                    <tr key={line.id}>
                      <td className="ctr">{line.seq}</td>
                      <td>
                        <form
                          id={`line-${line.id}`}
                          action={updateLine.bind(null, line.id, id)}
                          className="contents"
                        >
                          <input
                            name="label"
                            list="stage-choices"
                            defaultValue={
                              locale === "el" ? (line.labelEl ?? line.label) : line.label
                            }
                            className="input !w-56 !py-1 !text-xs"
                            aria-label={t("contracts.stage")}
                          />
                        </form>
                      </td>
                      <td className="ctr">
                        <input
                          form={`line-${line.id}`}
                          name="amount"
                          defaultValue={amountForInput(line.netAmount)}
                          disabled={locked}
                          className="input !w-24 !py-1 !text-xs"
                          aria-label={t("contracts.net")}
                        />
                      </td>
                      <td className="ctr">
                        <DateField
                          form={`line-${line.id}`}
                          name="dueDate"
                          defaultValue={dateFor(line.dueDate)}
                          className="!py-1 !text-xs"
                          aria-label={t("contracts.due")}
                        />
                      </td>
                      <td className="ctr">
                        {formatAmount(line.vatCents, locale)}
                        <div className="text-xs text-brand-graphite/50">
                          {formatPercent(Number(line.vatRateApplied), locale)}
                        </div>
                      </td>
                      <td className="ctr font-semibold">{formatAmount(line.totalCents, locale)}</td>
                      <td className="ctr">
                        {line.paidCents > 0 ? (
                          <Pill tone={line.paidCents >= line.totalCents ? "good" : "warn"}>
                            {formatAmount(line.paidCents, locale)}
                          </Pill>
                        ) : (
                          <span className="text-xs text-brand-graphite/40">no</span>
                        )}
                      </td>
                      <td className="ctr">
                        <div className="flex flex-wrap justify-center gap-1">
                          <button
                            form={`line-${line.id}`}
                            type="submit"
                            className="btn btn-secondary !px-2 !py-1 !text-xs"
                          >
                            {t("common.save")}
                          </button>
                          {locked ? null : (
                            <form action={removeLine.bind(null, line.id, id)}>
                              <button
                                type="submit"
                                className="btn btn-secondary !px-2 !py-1 !text-xs"
                              >
                                {t("common.delete")}
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{t("common.total")}</td>
                  <td className="ctr">{formatAmount(totals.scheduleVatCents, locale)}</td>
                  <td className="ctr font-semibold">
                    {formatAmount(totals.scheduleTotalCents, locale)}
                  </td>
                  <td className="ctr">{formatAmount(totals.paidTotalCents, locale)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3">
            <form action={addLine.bind(null, id)}>
              <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                {t("contracts.addLine")}
              </button>
            </form>
          </div>
          <p className="mt-3 text-xs text-brand-graphite/60">{t("contracts.scheduleNote")}</p>
        </Card>

        {/* 3. Money received. */}
        <Card title={t("contracts.recordPayment")}>
          <Disclosure showLabel={t("contracts.recordPayment")} hideLabel={t("common.cancel")}>
            <form
              action={recordPayment.bind(null, id)}
              className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-3"
            >
              <div>
                <label className="label" htmlFor="installmentId">
                  {t("contracts.stage")}
                </label>
                <select id="installmentId" name="installmentId" className="select">
                  <option value="">not against one installment</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.seq}. {l.label} . {formatAmount(l.totalCents, locale)}
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
                <label className="label" htmlFor="receiptNumber">
                  {t("contracts.receipt")}
                </label>
                <input id="receiptNumber" name="receiptNumber" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="method">
                  {t("contracts.method")}
                </label>
                <input id="method" name="method" className="input" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="paymentFiles">
                  {t("contracts.paymentFiles")}
                </label>
                <input
                  id="paymentFiles"
                  name="files"
                  type="file"
                  multiple
                  className="input !py-1.5 text-xs"
                />
                <p className="mt-1 text-xs text-brand-graphite/60">
                  {t("contracts.paymentFilesNote")}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="fileTitle">
                  {t("contracts.paymentFileTitle")}
                </label>
                <input
                  id="fileTitle"
                  name="fileTitle"
                  placeholder={t("contracts.paymentFileTitlePlaceholder")}
                  className="input"
                />
              </div>
              <div className="flex items-end">
                <SubmitButton>{t("common.save")}</SubmitButton>
              </div>
            </form>
          </Disclosure>

          {payments.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th className="ctr">{t("contracts.amount")}</th>
                    <th>{t("contracts.receipt")}</th>
                    <th>{t("contracts.method")}</th>
                    <th>{t("contracts.paymentFiles")}</th>
                    <th className="ctr">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{dateFor(p.paidOn)}</td>
                      <td className="ctr">{formatAmount(toCents(p.amount), locale)}</td>
                      <td>{p.receiptNumber ?? ""}</td>
                      <td>{p.method ?? ""}</td>
                      <td className="text-xs">
                        {(paymentFiles.get(p.id) ?? []).map((doc) => (
                          <div key={doc.id}>
                            <a
                              href={`/api/files/${doc.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-teal-dark hover:underline"
                            >
                              {titleWithExtension(doc)}
                            </a>
                          </div>
                        ))}
                      </td>
                      <td className="ctr">
                        <form action={deletePayment.bind(null, p.id, id)}>
                          <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                            {t("common.delete")}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty message={t("common.none")} />
          )}
        </Card>

        {/* 4. What the buyer asked to change, with the drawings attached. */}
        <Card title={t("contracts.changeRequests")}>
          {requests.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <table className="data mb-4">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("common.name")}</th>
                  <th className="ctr">{t("contracts.amount")}</th>
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
                    <td className="ctr">
                      {r.costImpact ? formatAmount(toCents(r.costImpact), locale) : ""}
                    </td>
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

          <Disclosure showLabel={t("contracts.addChangeRequest")} hideLabel={t("common.cancel")}>
            <form
              action={addChangeRequest.bind(null, id)}
              className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2"
            >
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
                  {t("contracts.amount")}
                </label>
                <input id="costImpact" name="costImpact" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="changeFiles">
                  {t("common.files")}
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
                <SubmitButton>{t("common.add")}</SubmitButton>
              </div>
            </form>
          </Disclosure>
        </Card>

        {/* 5. Files kept against the contract. */}
        <Card title={t("contracts.documents")}>
          <div className="mb-4 rounded border border-brand-line bg-brand-surface p-3">
            <UploadForm
              action={uploadContractDocuments.bind(null, id)}
              categories={["CONTRACT", "RECEIPT", "FLOOR_PLAN", "IDENTIFICATION", "OTHER"]}
              defaultCategory="CONTRACT"
              submitLabel={t("common.add")}
            />
          </div>
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
        </Card>

        {/* 6. Every change of price or VAT, kept for ever. */}
        {detail.vatHistory.length > 0 ? (
          <Card title={t("contracts.vatHistory")}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("contracts.vat")}</th>
                  <th>{t("contracts.schedule")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.vatHistory.map((h) => (
                  <tr key={h.id}>
                    <td>
                      {new Date(h.createdAt).toLocaleString(locale === "el" ? "el-GR" : "en-GB")}
                    </td>
                    <td>{h.changedByEmail}</td>
                    <td>
                      {h.fromSummary} → {h.toSummary}
                    </td>
                    <td>{h.appliedToSeqs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}

        <form action={deleteContract.bind(null, id)}>
          <button type="submit" className="btn btn-secondary">
            {t("contracts.delete")}
          </button>
        </form>
      </div>
    </>
  );
}
