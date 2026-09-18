import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { agents, clients, leads } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { getContract, unitsWithoutContract } from "@/lib/contracts";
import { amountForInput, formatAmount } from "@/lib/money";
import { BackLink, Card, Empty, PageHeader } from "@/components/ui";
import ContractForm from "../ContractForm";
import { formLabels } from "../labels";
import { createContract } from "../actions";
import type { Row } from "../ScheduleBuilder";

/**
 * A new contract, or a copy of one.
 *
 * Copying is what the office actually does: the next sale is the same price and
 * the same stages for a different buyer, so `?from=` fills everything in and
 * leaves the name, the buyer, the apartment and the dates to be set. The name
 * must change, since two contracts can never share one.
 */
export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; client?: string; unit?: string }>;
}) {
  const { from, client, unit } = await searchParams;

  /**
   * The agent who introduced this buyer, taken from the enquiry they came from.
   *
   * The office named the agent when the enquiry was taken, so the contract
   * should not ask again: it arrives chosen, and can be changed if the sale
   * actually came through somebody else.
   */
  const introducedBy = client
    ? ((
        await db
          .select({ agentId: leads.agentId })
          .from(leads)
          .where(eq(leads.clientId, client))
          .limit(1)
      )[0]?.agentId ?? undefined)
    : undefined;
  const { locale, t } = await getTranslator();

  const [source, free, clientList, agentList] = await Promise.all([
    from ? getContract(from) : Promise.resolve(null),
    unitsWithoutContract(),
    db.select().from(clients).where(isNull(clients.deletedAt)).orderBy(asc(clients.lastName)),
    db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.name)),
  ]);

  const rows: Row[] = source
    ? source.installments.map((l, i) => ({
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
          {free.length === 0 || clientList.length === 0 ? (
            <Empty message={t("contracts.needClientAndUnit")} />
          ) : (
            <>
              {/*
                The note about what one contract covers now lives under the
                transaction type, where it can say the right thing for each of
                them. Only the note about copying belongs up here.
              */}
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
                        unitId: null,
                        clientId: null,
                        contractDate: null,
                      }
                    : undefined
                }
                rows={rows}
                units={free.map((u) => ({
                  id: u.unit.id,
                  label: `${u.project.name} ${u.unit.code} . ${formatAmount(
                    Number(u.unit.netPrice) * 100,
                    locale,
                  )}${u.holder ? ` . ${u.holder.firstName} ${u.holder.lastName}` : ""}`,
                }))}
                clients={clientList.map((c) => ({
                  id: c.id,
                  label: `${c.lastName} ${c.firstName}`,
                }))}
                agents={agentList.map((a) => ({
                  id: a.id,
                  label: `${a.name} (${Number(a.commissionRate)}%)`,
                }))}
                defaults={{ unitId: unit, clientId: client, agentId: introducedBy }}
                cancelHref="/contracts"
                labels={formLabels(t)}
              />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
