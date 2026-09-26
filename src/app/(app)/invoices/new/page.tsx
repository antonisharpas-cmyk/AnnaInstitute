import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects, subowners } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ExpenseForm from "../ExpenseForm";
import { createExpense } from "../actions";
import { invoiceLabels } from "../labels";

export default async function NewInvoicePage() {
  const { t } = await getTranslator();
  const [projectList, partnerRows] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    db
      .select({ id: subowners.id, name: subowners.name, company: subowners.company, email: subowners.email })
      .from(subowners)
      .orderBy(asc(subowners.name)),
  ]);

  return (
    <>
      <BackLink href="/invoices" label={t("invoices.backToInvoices")} />
      <PageHeader title={t("invoices.new")} subtitle={t("invoices.subtitle")} />
      <div className="max-w-4xl">
        <Card title={t("invoices.details")}>
          <ExpenseForm
            action={createExpense}
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
      </div>
    </>
  );
}
