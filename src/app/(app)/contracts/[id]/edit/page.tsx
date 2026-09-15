import { notFound } from "next/navigation";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { agents, clients } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { getContract, unitsWithoutContract } from "@/lib/contracts";
import { amountForInput, formatAmount } from "@/lib/money";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ContractForm from "../../ContractForm";
import { formLabels } from "../../labels";
import { updateContract } from "../../actions";
import type { Row } from "../../ScheduleBuilder";

const day = (value: Date | null) => (value ? new Date(value).toISOString().slice(0, 10) : "");

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const detail = await getContract(id);
  if (!detail) notFound();

  const [free, clientList, agentList] = await Promise.all([
    unitsWithoutContract(detail.contract.unitId ?? undefined),
    db.select().from(clients).where(isNull(clients.deletedAt)).orderBy(asc(clients.lastName)),
    db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.name)),
  ]);

  const rows: Row[] = detail.installments.map((l, i) => ({
    key: `row-${i}`,
    label: l.label,
    labelEl: l.labelEl,
    amount: amountForInput(l.netAmount),
    dueDate: day(l.dueDate),
  }));

  return (
    <>
      <BackLink href={`/contracts/${id}`} label={t("contracts.backToContract")} />
      <PageHeader title={t("contracts.edit")} subtitle={detail.contract.reference} />
      <div className="max-w-4xl">
        <Card title={t("contracts.details")}>
          <p className="mb-3 text-xs text-brand-graphite/60">
            {detail.open ? t("contracts.editNote") : t("contracts.scheduleFrozen")}
          </p>
          <ContractForm
            action={updateContract.bind(null, id)}
            contract={detail.contract}
            rows={rows}
            units={free.map((u) => ({
              id: u.unit.id,
              label: `${u.project.name} ${u.unit.code} . ${formatAmount(
                Number(u.unit.netPrice) * 100,
                locale,
              )}`,
            }))}
            clients={clientList.map((c) => ({ id: c.id, label: `${c.lastName} ${c.firstName}` }))}
            agents={agentList.map((a) => ({
              id: a.id,
              label: `${a.name} (${Number(a.commissionRate)}%)`,
            }))}
            cancelHref={`/contracts/${id}`}
            frozen={!detail.open}
            editing
            labels={formLabels(t)}
          />
        </Card>
      </div>
    </>
  );
}
