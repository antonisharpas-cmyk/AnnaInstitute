import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects, subowners } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { optionsFor } from "@/lib/choices";
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
            categories={await optionsFor("expenseCategory", t)}
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
