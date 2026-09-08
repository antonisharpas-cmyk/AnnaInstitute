import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, changeRequests, clients } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { amountForInput, formatAmount, formatPercent, toCents } from "@/lib/money";
import { contractStatusTone, getContract, unitsWithoutContract } from "@/lib/contracts";
import { documentsForContract } from "@/lib/documents";
import { titleWithExtension } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DocumentList from "@/components/DocumentList";
import UploadForm from "@/components/UploadForm";
import {
  addChangeRequest,
  addLine,
  assignApartment,
  deleteContract,
  deleteContractDocument,
  deletePayment,
  recordPayment,
  removeAssignment,
  removeLine,
  resetToPlan,
  setChangeRequestStatus,
  setDates,
  updateAssignment,
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

  const [requests, contractDocuments, free, clientList, agentList] = await Promise.all([
    db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.contractId, id))
      .orderBy(desc(changeRequests.requestedOn)),
    documentsForContract(id),
    unitsWithoutContract(),
    db.select().from(clients).orderBy(asc(clients.lastName)),
    db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.name)),
  ]);

  const { contract, assignments, plan, totals } = detail;

  return (
    <>
      <BackLink
        href="/contracts"
        label={`${t("common.backTo")} ${t("contracts.title").toLowerCase()}`}
      />
      <PageHeader
        title={contract.reference}
        subtitle={[
          contract.contractDate
            ? new Date(contract.contractDate).toLocaleDateString(
                locale === "el" ? "el-GR" : "en-GB",
              )
            : null,
          contract.scheduleType === "PERIODIC"
            ? `${plan.length} ${
                contract.periodMonths === 3
                  ? t("contracts.quarterly").toLowerCase()
                  : t("contracts.monthly").toLowerCase()
              }`
            : t("contracts.standardPlan"),
          contract.notes,
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

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t("contracts.netPrice")} value={formatAmount(totals.netCents, locale)} />
        <Stat
          label={`${t("contracts.vat")} ${formatPercent(Number(contract.vatRate), locale)}`}
          value={formatAmount(totals.planVatCents, locale)}
        />
        <Stat
          label={t("contracts.perApartment")}
          value={formatAmount(totals.planTotalCents, locale)}
        />
        <Stat label={t("contracts.apartmentCount")} value={String(totals.apartments)} />
        <Stat label={t("contracts.paid")} value={formatAmount(totals.paidTotalCents, locale)} />
        <Stat label={t("dash.outstanding")} value={formatAmount(totals.outstandingCents, locale)} />
      </div>

      <div className="space-y-4">
        {/* 1. The plan: the shape of the contract, with no dates on it. The dates
               belong to each apartment, since two buyers sign in different months. */}
        <Card title={t("contracts.plan")}>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th className="ctr">#</th>
                  <th>{t("contracts.stage")}</th>
                  <th className="ctr">{t("contracts.percent")}</th>
                  <th className="ctr">{t("contracts.net")}</th>
                  <th className="ctr">{t("contracts.vatCol")}</th>
                  <th className="ctr">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((line) => (
                  <tr key={line.id}>
                    <td className="ctr">{line.seq}</td>
                    <td>{line.label}</td>
                    <td className="ctr">{formatPercent(Number(line.percentage), locale)}</td>
                    <td className="ctr">{formatAmount(line.netCents, locale)}</td>
                    <td className="ctr">{formatAmount(line.vatCents, locale)}</td>
                    <td className="ctr font-semibold">{formatAmount(line.totalCents, locale)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t("common.total")}</td>
                  <td className="ctr">{formatAmount(totals.planNetCents, locale)}</td>
                  <td className="ctr">{formatAmount(totals.planVatCents, locale)}</td>
                  <td className="ctr font-semibold">
                    {formatAmount(totals.planTotalCents, locale)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-xs text-brand-graphite/60">{t("contracts.planNote")}</p>
        </Card>

        {/* 2. Putting the contract on an apartment, with that buyer's own dates. */}
        <Card title={t("contracts.apartments")}>
          <Disclosure showLabel={t("contracts.addApartmentHere")} hideLabel={t("common.cancel")}>
            <form
              action={assignApartment.bind(null, id)}
              className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-4"
            >
              <div>
                <label className="label" htmlFor="unitId">
                  {t("clients.chooseApartment")}
                </label>
                <select id="unitId" name="unitId" required className="select">
                  <option value="">choose</option>
                  {free.map((u) => (
                    <option key={u.unit.id} value={u.unit.id}>
                      {u.project.name} {u.unit.code}
                      {u.holder ? ` . ${u.holder.firstName} ${u.holder.lastName}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="agentId">
                  {t("contracts.agent")}
                </label>
                <select id="agentId" name="agentId" className="select">
                  <option value="">none</option>
                  {agentList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({Number(a.commissionRate)}%)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="startDate">
                  {t("contracts.firstDue")}
                </label>
                <input id="startDate" name="startDate" type="date" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="everyMonths">
                  {t("contracts.every")}
                </label>
                <select
                  id="everyMonths"
                  name="everyMonths"
                  className="select"
                  defaultValue={contract.periodMonths ?? 3}
                >
                  <option value={1}>{t("contracts.monthly")}</option>
                  <option value={3}>{t("contracts.quarterly")}</option>
                  <option value={6}>{t("contracts.halfYear")}</option>
                  <option value={12}>{t("contracts.year")}</option>
                </select>
              </div>
              <div className="flex items-end sm:col-span-4">
                <button type="submit" className="btn btn-primary">
                  {t("common.add")}
                </button>
              </div>
              <p className="text-xs text-brand-graphite/60 sm:col-span-4">
                {t("contracts.assignNote")}
              </p>
            </form>
          </Disclosure>

          {assignments.length === 0 ? (
            <p className="py-2 text-sm text-brand-graphite/60">{t("contracts.noApartments")}</p>
          ) : null}
        </Card>

        {/* 3. One block per apartment: its own schedule, its own dates, its own money. */}
        {assignments.map((a) => (
          <div key={a.assignment.id} id={`apartment-${a.assignment.id}`}>
            <Card
              title={`${a.project.name} ${a.unit.code}`}
              action={
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-brand-graphite/60">
                    {formatAmount(a.paidCents, locale)} {t("contracts.paid").toLowerCase()} .{" "}
                    {formatAmount(a.outstandingCents, locale)} {t("dash.outstanding").toLowerCase()}
                  </span>
                  <Link
                    href={`/projects/${a.project.id}/units/${a.unit.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary !px-3 !py-1 !text-xs"
                  >
                    {t("units.title")}
                  </Link>
                  {a.open ? (
                    <form action={removeAssignment.bind(null, a.assignment.id, id)}>
                      <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                        {t("common.delete")}
                      </button>
                    </form>
                  ) : (
                    <span className="text-brand-graphite/60">{t("clients.paymentsRecorded")}</span>
                  )}
                </div>
              }
            >
              {/* Who it is sold to, and through whom. */}
              <form
                action={updateAssignment.bind(null, a.assignment.id, id)}
                className="mb-4 flex flex-wrap items-end gap-2 border-b border-brand-line pb-4"
              >
                <div>
                  <label className="label" htmlFor={`client-${a.assignment.id}`}>
                    {t("contracts.buyer")}
                  </label>
                  <select
                    id={`client-${a.assignment.id}`}
                    name="clientId"
                    defaultValue={a.assignment.clientId ?? ""}
                    className="select !w-52 !py-1 !text-xs"
                  >
                    <option value="">none</option>
                    {clientList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.lastName} {c.firstName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`agent-${a.assignment.id}`}>
                    {t("contracts.agent")}
                  </label>
                  <select
                    id={`agent-${a.assignment.id}`}
                    name="agentId"
                    defaultValue={a.assignment.agentId ?? ""}
                    className="select !w-44 !py-1 !text-xs"
                  >
                    <option value="">none</option>
                    {agentList.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                  {t("common.save")}
                </button>
              </form>

              {/* Dating the whole schedule from the month this buyer signed. */}
              <form
                action={setDates.bind(null, a.assignment.id, id)}
                className="mb-4 flex flex-wrap items-end gap-2"
              >
                <div>
                  <label className="label" htmlFor={`start-${a.assignment.id}`}>
                    {t("contracts.firstDue")}
                  </label>
                  <input
                    id={`start-${a.assignment.id}`}
                    name="startDate"
                    type="date"
                    required
                    defaultValue={dateFor(a.lines[0]?.dueDate)}
                    className="input !py-1 !text-xs"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`every-${a.assignment.id}`}>
                    {t("contracts.every")}
                  </label>
                  <select
                    id={`every-${a.assignment.id}`}
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
              </form>

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
                    {a.lines.map((line) => {
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
                                defaultValue={line.label}
                                className="input !w-44 !py-1 !text-xs"
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
                            <input
                              form={`line-${line.id}`}
                              name="dueDate"
                              type="date"
                              defaultValue={dateFor(line.dueDate)}
                              className="input !py-1 !text-xs"
                              aria-label={t("contracts.due")}
                            />
                          </td>
                          <td className="ctr">
                            {formatAmount(line.vatCents, locale)}
                            <div className="text-xs text-brand-graphite/50">
                              {formatPercent(Number(line.vatRateApplied), locale)}
                            </div>
                          </td>
                          <td className="ctr font-semibold">
                            {formatAmount(line.totalCents, locale)}
                          </td>
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
                      <td className="ctr">
                        {formatAmount(
                          a.lines.reduce((sum, l) => sum + l.vatCents, 0),
                          locale,
                        )}
                      </td>
                      <td className="ctr font-semibold">
                        {formatAmount(a.scheduledCents, locale)}
                      </td>
                      <td className="ctr">{formatAmount(a.paidCents, locale)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={addLine.bind(null, a.assignment.id, id)}>
                  <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                    {t("contracts.addLine")}
                  </button>
                </form>
                {a.open ? (
                  <Disclosure
                    showLabel={t("contracts.resetToPlan")}
                    hideLabel={t("common.cancel")}
                    tone="secondary"
                  >
                    <form
                      action={resetToPlan.bind(null, a.assignment.id, id)}
                      className="flex flex-wrap items-end gap-2 rounded border border-brand-line bg-brand-surface p-3"
                    >
                      <div>
                        <label className="label" htmlFor={`reset-${a.assignment.id}`}>
                          {t("contracts.firstDue")}
                        </label>
                        <input
                          id={`reset-${a.assignment.id}`}
                          name="startDate"
                          type="date"
                          className="input !py-1 !text-xs"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor={`resetEvery-${a.assignment.id}`}>
                          {t("contracts.every")}
                        </label>
                        <select
                          name="everyMonths"
                          id={`resetEvery-${a.assignment.id}`}
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
                        {t("contracts.resetToPlan")}
                      </button>
                    </form>
                  </Disclosure>
                ) : null}
              </div>

              {/* Recording money for this apartment. */}
              <div className="mt-4 border-t border-brand-line pt-4">
                <Disclosure showLabel={t("contracts.recordPayment")} hideLabel={t("common.cancel")}>
                  <form
                    action={recordPayment.bind(null, id)}
                    className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-3"
                  >
                    <input type="hidden" name="assignmentId" value={a.assignment.id} />
                    <div>
                      <label className="label" htmlFor={`inst-${a.assignment.id}`}>
                        {t("contracts.stage")}
                      </label>
                      <select
                        id={`inst-${a.assignment.id}`}
                        name="installmentId"
                        className="select"
                      >
                        <option value="">not against one installment</option>
                        {a.lines.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.seq}. {l.label} . {formatAmount(l.totalCents, locale)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor={`amount-${a.assignment.id}`}>
                        {t("contracts.amount")}
                      </label>
                      <input
                        id={`amount-${a.assignment.id}`}
                        name="amount"
                        required
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`paidOn-${a.assignment.id}`}>
                        {t("common.date")}
                      </label>
                      <input
                        id={`paidOn-${a.assignment.id}`}
                        name="paidOn"
                        type="date"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`receipt-${a.assignment.id}`}>
                        {t("contracts.receipt")}
                      </label>
                      <input
                        id={`receipt-${a.assignment.id}`}
                        name="receiptNumber"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`method-${a.assignment.id}`}>
                        {t("contracts.method")}
                      </label>
                      <input id={`method-${a.assignment.id}`} name="method" className="input" />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" className="btn btn-primary">
                        {t("common.save")}
                      </button>
                    </div>
                  </form>
                </Disclosure>

                {a.payments.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>{t("common.date")}</th>
                          <th className="ctr">{t("contracts.amount")}</th>
                          <th>{t("contracts.receipt")}</th>
                          <th>{t("contracts.method")}</th>
                          <th className="ctr">{t("common.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.payments.map((p) => (
                          <tr key={p.id}>
                            <td>{dateFor(p.paidOn)}</td>
                            <td className="ctr">{formatAmount(toCents(p.amount), locale)}</td>
                            <td>{p.receiptNumber ?? ""}</td>
                            <td>{p.method ?? ""}</td>
                            <td className="ctr">
                              <form action={deletePayment.bind(null, p.id, id)}>
                                <button
                                  type="submit"
                                  className="btn btn-secondary !px-2 !py-1 !text-xs"
                                >
                                  {t("common.delete")}
                                </button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        ))}

        {/* 4. What the buyers asked to change, with the drawings attached. */}
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
                <button type="submit" className="btn btn-primary">
                  {t("common.add")}
                </button>
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
