import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contracts, issuedDocuments, payments } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { refundsFor } from "@/lib/refunds";
import { dayAndTime } from "@/lib/when";
import { Card, Empty, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";
import {
  approveReducedVatAction,
  recordRefundAction,
  sendCreditNote,
  sendVatPapers,
  uploadSignedRefund,
} from "../creditActions";

/**
 * VAT approval, credit notes and refunds on one contract.
 *
 * Two cards under the money. The first is the VAT: at the standard rate until
 * the buyer's reduced rate is approved, then the approval itself and what it
 * produced. The second is money paid back by agreement, a goodwill refund or a
 * penalty for late delivery, each with its credit note and the paper the buyer
 * signs.
 */
export default async function CreditsSection({ contractId }: { contractId: string }) {
  const { locale, t } = await getTranslator();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract) return null;

  const [notes, refunds, creditRow] = await Promise.all([
    db
      .select()
      .from(issuedDocuments)
      .where(and(eq(issuedDocuments.contractId, contractId), eq(issuedDocuments.kind, "CREDIT_NOTE")))
      .orderBy(asc(issuedDocuments.createdAt)),
    refundsFor(contractId),
    db
      .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(eq(payments.contractId, contractId), eq(payments.kind, "CREDIT"), sql`${payments.amount} > 0`)),
  ]);
  const vatNotes = notes.filter((note) => note.purpose === "VAT_CHANGE");
  const invoiceIds = vatNotes.map((note) => note.invoiceId).filter(Boolean) as string[];
  const invoices = invoiceIds.length
    ? await db.select().from(issuedDocuments).where(eq(issuedDocuments.contractId, contractId))
    : [];
  const byId = new Map(invoices.map((one) => [one.id, one]));

  const money = (cents: number) => formatAmount(cents, locale);
  const day = (value: Date | null) =>
    value ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB") : "";
  const netCents = toCents(contract.netPrice);
  const approved = Boolean(contract.reducedVatApprovedOn);
  const reducedNet = contract.reducedVatNet ? toCents(contract.reducedVatNet) : 0;
  const creditCents = toCents(creditRow[0]?.total ?? "0");
  const sale = contract.kind === "SALE";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {sale ? (
        <Card title={t("credits.vatTitle")}>
          {approved ? (
            <>
              <p className="text-sm">
                <Pill tone="good">{t("credits.approved")}</Pill>{" "}
                {day(contract.reducedVatApprovedOn)}:{" "}
                <span className="font-semibold">
                  {money(reducedNet)} {t("credits.at")} {Number(contract.reducedVatRate)}%
                </span>
                {netCents - reducedNet > 0 ? (
                  <>
                    {", "}
                    <span className="font-semibold">
                      {money(netCents - reducedNet)} {t("credits.at")} {Number(contract.standardVatRate)}%
                    </span>
                  </>
                ) : null}
              </p>
              {creditCents > 0 ? (
                <p className="mt-2 text-sm text-brand-graphite/80">
                  {t("credits.creditCarried")} <span className="font-semibold">{money(creditCents)}</span>
                </p>
              ) : null}
              {vatNotes.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{t("credits.recordedOn")}</th>
                        <th>{t("issued.type.CREDIT_NOTE")}</th>
                        <th>{t("credits.cancels")}</th>
                        <th>{t("credits.replacedBy")}</th>
                        <th className="ctr">{t("issued.total")}</th>
                        <th>{t("issued.files")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatNotes.map((note) => {
                        const old = note.invoiceId ? byId.get(note.invoiceId) : undefined;
                        const fresh = old?.replacedById ? byId.get(old.replacedById) : undefined;
                        return (
                          <tr key={note.id}>
                            <td className="nowrap text-xs">{dayAndTime(note.createdAt, locale)}</td>
                            <td className="font-semibold">{note.number}</td>
                            <td>{old?.number ?? ""}</td>
                            <td>{fresh?.number ?? ""}</td>
                            <td className="ctr">−{money(toCents(note.totalAmount))}</td>
                            <td className="text-xs">
                              <span className="flex flex-wrap gap-2">
                                {note.documentId ? (
                                  <a href={`/api/files/${note.documentId}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline">
                                    {t("issued.pdf.CREDIT_NOTE")}
                                  </a>
                                ) : null}
                                {old?.stampedDocumentId ? (
                                  <a href={`/api/files/${old.stampedDocumentId}`} target="_blank" rel="noreferrer" className="text-[color:var(--color-negative)] hover:underline">
                                    {t("issued.stampedPdf")}
                                  </a>
                                ) : null}
                                {fresh?.documentId ? (
                                  <a href={`/api/files/${fresh.documentId}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline">
                                    {t("issued.pdf.INVOICE")}
                                  </a>
                                ) : null}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <form action={sendVatPapers.bind(null, contractId)} className="mt-3">
                <SubmitButton className="btn btn-secondary">{t("credits.sendVatPapers")}</SubmitButton>
              </form>
            </>
          ) : (
            <>
              <p className="mb-3 max-w-prose text-sm text-brand-graphite/80">
                {t("credits.standardUntil").replace("{rate}", String(Number(contract.vatRate)))}
              </p>
              <Disclosure showLabel={t("credits.approve")} hideLabel={t("common.cancel")}>
                <form
                  action={approveReducedVatAction.bind(null, contractId)}
                  className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2"
                >
                  <p className="max-w-prose text-xs text-brand-graphite/70 sm:col-span-2">{t("credits.approveWhat")}</p>
                  <div>
                    <label className="label" htmlFor="approvedOn">
                      {t("credits.approvedOn")}
                    </label>
                    <DateField id="approvedOn" name="approvedOn" defaultValue={today} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="reducedNet">
                      {t("credits.reducedNet")}
                    </label>
                    <input
                      id="reducedNet"
                      name="reducedNet"
                      inputMode="decimal"
                      defaultValue={String(Math.min(netCents, 35000000) / 100)}
                      className="input"
                    />
                    <p className="mt-1 text-xs text-brand-graphite/60">
                      {t("credits.reducedNetHint").replace("{price}", money(netCents))}
                    </p>
                  </div>
                  <div>
                    <label className="label" htmlFor="reducedRate">
                      {t("credits.reducedRate")}
                    </label>
                    <input id="reducedRate" name="reducedRate" inputMode="decimal" defaultValue="5" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="standardRate">
                      {t("credits.standardRate")}
                    </label>
                    <input
                      id="standardRate"
                      name="standardRate"
                      inputMode="decimal"
                      defaultValue={String(Number(contract.vatRate) || 19)}
                      className="input"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <SubmitButton>{t("credits.approveButton")}</SubmitButton>
                  </div>
                </form>
              </Disclosure>
            </>
          )}
        </Card>
      ) : null}

      <Card title={t("credits.refundsTitle")}>
        <p className="mb-3 max-w-prose text-xs text-brand-graphite/70">{t("credits.refundsHint")}</p>
        {refunds.length === 0 ? (
          <Empty message={t("common.none")} />
        ) : (
          <div className="mb-3 overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("credits.recordedOn")}</th>
                  <th>{t("credits.purpose")}</th>
                  <th className="ctr">{t("contracts.amount")}</th>
                  <th>{t("issued.type.CREDIT_NOTE")}</th>
                  <th>{t("credits.acknowledgement")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map(({ refund, note, amountCents }) => (
                  <tr key={refund.id}>
                    <td className="nowrap text-xs">{day(refund.paidOn)}</td>
                    <td className="nowrap text-xs">{dayAndTime(refund.createdAt, locale)}</td>
                    <td className="text-xs">
                      {t(`issued.purpose.${refund.purpose}` as "issued.purpose.REFUND")}
                      {refund.cancelledContract ? (
                        <div>
                          <Pill tone="warn">{t("credits.reservationCancelled")}</Pill>
                        </div>
                      ) : null}
                      {refund.note ? <div className="text-brand-graphite/60">{refund.note}</div> : null}
                    </td>
                    <td className="ctr">{money(amountCents)}</td>
                    <td className="text-xs">
                      {note?.documentId ? (
                        <a href={`/api/files/${note.documentId}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-teal-dark hover:underline">
                          {note.number}
                        </a>
                      ) : (
                        (note?.number ?? "")
                      )}
                    </td>
                    <td className="text-xs">
                      <span className="flex flex-col gap-1">
                        {refund.acknowledgementDocumentId ? (
                          <a href={`/api/files/${refund.acknowledgementDocumentId}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline">
                            {t("credits.toSign")}
                          </a>
                        ) : null}
                        {refund.signedDocumentId ? (
                          <a href={`/api/files/${refund.signedDocumentId}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline">
                            {t("credits.signedCopy")}
                          </a>
                        ) : (
                          <form action={uploadSignedRefund.bind(null, refund.id, contractId)} className="flex flex-wrap items-center gap-1">
                            <input type="file" name="files" accept="application/pdf,image/*" className="max-w-44 text-xs" />
                            <SubmitButton className="btn btn-secondary !px-2 !py-0.5 !text-xs">{t("credits.uploadSigned")}</SubmitButton>
                          </form>
                        )}
                      </span>
                    </td>
                    <td>
                      {note ? (
                        <form action={sendCreditNote.bind(null, note.id)}>
                          <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("credits.email")}</SubmitButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Disclosure showLabel={t("credits.record")} hideLabel={t("common.cancel")}>
          <form
            action={recordRefundAction.bind(null, contractId)}
            className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2"
          >
            <div>
              <label className="label" htmlFor="refundPurpose">
                {t("credits.purpose")}
              </label>
              <select id="refundPurpose" name="purpose" className="select" defaultValue="PENALTY">
                <option value="PENALTY">{t("issued.purpose.PENALTY")}</option>
                <option value="REFUND">{t("issued.purpose.REFUND")}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="refundAmount">
                {t("credits.amountWithVat")}
              </label>
              <input id="refundAmount" name="amount" inputMode="decimal" required className="input" placeholder="3000" />
            </div>
            <div>
              <label className="label" htmlFor="refundPaidOn">
                {t("credits.paidOn")}
              </label>
              <DateField id="refundPaidOn" name="paidOn" defaultValue={today} required />
            </div>
            <div>
              <label className="label" htmlFor="refundMethod">
                {t("contracts.method")}
              </label>
              <select id="refundMethod" name="method" className="select" defaultValue="BANK">
                {["BANK", "CHEQUE", "CASH", "OTHER"].map((one) => (
                  <option key={one} value={one}>
                    {t(`contracts.method.${one}` as "contracts.method.BANK")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="refundReference">
                {t("contracts.paymentReference")}
              </label>
              <input id="refundReference" name="reference" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="refundNote">
                {t("credits.note")}
              </label>
              <input id="refundNote" name="note" className="input" placeholder={t("credits.noteHint")} />
            </div>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="cancelContract" className="mt-0.5" />
              <span>
                {t("credits.cancelReservation")}
                <span className="block text-xs text-brand-graphite/60">{t("credits.cancelReservationHint")}</span>
              </span>
            </label>
            <div className="sm:col-span-2">
              <SubmitButton>{t("credits.recordButton")}</SubmitButton>
            </div>
          </form>
        </Disclosure>
      </Card>
    </>
  );
}
