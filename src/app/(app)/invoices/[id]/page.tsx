import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenses, projects, subowners } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { EXPENSE_CATEGORIES, expenseStatusTone } from "@/lib/expenses";
import { titleWithExtension } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import ExpenseForm from "../ExpenseForm";
import {
  deleteExpense,
  deleteExpenseFile,
  markExpensePaid,
  resendCompanyInvoice,
  updateExpense,
  uploadPaymentReceipt,
} from "../actions";
import { invoiceLabels } from "../labels";
import { whatFor } from "@/lib/partnerInvoices";
import { dayAndTime } from "@/lib/when";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const found = await db
    .select({ expense: expenses, project: projects })
    .from(expenses)
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(eq(expenses.id, id))
    .limit(1);

  const row = found[0];
  if (!row) notFound();
  const { expense, project } = row;

  const [files, projectList, partnerRows] = await Promise.all([
    db.select().from(documents).where(eq(documents.expenseId, id)),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    db
      .select({ id: subowners.id, name: subowners.name, company: subowners.company, email: subowners.email })
      .from(subowners)
      .orderBy(asc(subowners.name)),
  ]);
  const out = expense.direction === "OUT";
  const ourPdf = files.find((file) => file.category === "INVOICE");

  const totalCents = toCents(expense.totalAmount);
  const paidCents = toCents(expense.paidAmount);

  return (
    <>
      <BackLink href="/invoices" label={t("invoices.backToInvoices")} />
      <PageHeader
        title={expense.supplier}
        subtitle={[
          t(`invoices.direction.${out ? "OUT" : "IN"}` as MessageKey),
          whatFor(expense),
          expense.reference,
          expense.description,
        ]
          .filter(Boolean)
          .join(" . ")}
        action={
          <Pill tone={expenseStatusTone(expense.status) as "good" | "warn" | "neutral"}>
            {t(`invoices.status.${expense.status}` as MessageKey)}
          </Pill>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("invoices.net")} value={formatAmount(toCents(expense.netAmount), locale)} />
        <Stat label={t("invoices.vat")} value={formatAmount(toCents(expense.vatAmount), locale)} />
        <Stat label={t("invoices.total")} value={formatAmount(totalCents, locale)} />
        <Stat
          label={t("invoices.owed")}
          value={formatAmount(totalCents - paidCents, locale)}
          hint={`${formatAmount(paidCents, locale)} ${t("invoices.paid").toLowerCase()}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("invoices.details")}>
            <ExpenseForm
              action={updateExpense.bind(null, id)}
              expense={expense}
              projects={projectList}
              cancelHref="/invoices"
              categories={EXPENSE_CATEGORIES.map((value) => ({
                value,
                label: t(`invoices.category.${value}` as MessageKey),
              }))}
              partners={partnerRows.map((one) => ({
                id: one.id,
                name: one.company?.trim() || one.name,
                email: one.email,
              }))}
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
                  {files.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <a
                          href={`/api/files/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-teal-dark hover:underline"
                        >
                          {titleWithExtension(file)}
                        </a>
                      </td>
                      <td className="ctr nowrap text-xs">{dayAndTime(file.createdAt, locale)}</td>
                      <td className="ctr">
                        <form action={deleteExpenseFile.bind(null, file.id, id)}>
                          <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                            {t("common.delete")}
                          </button>
                        </form>
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
                <dd>
                  {project ? (
                    <Link href={`/projects/${project.id}`} className="hover:underline">
                      {project.name}
                    </Link>
                  ) : (
                    t("invoices.noProject")
                  )}
                </dd>
              </div>
            </dl>

            {out ? (
              <div className="mb-3 space-y-2">
                {ourPdf ? (
                  <a
                    href={`/api/files/${ourPdf.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary w-full justify-center"
                  >
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

            {/* The partner's payment arrives with a receipt: filing it marks
                the invoice paid. */}
            {out && expense.status !== "PAID" ? (
              <form
                action={uploadPaymentReceipt.bind(null, id)}
                className="mb-3 space-y-2 rounded border border-brand-line bg-brand-surface p-3"
              >
                <p className="label">{t("invoices.uploadReceipt")}</p>
                <input name="files" type="file" required accept=".pdf,image/*" className="input !py-1.5 text-xs" />
                <DateField name="paidOn" />
                <p className="text-xs text-brand-graphite/60">{t("invoices.uploadReceiptHint")}</p>
                <button type="submit" className="btn btn-primary">
                  {t("common.save")}
                </button>
              </form>
            ) : null}

            {expense.status === "PAID" ? null : (
              <>
                <form action={markExpensePaid.bind(null, id)} className="mb-3">
                  <button type="submit" className="btn btn-primary">
                    {t("invoices.markPaid")}
                  </button>
                </form>

                <Disclosure showLabel={t("invoices.payPart")} hideLabel={t("common.cancel")}>
                  <form
                    action={markExpensePaid.bind(null, id)}
                    className="space-y-2 rounded border border-brand-line bg-brand-surface p-3"
                  >
                    <div>
                      <label className="label" htmlFor="amount">
                        {t("contracts.amount")}
                      </label>
                      <input id="amount" name="amount" inputMode="decimal" className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="paidOn">
                        {t("invoices.paidOn")}
                      </label>
                      <DateField id="paidOn" name="paidOn" />
                    </div>
                    <button type="submit" className="btn btn-secondary">
                      {t("common.save")}
                    </button>
                  </form>
                </Disclosure>
              </>
            )}
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
