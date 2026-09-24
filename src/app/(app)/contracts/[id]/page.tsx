import Link from "next/link";
import { notFound } from "next/navigation";
import CreditsSection from "./CreditsSection";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { changeRequests } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { amountForInput, formatAmount, formatPercent, toCents } from "@/lib/money";
import { contractStatusTone, getContract, landExchangeUnits } from "@/lib/contracts";
import { nextReceiptNumber } from "@/lib/receipts";
import { STAGE_CHOICES } from "@/lib/vat";
import { documentsByPayment, documentsForContract } from "@/lib/documents";
import { titleWithExtension } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DocumentList from "@/components/DocumentList";
import DocumentUpload from "@/components/DocumentUpload";
import DeleteRecord from "@/components/DeleteRecord";
import { ChangeRequestForm, PaymentForm } from "@/components/MoneyForms";
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

const dateFor = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const detail = await getContract(id);
  if (!detail) notFound();

  /**
   * How a payment arrived, in words.
   *
   * New payments carry one of the five codes. Older ones carry whatever
   * somebody typed, and that is printed as it stands rather than hidden, since
   * a receipt that says "bank, Hellenic" is still the truth about that payment.
   */
  const howPaid = (value: string | null) => {
    if (!value) return "";
    if (value === "CREDIT") return t("contracts.method.CREDIT");
    const known = ["CASH", "BANK", "CHEQUE", "CARD", "OTHER"];
    return known.includes(value) ? t(`contracts.method.${value}` as MessageKey) : value;
  };

  const theirApartments =
    detail.contract.kind === "LAND_EXCHANGE" ? await landExchangeUnits(id) : [];

  const [requests, contractDocuments, paymentFiles, nextReceipt] = await Promise.all([
    db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.contractId, id))
      .orderBy(desc(changeRequests.requestedOn)),
    documentsForContract(id),
    documentsByPayment(id),
    /* The number the next receipt will carry, so the form opens with it in. */
    nextReceiptNumber(),
  ]);

  const { contract, unit, project, client, agent, installments: lines, totals, payments } = detail;

  /*
    Paid off, said out loud.

    The office filled a schedule in, receipted every line of it, and the only
    sign of that was an outstanding figure of nought, which reads the same as a
    contract with no schedule at all. So when there is something owed and it has
    all come in, the contract says so in words, in the header and over the
    schedule, and every list that shows the money says it too.
  */
  const paidInFull = totals.scheduleTotalCents > 0 && totals.outstandingCents <= 0;

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
            {contract.kind === "LAND_EXCHANGE" ? (
              <Pill tone="teal">{t("contracts.kind.LAND_EXCHANGE")}</Pill>
            ) : null}
            {paidInFull ? <Pill tone="good">{t("contracts.paidInFull")}</Pill> : null}
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
        <Stat
          label={
            contract.kind === "LAND_EXCHANGE"
              ? t("contracts.agreementValue")
              : t("contracts.netPrice")
          }
          value={formatAmount(totals.netCents, locale)}
        />
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
        <Card
          title={
            contract.kind === "LAND_EXCHANGE" ? t("contracts.theAgreement") : t("contracts.theSale")
          }
        >
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="label">
                {contract.kind === "LAND_EXCHANGE"
                  ? t("contracts.landowner")
                  : t("contracts.buyer")}
              </dt>
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
            {contract.kind === "LAND_EXCHANGE" ? (
              <div>
                <dt className="label">{t("contracts.thePlot")}</dt>
                <dd className="text-sm">
                  <span className="font-semibold">
                    {contract.plotDescription ?? t("common.none")}
                  </span>
                  <div className="text-xs text-brand-graphite/60">
                    {[
                      contract.plotReference,
                      contract.plotArea ? `${Number(contract.plotArea)} m2` : null,
                    ]
                      .filter(Boolean)
                      .join(" . ")}
                  </div>
                </dd>
              </div>
            ) : null}

            <div className={contract.kind === "LAND_EXCHANGE" ? "hidden" : ""}>
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
            <div className={contract.kind === "LAND_EXCHANGE" ? "hidden" : ""}>
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

            <div>
              <dt className="label">{t("contracts.kind")}</dt>
              <dd className="text-sm font-semibold">
                {t(`contracts.kind.${contract.kind}` as MessageKey)}
              </dd>
            </div>

            {contract.kind === "LAND_EXCHANGE" && contract.contractValue ? (
              <div>
                {/* What the deed states, when that is its own figure. */}
                <dt className="label">{t("contracts.contractValue")}</dt>
                <dd className="text-sm font-semibold">
                  {formatAmount(toCents(contract.contractValue), locale)}
                </dd>
              </div>
            ) : null}

            {contract.cashAmount ? (
              <div>
                <dt className="label">{t("contracts.cash")}</dt>
                <dd className="text-sm font-semibold">
                  {formatAmount(toCents(contract.cashAmount), locale)}
                </dd>
              </div>
            ) : null}

            {contract.cashAmount ? (
              <div>
                {/*
                  What the sale is really worth, said once and plainly. The
                  price on the contract and the cash beside it are two halves of
                  one figure, and that figure is what an agent's commission is
                  worked out on, so leaving the office to add them up in their
                  head is how a commission comes out wrong.
                */}
                <dt className="label">
                  {contract.kind === "LAND_EXCHANGE"
                    ? t("contracts.togetherWithCash")
                    : t("commissions.fullValue")}
                </dt>
                <dd className="text-sm font-semibold">
                  {formatAmount(toCents(contract.netPrice) + toCents(contract.cashAmount), locale)}
                </dd>
              </div>
            ) : null}

            {contract.notes ? (
              <div className="sm:col-span-3">
                {/*
                  The note is a term of the agreement, so it is read here rather
                  than only on the form that wrote it. Twenty thousand in cash,
                  ten held back until delivery: the office needs to see that
                  without opening the edit page.
                */}
                <dt className="label">
                  {contract.kind === "LAND_EXCHANGE"
                    ? t("contracts.extraAgreement")
                    : t("common.notes")}
                </dt>
                <dd className="text-sm whitespace-pre-line">{contract.notes}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        {contract.kind === "LAND_EXCHANGE" ? (
          <Card title={t("contracts.theirApartments")}>
            {theirApartments.length === 0 ? (
              <Empty message={t("contracts.noApartmentsYet")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t("contracts.unit")}</th>
                      <th className="ctr">{t("units.floor")}</th>
                      <th className="ctr">{t("units.bedrooms")}</th>
                      <th className="ctr">{t("units.covered")}</th>
                      <th className="ctr">{t("units.netPrice")}</th>
                      <th className="ctr">{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {theirApartments.map((row) => (
                      <tr key={row.unit.id}>
                        <td>
                          <Link
                            href={`/projects/${row.project.id}/units/${row.unit.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-brand-teal-dark hover:underline"
                          >
                            {row.project.name} {row.unit.code}
                          </Link>
                        </td>
                        <td className="ctr">{row.unit.floor ?? ""}</td>
                        <td className="ctr">{row.unit.bedrooms ?? ""}</td>
                        <td className="ctr">
                          {row.unit.coveredArea ? `${Number(row.unit.coveredArea)} m2` : ""}
                        </td>
                        <td className="ctr">{formatAmount(toCents(row.unit.netPrice), locale)}</td>
                        <td className="ctr">
                          <Pill
                            tone={
                              row.unit.status === "AVAILABLE"
                                ? "good"
                                : row.unit.status === "RESERVED"
                                  ? "warn"
                                  : "neutral"
                            }
                          >
                            {t(`units.status.${row.unit.status}` as MessageKey)}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-brand-graphite/60">
              {t("contracts.theirApartmentsNote")}
            </p>
          </Card>
        ) : null}

        {/* 2. The schedule, with its own dates. */}
        {/* A land exchange with nothing to collect has no schedule to show,
            and an empty one full of noughts only invites somebody to fill it
            in. It comes back the moment a line is added. */}
        <Card
          title={t("contracts.schedule")}
          className={contract.kind === "LAND_EXCHANGE" && lines.length === 0 ? "hidden" : ""}
        >
          {paidInFull ? (
            <p className="mb-4 rounded border border-[color:var(--color-positive)] bg-brand-surface px-3 py-2 text-sm">
              <span className="font-semibold">{t("contracts.paidInFull")}</span>{" "}
              <span className="text-brand-graphite/70">{t("contracts.paidInFullNote")}</span>
            </p>
          ) : null}

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
            <PaymentForm
              action={recordPayment.bind(null, id)}
              nextReceipt={nextReceipt}
              lines={lines.map((l) => ({
                id: l.id,
                seq: l.seq,
                label: l.label,
                amount: formatAmount(l.totalCents, locale),
                owing: String(Math.max(0, l.totalCents - l.paidCents) / 100),
              }))}
              labels={{
                stage: t("contracts.stage"),
                notAgainstOne: t("contracts.notAgainstOne"),
                amount: t("contracts.amount"),
                date: t("common.date"),
                receipt: t("contracts.receipt"),
                receiptNote: t("contracts.receiptNote"),
                method: t("contracts.method"),
                methods: {
                  CASH: t("contracts.method.CASH"),
                  BANK: t("contracts.method.BANK"),
                  CHEQUE: t("contracts.method.CHEQUE"),
                  CARD: t("contracts.method.CARD"),
                  OTHER: t("contracts.method.OTHER"),
                },
                chooseMethod: t("contracts.chooseMethod"),
                reference: t("contracts.paymentReference"),
                referenceHint: t("contracts.paymentReferenceHint"),
                files: t("contracts.paymentFiles"),
                filesNote: t("contracts.paymentFilesNote"),
                fileTitle: t("contracts.paymentFileTitle"),
                fileTitlePlaceholder: t("contracts.paymentFileTitlePlaceholder"),
                save: t("common.save"),
              }}
            />
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
                      <td>{howPaid(p.method)}</td>
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
                        {/* A credit moved by the reduced VAT is not money, and
                            comes in pairs: it is not deleted on its own. */}
                        {p.kind === "CREDIT" ? (
                          <span className="text-xs text-brand-graphite/60">{p.notes ?? ""}</span>
                        ) : (
                          <form action={deletePayment.bind(null, p.id, id)}>
                            <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                              {t("common.delete")}
                            </button>
                          </form>
                        )}
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

        {/* 3b. The VAT approval, credit notes and money paid back. */}
        <CreditsSection contractId={id} />

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
                          {(
                            ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "COMPLETED"] as const
                          ).map((one) => (
                            <option key={one} value={one}>
                              {t(`contracts.changeStatus.${one}` as MessageKey)}
                            </option>
                          ))}
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
            <ChangeRequestForm
              action={addChangeRequest.bind(null, id)}
              labels={{
                name: t("common.name"),
                notes: t("common.notes"),
                amount: t("contracts.amount"),
                files: t("common.files"),
                add: t("common.add"),
              }}
            />
          </Disclosure>
        </Card>

        {/* 5. Files kept against the contract. */}
        <Card title={t("contracts.documents")}>
          <div className="mb-4 rounded border border-brand-line bg-brand-surface p-3">
            {/* The same block as the client profile, so the questions never differ. */}
            <DocumentUpload
              action={uploadContractDocuments.bind(null, id)}
              idNumber={client?.idNumber ?? ""}
              apartments={[]}
              fixed={
                unit && project ? { unitId: unit.id, label: `${project.name} ${unit.code}` } : null
              }
              labels={{
                category: t("clients.docType"),
                selectOne: t("clients.docSelectOne"),
                pickFirst: t("clients.docPickFirst"),
                number: t("clients.idNumber"),
                title: t("common.title"),
                files: t("common.files"),
                add: t("common.add"),
                apartment: t("clients.docsApartment"),
                choose: t("clients.chooseApartmentDoc"),
                anyApartment: t("clients.anyApartment"),
                search: t("clients.searchPlaceholder"),
              }}
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

        <DeleteRecord
          action={deleteContract.bind(null, id)}
          label={t("remove.contract")}
          what={t("remove.contractWhat")}
          confirm={t("remove.confirm")}
        />
      </div>
    </>
  );
}
