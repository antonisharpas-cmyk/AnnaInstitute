import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenses, issuedDocuments, projects } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { expenseStatusTone } from "@/lib/expenses";
import { titleWithExtension } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import DateField from "@/components/DateField";
import ExpenseForm from "../ExpenseForm";
import PaymentMethodField from "./PaymentMethodField";
import {
  deleteExpense,
  deleteExpenseFile,
  deleteExpensePayment,
  recordExpensePayment,
  recordIncomePayment,
  resendCompanyInvoice,
  resendIncomeReceipt,
  updateExpense,
  uploadTheirReceipt,
} from "../actions";
import { invoiceLabels } from "../labels";
import { linesOf, ownCategoryWords, paymentsOf, receiptMissing, whatFor, whatForLines } from "@/lib/partnerInvoices";
import { ourCompanies, ourCompanyName, partyHref, partyOf, partyOptions } from "@/lib/parties";
import { optionsFor } from "@/lib/choices";
import { dayAndTime } from "@/lib/when";

const day = (value: Date | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : "");

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const [row] = await db
    .select({ expense: expenses, project: projects })
    .from(expenses)
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(eq(expenses.id, id))
    .limit(1);
  if (!row) notFound();
  const { expense } = row;
  const out = expense.direction === "OUT";

  const [files, projectList, lines, payments, companies, parties, party, ourName, methods, own] = await Promise.all([
    db.select().from(documents).where(eq(documents.expenseId, id)).orderBy(asc(documents.createdAt)),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    linesOf(id),
    paymentsOf(id),
    ourCompanies(),
    partyOptions(),
    partyOf(expense),
    ourCompanyName(expense.ourCompanyId),
    optionsFor("paymentMethod", t),
    ownCategoryWords(),
  ]);
  const receiptIds = payments.map((one) => one.issuedDocumentId).filter(Boolean) as string[];
  const ourReceipts = receiptIds.length ? await db.select().from(issuedDocuments).where(inArray(issuedDocuments.id, receiptIds)) : [];
  const fileById = new Map(files.map((one) => [one.id, one]));
  const methodWord = new Map(methods.map((one) => [one.value, one.label]));
  const ourPdf = files.find((file) => file.category === "INVOICE");

  const totalCents = toCents(expense.totalAmount);
  const paidCents = toCents(expense.paidAmount);
  const owedCents = Math.max(0, totalCents - paidCents);
  const missing = receiptMissing(expense.direction, expense.status, payments);
  const fromName = out ? ourName : party.name;
  const toName = out ? party.name : ourName;
  const href = partyHref(party.kind, party.id);
  const developments = [...new Set(lines.map((one) => one.project).filter(Boolean))];
  const money = (cents: number) => formatAmount(cents, locale);

  return (
    <>
      <BackLink href="/invoices" label={t("invoices.backToInvoices")} />
      <PageHeader
        title={party.name}
        subtitle={[
          t(`invoices.direction.${out ? "OUT" : "IN"}` as MessageKey),
          `${t("invoices.from")} ${fromName}, ${t("invoices.to").toLowerCase()} ${toName}`,
          expense.reference ? `${t("invoices.number")} ${expense.reference}` : null,
          whatForLines(lines, own) || whatFor(expense, own),
        ]
          .filter(Boolean)
          .join(" . ")}
        action={
          <span data-invoice-status>
            <Pill tone={missing ? "warn" : (expenseStatusTone(expense.status) as "good" | "warn" | "neutral")}>
              {missing ? t("invoices.status.RECEIPT_MISSING") : t(`invoices.status.${expense.status}` as MessageKey)}
            </Pill>
          </span>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("invoices.net")} value={money(toCents(expense.netAmount))} />
        <Stat label={t("invoices.vat")} value={money(toCents(expense.vatAmount))} />
        <Stat label={t("invoices.total")} value={money(totalCents)} />
        <Stat
          label={out ? t("invoices.toReceive") : t("invoices.toPay")}
          value={money(owedCents)}
          hint={`${money(paidCents)} ${(out ? t("invoices.received") : t("invoices.paid")).toLowerCase()}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* The money: every payment, with its receipt, and the next one recorded here. */}
          <Card title={out ? t("invoices.moneyReceived") : t("invoices.paymentsMade")}>
            {payments.length === 0 ? (
              <Empty message={out ? t("invoices.nothingReceived") : t("invoices.nothingPaid")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="data" data-expense-payments>
                  <thead>
                    <tr>
                      <th className="ctr">{t("common.date")}</th>
                      <th className="ctr">{t("contracts.amount")}</th>
                      <th>{t("invoices.method")}</th>
                      <th>{t("invoices.receipt")}</th>
                      <th className="ctr">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...payments].reverse().map((payment) => {
                      const ours = ourReceipts.find((one) => one.id === payment.issuedDocumentId);
                      const theirs = payment.receiptDocumentId ? fileById.get(payment.receiptDocumentId) : null;
                      return (
                        <tr key={payment.id}>
                          <td className="ctr nowrap text-xs">{day(payment.paidOn)}</td>
                          <td className="ctr font-semibold">{money(toCents(payment.amount))}</td>
                          <td className="text-xs">
                            {payment.method ? (methodWord.get(payment.method) ?? payment.method) : ""}
                            {payment.methodOther ? <span>: {payment.methodOther}</span> : null}
                            {payment.reference ? <div className="text-brand-graphite/60">{payment.reference}</div> : null}
                          </td>
                          <td className="text-xs" data-payment-receipt>
                            {out ? (
                              ours ? (
                                <>
                                  {ours.documentId ? (
                                    <a href={`/api/files/${ours.documentId}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-teal-dark hover:underline">
                                      {t("invoices.receipt")} {ours.number}
                                    </a>
                                  ) : (
                                    `${t("invoices.receipt")} ${ours.number}`
                                  )}
                                  <div className={payment.emailedAt ? "text-brand-graphite/60" : "text-[color:var(--color-negative)]"}>
                                    {payment.emailedAt
                                      ? `${t("emails.sent")} ${dayAndTime(payment.emailedAt, locale)}`
                                      : `${t("invoices.notEmailed")}${payment.emailError ? `: ${payment.emailError}` : ""}`}
                                  </div>
                                  <form action={resendIncomeReceipt.bind(null, id, payment.id)} className="mt-1">
                                    <button type="submit" className="btn btn-secondary !px-2 !py-0.5 !text-xs">
                                      {t("invoices.resend")}
                                    </button>
                                  </form>
                                </>
                              ) : (
                                <span className="text-brand-graphite/60">{t("invoices.beforeReceipts")}</span>
                              )
                            ) : theirs ? (
                              <a href={`/api/files/${theirs.id}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-teal-dark hover:underline">
                                {titleWithExtension(theirs)}
                              </a>
                            ) : (
                              <form action={uploadTheirReceipt.bind(null, id, payment.id)} className="space-y-1" data-their-receipt-form>
                                <span className="block font-semibold text-[color:var(--color-negative)]">{t("invoices.receiptMissing")}</span>
                                <input name="receipt" type="file" required accept=".pdf,image/*" className="input !py-1 text-xs" />
                                <button type="submit" className="btn btn-secondary !px-2 !py-0.5 !text-xs">
                                  {t("invoices.uploadTheirReceipt")}
                                </button>
                              </form>
                            )}
                          </td>
                          <td className="ctr">
                            <form action={deleteExpensePayment.bind(null, id, payment.id)}>
                              <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                                {t("common.delete")}
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {owedCents > 0 ? (
              <form
                action={(out ? recordIncomePayment : recordExpensePayment).bind(null, id)}
                className="mt-3 space-y-2 rounded border border-brand-line bg-brand-surface p-3"
                data-record-payment
              >
                <p className="text-sm font-semibold">{out ? t("invoices.recordReceived") : t("invoices.recordPaid")}</p>
                <p className="text-xs text-brand-graphite/60">
                  {out
                    ? party.email
                      ? `${t("invoices.receiptGoesTo")} ${party.email}`
                      : t("invoices.receiptNoEmail")
                    : t("invoices.theirReceiptHint")}
                </p>
                {/* Two to a row, so every box has the room for its label and its value. */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="paidOn">
                      {t("common.date")}
                    </label>
                    <DateField id="paidOn" name="paidOn" defaultValue={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <div>
                    <label className="label" htmlFor="amount">
                      {t("contracts.amount")}
                    </label>
                    <input id="amount" name="amount" inputMode="decimal" required defaultValue={(owedCents / 100).toFixed(2)} className="input" />
                  </div>
                  <PaymentMethodField
                    methods={methods}
                    labels={{
                      method: t("invoices.method"),
                      choose: t("invoices.chooseMethod"),
                      other: t("invoices.methodOther"),
                      otherHint: t("invoices.methodOtherHint"),
                    }}
                  />
                  <div>
                    <label className="label" htmlFor="payReference">
                      {t("invoices.payReference")}
                    </label>
                    <input id="payReference" name="reference" className="input" />
                  </div>
                </div>
                {out ? null : (
                  <div>
                    <label className="label" htmlFor="receipt">
                      {t("invoices.theirReceipt")}
                    </label>
                    <input id="receipt" name="receipt" type="file" accept=".pdf,image/*" className="input !py-1.5 text-xs" />
                  </div>
                )}
                <button type="submit" className="btn btn-primary">
                  {out ? t("invoices.saveAndSendReceipt") : t("common.save")}
                </button>
              </form>
            ) : null}
          </Card>

          <Card title={t("invoices.details")}>
            <ExpenseForm
              action={updateExpense.bind(null, id)}
              expense={expense}
              lines={lines}
              projects={projectList}
              ourCompanies={companies}
              parties={parties}
              cancelHref="/invoices"
              categories={await optionsFor("expenseCategory", t, {
                current: lines[0] ? (lines[0].categoryChoice ?? lines[0].category) : null,
              })}
              labels={invoiceLabels(t)}
            />
          </Card>

          <Card title={t("invoices.files")}>
            {files.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.name")}</th>
                    <th className="ctr">{t("common.date")}</th>
                    <th className="ctr">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...files].reverse().map((file) => (
                    <tr key={file.id}>
                      <td>
                        <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline">
                          {titleWithExtension(file)}
                        </a>
                      </td>
                      <td className="ctr nowrap text-xs">{dayAndTime(file.createdAt, locale)}</td>
                      <td className="ctr">
                        {/* Papers we issued stay: a number in the series is never taken away. */}
                        {out && (file.category === "INVOICE" || file.category === "RECEIPT") ? null : (
                          <form action={deleteExpenseFile.bind(null, file.id, id)}>
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
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t("common.status")}>
            <dl className="mb-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-brand-graphite/60">{t("invoices.from")}</dt>
                <dd className="text-right">{out ? ourName : href ? <Link href={href} className="hover:underline">{party.name}</Link> : party.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-graphite/60">{t("invoices.to")}</dt>
                <dd className="text-right">{out ? href ? <Link href={href} className="hover:underline">{party.name}</Link> : party.name : ourName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-graphite/60">{t("invoices.issued")}</dt>
                <dd>{day(expense.issueDate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-graphite/60">{t("invoices.due")}</dt>
                <dd>{day(expense.dueDate)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-graphite/60">{t("invoices.paidOn")}</dt>
                <dd>{day(expense.paidOn)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-brand-graphite/60">{t("invoices.project")}</dt>
                <dd className="text-right">{developments.length > 0 ? developments.join(", ") : t("invoices.noProject")}</dd>
              </div>
            </dl>

            <table className="data mb-3" data-expense-lines>
              <thead>
                <tr>
                  <th>{t("invoices.category")}</th>
                  <th className="ctr">{t("invoices.total")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((one) => (
                  <tr key={one.id}>
                    <td>
                      {whatFor(one, own)}
                      <div className="text-xs text-brand-graphite/60">
                        {[one.project, one.description, `${formatAmount(toCents(one.netAmount), locale)} + ${Number(one.vatRate ?? 0)}% ${t("invoices.vat")}`]
                          .filter(Boolean)
                          .join(" . ")}
                      </div>
                    </td>
                    <td className="ctr">{money(toCents(one.totalAmount))}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">{t("invoices.total")}</td>
                  <td className="ctr font-semibold">{money(totalCents)}</td>
                </tr>
              </tbody>
            </table>

            {out ? (
              <div className="mb-3 space-y-2">
                {ourPdf ? (
                  <a href={`/api/files/${ourPdf.id}`} target="_blank" rel="noreferrer" className="btn btn-secondary w-full justify-center">
                    {t("invoices.invoicePdf")} {expense.reference ?? ""}
                  </a>
                ) : null}
                <form action={resendCompanyInvoice.bind(null, id)}>
                  <button type="submit" className="btn btn-secondary w-full justify-center">
                    {t("invoices.resend")}
                  </button>
                </form>
                {expense.emailedAt ? (
                  <p className="text-xs text-brand-graphite/60">
                    {t("emails.sent")} {dayAndTime(expense.emailedAt, locale)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          {expense.notes ? (
            <Card title={t("common.notes")}>
              <p className="whitespace-pre-wrap text-sm">{expense.notes}</p>
            </Card>
          ) : null}

          <Card>
            <form action={deleteExpense.bind(null, id)}>
              <button type="submit" className="btn btn-secondary !text-xs">
                {t("invoices.deleteInvoice")}
              </button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
