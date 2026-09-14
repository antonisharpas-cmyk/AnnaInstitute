import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ExpenseForm from "../ExpenseForm";
import { createExpense } from "../actions";

export default async function NewInvoicePage() {
  const { t } = await getTranslator();
  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(asc(projects.name));

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
            labels={{
              supplier: t("invoices.supplier"),
              category: t("invoices.category"),
              reference: t("invoices.reference"),
              description: t("invoices.description"),
              issued: t("invoices.issued"),
              due: t("invoices.due"),
              net: t("invoices.net"),
              vat: t("invoices.vat"),
              total: t("invoices.total"),
              totalNote: t("invoices.totalNote"),
              alreadyPaid: t("invoices.alreadyPaid"),
              project: t("invoices.project"),
              noProject: t("invoices.noProject"),
              files: t("invoices.files"),
              filesNote: t("invoices.filesNote"),
              notes: t("common.notes"),
              save: t("common.save"),
              cancel: t("common.cancel"),
            }}
          />
        </Card>
      </div>
    </>
  );
}
