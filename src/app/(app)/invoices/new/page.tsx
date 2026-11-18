import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { optionsFor } from "@/lib/choices";
import { ourCompanies, partyOptions } from "@/lib/parties";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ExpenseForm from "../ExpenseForm";
import { createExpense } from "../actions";
import { invoiceLabels } from "../labels";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { t } = await getTranslator();
  /* Opened from a partner's page, say: an invoice we received from them, with them chosen. */
  const from = String((await searchParams).from ?? "");
  const [projectList, companies, parties] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    ourCompanies(),
    partyOptions(),
  ]);

  return (
    <>
      <BackLink href="/invoices" label={t("invoices.backToInvoices")} />
      <PageHeader title={t("invoices.new")} subtitle={t("invoices.subtitle")} />
      <div className="max-w-5xl">
        <Card title={t("invoices.details")}>
          <ExpenseForm
            action={createExpense}
            projects={projectList}
            ourCompanies={companies}
            parties={parties}
            cancelHref="/invoices"
            categories={await optionsFor("expenseCategory", t)}
            labels={invoiceLabels(t)}
            startWith={parties.some((one) => one.value === from) ? { direction: "IN", party: from } : undefined}
          />
        </Card>
      </div>
    </>
  );
}
