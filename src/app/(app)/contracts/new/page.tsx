import { getTranslator } from "@/i18n";
import { getContract } from "@/lib/contracts";
import { amountForInput } from "@/lib/money";
import { BackLink, Card, PageHeader } from "@/components/ui";
import ContractForm from "../ContractForm";
import { formLabels } from "../labels";
import { createContract } from "../actions";
import type { Row } from "../ScheduleBuilder";

/**
 * A new contract, or a copy of one.
 *
 * Copying is what the office actually does: two contracts differ by a few
 * numbers, so `?from=` fills everything in from the original and leaves the
 * name to be changed, which it must be, since two contracts can never share one.
 */
export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const { t } = await getTranslator();

  const source = from ? await getContract(from) : null;

  const rows: Row[] = source
    ? source.plan.map((l, i) => ({
        key: `row-${i}`,
        label: l.label,
        labelEl: l.labelEl,
        amount: amountForInput(l.netAmount),
        dueDate: "",
      }))
    : [];

  return (
    <>
      <BackLink
        href="/contracts"
        label={`${t("common.backTo")} ${t("contracts.title").toLowerCase()}`}
      />
      <PageHeader
        title={t("contracts.newTitle")}
        subtitle={source ? `${t("contracts.copy")}: ${source.contract.reference}` : undefined}
      />
      <div className="max-w-4xl">
        <Card title={t("contracts.details")}>
          {source ? (
            <p className="mb-3 text-xs text-brand-graphite/60">{t("contracts.copyHint")}</p>
          ) : null}
          <ContractForm
            action={createContract}
            contract={
              source
                ? {
                    ...source.contract,
                    reference: `${source.contract.reference} ${t("contracts.copyOf")}`,
                  }
                : undefined
            }
            rows={rows}
            cancelHref="/contracts"
            labels={formLabels(t)}
          />
        </Card>
      </div>
    </>
  );
}
