import { notFound } from "next/navigation";
import { getTranslator } from "@/i18n";
import { getContract } from "@/lib/contracts";
import { amountForInput } from "@/lib/money";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ContractForm from "../../ContractForm";
import { formLabels } from "../../labels";
import { updateContract } from "../../actions";
import type { Row } from "../../ScheduleBuilder";

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getTranslator();

  const detail = await getContract(id);
  if (!detail) notFound();

  // The plan itself takes no money, so it can always be edited. Apartments that
  // have already received payments keep their own schedule; the others follow.
  const paidApartments = detail.assignments.filter((a) => !a.open);

  const rows: Row[] = detail.plan.map((l, i) => ({
    key: `row-${i}`,
    label: l.label,
    labelEl: l.labelEl,
    amount: amountForInput(l.netAmount),
    dueDate: "",
  }));

  return (
    <>
      <BackLink href={`/contracts/${id}`} label={t("contracts.backToContract")} />
      <PageHeader title={t("contracts.edit")} subtitle={detail.contract.reference} />
      <div className="max-w-4xl">
        <Card title={t("contracts.details")}>
          <p className="mb-3 text-xs text-brand-graphite/60">
            {paidApartments.length > 0
              ? `${t("contracts.editNotePaid")} ${paidApartments
                  .map((a) => `${a.project.name} ${a.unit.code}`)
                  .join(", ")}`
              : t("contracts.editNote")}
          </p>
          <ContractForm
            action={updateContract.bind(null, id)}
            contract={detail.contract}
            rows={rows}
            cancelHref={`/contracts/${id}`}
            editing
            labels={formLabels(t)}
          />
        </Card>
      </div>
    </>
  );
}
