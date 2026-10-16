import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { optionsFor } from "@/lib/choices";
import { cashEntryById, knownNames } from "@/lib/cashEntries";
import { ourCompanies } from "@/lib/parties";
import { BackLink, Card, PageHeader } from "@/components/ui";
import DeleteRecord from "@/components/DeleteRecord";
import CashForm from "../CashForm";
import { deleteCashEntry, updateCashEntry } from "../actions";

export const dynamic = "force-dynamic";

/** One cash record, to correct or delete. */
export default async function CashEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const entry = await cashEntryById(id);
  if (!entry) notFound();
  const { t } = await getTranslator();
  const [categories, projectRows, companies, names] = await Promise.all([
    optionsFor("expenseCategory", t, { current: entry.categoryChoice ?? entry.category }),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    ourCompanies(),
    knownNames(),
  ]);
  return (
    <>
      <BackLink href="/invoices/cash" label={`${t("common.backTo")} ${t("cash.title").toLowerCase()}`} />
      <PageHeader title={entry.party} subtitle={entry.direction === "IN" ? t("cash.kindIn") : t("cash.kindOut")} />
      <div className="max-w-4xl space-y-4">
        <Card title={t("cash.record")}>
          <CashForm
            action={updateCashEntry.bind(null, id)}
            entry={entry}
            categories={categories}
            projects={projectRows}
            companies={companies}
            names={names}
            t={t}
          />
        </Card>
        <DeleteRecord action={deleteCashEntry.bind(null, id)} label={t("cash.delete")} what={t("cash.deleteWhat")} confirm={t("remove.confirm")} />
      </div>
    </>
  );
}
