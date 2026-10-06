import { baseOf, optionsFor } from "@/lib/choices";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contracts, issuedDocuments, payments } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { refundsFor } from "@/lib/refunds";
import { vatCreditToPayBack } from "@/lib/reducedVat";
import { dayAndTime } from "@/lib/when";
import { Card, Empty, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import RefundMoneyFields from "./RefundMoneyFields";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";
import {
  approveReducedVatAction,
  payBackVatCreditAction,
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
  /* How the money went back, in the office's own methods; card refunds are not offered. */
  const methods = (await optionsFor("paymentMethod", t)).filter((one) => baseOf(one.value) !== "CARD");

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
  /* The invoices the approval cancelled, each with the one that replaced it, and
     on a contract approved the older way, the credit note that cancelled it. */
  const invoices = contract.reducedVatApprovedOn
    ? await db
        .select()
        .from(issuedDocuments)
        .where(and(eq(issuedDocuments.contractId, contractId), eq(issuedDocuments.kind, "INVOICE")))
        .orderBy(asc(issuedDocuments.issuedOn), asc(issuedDocuments.createdAt))
    : [];
  const byId = new Map([...invoices, ...notes].map((one) => [one.id, one]));
  /* Newest first, each at the moment it was cancelled, which is when its replacement was issued. */
  const cancelledAt = (one: (typeof invoices)[number]) => {
    const fresh = one.replacedById ? invoices.find((other) => other.id === one.replacedById) : undefined;
    return new Date(fresh?.createdAt ?? one.voidedAt ?? one.createdAt);
  };
  const cancelledInvoices = invoices
    .filter((one) => one.replacedById)
    .sort((a, b) => cancelledAt(b).getTime() - cancelledAt(a).getTime() || b.number.localeCompare(a.number));
  const toPayBack = await vatCreditToPayBack(contractId);

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
              {contract.reducedVatDocumentId ? (
                <p className="mt-2 text-sm">
                  <a
                    href={`/api/files/${contract.reducedVatDocumentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-teal-dark hover:underline"
                    data-vat-approval-paper
                  >
                    {t("credits.approvalPaper")}
                  </a>
                </p>
              ) : null}
              {cancelledInvoices.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="data" data-vat-cancelled>
                    <thead>
                      <tr>
                        <th>{t("credits.cancelledOn")}</th>
                        <th>{t("credits.cancelledInvoice")}</th>
                        <th className="ctr">{t("credits.oldTotal")}</th>
                        <th>{t("credits.replacedBy")}</th>
                        <th className="ctr">{t("credits.newTotal")}</th>
                        <th>{t("issued.files")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cancelledInvoices.map((old) => {
                        const fresh = old.replacedById ? byId.get(old.replacedById) : undefined;
                        const legacyNote = old.creditedById ? byId.get(old.creditedById) : undefined;
                        return (
                          <tr key={old.id} data-cancelled-invoice={old.number}>
                            <td className="nowrap text-xs">{dayAndTime(cancelledAt(old), locale)}</td>
                            <td>
                              <span className="font-semibold">{old.number}</span>{" "}
                              <Pill tone="bad">{t("credits.cancelledPill")}</Pill>
                            </td>
                            <td className="ctr">{money(toCents(old.totalAmount))}</td>
                            <td className="font-semibold">{fresh?.number ?? ""}</td>
                            <td className="ctr">{fresh ? money(toCents(fresh.totalAmount)) : ""}</td>
                            <td className="text-xs">
                              <span className="flex flex-wrap gap-2">
                                {old.stampedDocumentId ? (
                                  <a href={`/api/files/${old.stampedDocumentId}`} target="_blank" rel="noreferrer" className="text-[color:var(--color-negative)] hover:underline">
                                    {t("issued.stampedPdf")}
                                  </a>
                                ) : null}
                                {fresh?.documentId ? (
                                  <a href={`/api/files/${fresh.documentId}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline">
                                    {t("issued.pdf.INVOICE")}
                                  </a>
                                ) : null}
                                {legacyNote?.documentId ? (
                                  <a href={`/api/files/${legacyNote.documentId}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline">
                                    {t("issued.pdf.CREDIT_NOTE")} {legacyNote.number}
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
              {toPayBack > 0 ? (
                <div className="mt-3 rounded border border-[color:var(--color-warning)] bg-brand-surface p-3" data-vat-pay-back>
                  <p className="text-sm">
                    {t("credits.toPayBack")} <span className="font-semibold" data-vat-pay-back-amount>{money(toPayBack)}</span>
                  </p>
                  <p className="mt-1 max-w-prose text-xs text-brand-graphite/70">{t("credits.toPayBackHint")}</p>
                  <div className="mt-2">
                    <Disclosure showLabel={t("credits.payBackButton")} hideLabel={t("common.cancel")}>
                      <form
                        action={payBackVatCreditAction.bind(null, contractId)}
                        className="grid gap-3 rounded border border-brand-line bg-white p-3 sm:grid-cols-2"
                        data-vat-pay-back-form
                      >
                        <div>
                          <label className="label" htmlFor="vatBackOn">{t("credits.paidOn")}</label>
                          <DateField id="vatBackOn" name="paidOn" defaultValue={today} required />
                        </div>
                        <div>
                          <label className="label" htmlFor="vatBackMethod">{t("contracts.method")}</label>
                          <select id="vatBackMethod" name="method" className="select" defaultValue="" required>
                            <option value="">{t("contracts.chooseMethod")}</option>
                            {methods.map((one) => (
                              <option key={one.value} value={one.value}>
                                {one.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label" htmlFor="vatBackNote">{t("common.notes")}</label>
                          <input id="vatBackNote" name="note" className="input" />
                        </div>
                        <div className="sm:col-span-2">
                          <SubmitButton>{t("credits.payBackConfirm").replace("{amount}", money(toPayBack))}</SubmitButton>
                        </div>
                      </form>
                    </Disclosure>
                  </div>
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
                    <label className="label" htmlFor="approvalPaper">
                      {t("credits.approvalUpload")}
                    </label>
                    <input
                      id="approvalPaper"
                      name="approval"
                      type="file"
                      required
                      accept=".pdf,image/*"
                      className="input !py-1.5 text-xs"
                      data-vat-approval-file
                    />
                    <p className="mt-1 text-xs text-brand-graphite/60">{t("credits.approvalUploadHint")}</p>
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
                    <td className="nowrap text-xs">
                      {day(refund.paidOn)} {dayAndTime(refund.createdAt, locale).slice(11)}
                    </td>
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
                    <td className="ctr">{amountCents === 0 ? <Pill tone="neutral">{t("credits.nothingShort")}</Pill> : money(amountCents)}</td>
                    <td className="text-xs">
                      {note?.documentId ? (
                        <a href={`/api/files/${note.documentId}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-teal-dark hover:underline">
                          {note.number}
                        </a>
                      ) : (
                        (note?.number ?? (amountCents === 0 ? <span className="text-brand-graphite/60">{t("credits.noCreditNote")}</span> : ""))
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
            <RefundMoneyFields
              today={today}
              methods={methods}
              labels={{
                purpose: t("credits.purpose"),
                penalty: t("issued.purpose.PENALTY"),
                refund: t("issued.purpose.REFUND"),
                nothing: t("credits.nothingBack"),
                nothingHint: t("credits.nothingBackHint"),
                amount: t("credits.amountWithVat"),
                paidOn: t("credits.paidOn"),
                method: t("contracts.method"),
                note: t("credits.note"),
                noteHint: t("credits.noteHint"),
                cancel: t("credits.cancelReservation"),
                cancelHint: t("credits.cancelReservationHint"),
              }}
            />
            <div className="sm:col-span-2">
              <SubmitButton>{t("credits.recordButton")}</SubmitButton>
            </div>
          </form>
        </Disclosure>
      </Card>
    </>
  );
}
