import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, installments, payments, projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatMoney, formatPercent, toCents } from "@/lib/money";
import { apartmentsByClient, assignableUnits } from "@/lib/clients";
import { documentsForClient } from "@/lib/documents";
import { titleWithExtension } from "@/lib/fileLabels";
import { effectiveVatRate } from "@/lib/vat";
import { vatSetupOf } from "@/lib/contracts";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import InstallmentsPanel from "./InstallmentsPanel";
import PersonalInfo from "./PersonalInfo";
import DocumentUpload from "./DocumentUpload";
import {
  addInstallment,
  assignApartment,
  createContractForUnit,
  deleteClientDocument,
  deleteContract,
  setContractVatRate,
  setMarketingConsent,
  unassignApartment,
  unsubscribeClient,
  uploadClientDocuments,
} from "../actions";

const day = (value: Date | null | undefined, locale: string) =>
  value ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB") : "";

const statusTone = (status: string) =>
  status === "SOLD" || status === "DELIVERED" ? "good" : status === "RESERVED" ? "warn" : "neutral";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const found = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  const client = found[0];
  if (!client) notFound();

  const [assigned, choices, theirDocuments] = await Promise.all([
    apartmentsByClient([id]),
    assignableUnits(id),
    documentsForClient(id),
  ]);

  const held = assigned.get(id) ?? [];

  // One contract per apartment. The rows come back with their apartment so each
  // contract can be shown beside the apartment it belongs to.
  const contractRows = await db
    .select({ contract: contracts, unit: units, project: projects })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(contracts.clientId, id))
    .orderBy(desc(contracts.createdAt));

  const contractIds = contractRows.map((r) => r.contract.id);

  const [scheduleRows, paymentRows] = await Promise.all([
    contractIds.length > 0
      ? db
          .select()
          .from(installments)
          .where(inArray(installments.contractId, contractIds))
          .orderBy(asc(installments.seq))
      : Promise.resolve([]),
    contractIds.length > 0
      ? db.select().from(payments).where(inArray(payments.contractId, contractIds))
      : Promise.resolve([]),
  ]);

  const paidByInstallment = new Map<string, number>();
  for (const p of paymentRows) {
    if (!p.installmentId) continue;
    paidByInstallment.set(
      p.installmentId,
      (paidByInstallment.get(p.installmentId) ?? 0) + toCents(p.amount),
    );
  }

  /**
   * One block per apartment, plus any contract whose apartment is not assigned
   * to this client at the moment, so an older contract can never go missing.
   */
  const contractSubjects = [
    ...held,
    ...contractRows
      .filter((row) => !held.some((h) => h.unitId === row.unit.id))
      .map((row) => ({
        unitId: row.unit.id,
        code: row.unit.code,
        status: row.unit.status,
        netPrice: row.unit.netPrice,
        projectId: row.project.id,
        projectName: row.project.name,
        contractId: row.contract.id,
      })),
  ];

  const byCategory = (category: string) => theirDocuments.filter((d) => d.category === category);

  const documentSection = (title: string, category: string) => {
    const items = byCategory(category);
    return (
      <div className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
          {title}
        </h3>
        {items.length === 0 ? (
          <p className="text-sm text-brand-graphite/50">{t("common.none")}</p>
        ) : (
          <ul className="divide-y divide-brand-line text-sm">
            {items.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-2 py-2">
                <a
                  href={`/api/files/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-brand-teal-dark hover:underline"
                >
                  {titleWithExtension(doc)}
                </a>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-xs text-brand-graphite/60">
                    {day(doc.createdAt, locale)}
                  </span>
                  <a
                    href={`/api/files/${doc.id}?download=1`}
                    className="btn btn-secondary !px-2 !py-1 !text-xs"
                  >
                    {t("common.download")}
                  </a>
                  <form action={deleteClientDocument.bind(null, doc.id, id)}>
                    <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                      {t("common.delete")}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <>
      <BackLink href="/clients" label={`${t("common.backTo")} ${t("clients.title").toLowerCase()}`} />
      <PageHeader
        title={`${client.firstName} ${client.lastName}`}
        subtitle={[client.email, client.phone].filter(Boolean).join(" . ")}
      />

      <div className="max-w-4xl space-y-4">
        {/* 1. Personal information, edited in place. */}
        <PersonalInfo
          client={{
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phone: client.phone,
            idType: client.idType,
            idNumber: client.idNumber,
            country: client.country,
            address: client.address,
            source: client.source,
            notes: client.notes,
          }}
          labels={{
            title: t("clients.personal"),
            edit: t("clients.edit"),
            save: t("common.save"),
            cancel: t("common.cancel"),
            name: t("common.name"),
            surname: "Surname",
            email: t("common.email"),
            phone: t("common.phone"),
            idType: t("clients.idType"),
            idNumber: t("clients.idNumber"),
            country: t("clients.country"),
            address: t("clients.address"),
            source: t("clients.source"),
            notes: t("common.notes"),
          }}
        />

        {/* 2. The apartments they hold. */}
        <Card title={t("clients.apartmentsPlural")}>
          {held.length === 0 ? (
            <p className="py-2 text-sm text-brand-graphite/60">{t("clients.noApartments")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("nav.projects")}</th>
                    <th className="ctr">{t("units.code")}</th>
                    <th className="ctr">{t("units.netPrice")}</th>
                    <th className="ctr">{t("common.status")}</th>
                    <th className="ctr">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {held.map((a) => (
                    <tr key={a.unitId}>
                      <td>
                        <Link
                          href={`/projects/${a.projectId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold hover:underline"
                        >
                          {a.projectName}
                        </Link>
                      </td>
                      <td className="ctr">
                        <Link
                          href={`/projects/${a.projectId}/units/${a.unitId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {a.code}
                        </Link>
                      </td>
                      <td className="ctr">{formatAmount(toCents(a.netPrice), locale)}</td>
                      <td className="ctr">
                        <Pill tone={statusTone(a.status) as "good" | "warn" | "neutral"}>
                          {t(`units.status.${a.status}` as MessageKey)}
                        </Pill>
                      </td>
                      <td className="ctr">
                        {a.contractId ? (
                          <span className="text-xs text-brand-graphite/60">
                            {t("clients.contractLocked")}
                          </span>
                        ) : (
                          <form action={unassignApartment.bind(null, a.unitId, id)}>
                            <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                              {t("clients.delete")}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            action={assignApartment.bind(null, id)}
            className="mt-4 grid gap-3 border-t border-brand-line pt-4 sm:grid-cols-[2fr_1fr_auto]"
          >
            <div>
              <label className="label" htmlFor="unitId">
                {t("clients.chooseApartment")}
              </label>
              <select id="unitId" name="unitId" required className="select">
                <option value="">choose</option>
                {[...choices.entries()].map(([projectId, group]) => (
                  <optgroup key={projectId} label={group.projectName}>
                    {group.units.map((u) => (
                      <option key={u.unit.id} value={u.unit.id}>
                        {u.unit.code}
                        {u.unit.bedrooms ? ` . ${u.unit.bedrooms} bed` : ""} .{" "}
                        {formatAmount(toCents(u.unit.netPrice), locale)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="assignStatus">
                {t("common.status")}
              </label>
              <select id="assignStatus" name="status" className="select" defaultValue="RESERVED">
                <option value="RESERVED">{t("units.status.RESERVED")}</option>
                <option value="SOLD">{t("units.status.SOLD")}</option>
                <option value="DELIVERED">{t("units.status.DELIVERED")}</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary w-full">
                {t("common.add")}
              </button>
            </div>
            <p className="text-xs text-brand-graphite/60 sm:col-span-3">
              {t("clients.assignHint")}
            </p>
          </form>
        </Card>

        {/* 3. One contract per apartment, with its schedule. */}
        <Card title={t("contracts.title")}>
          {contractSubjects.length === 0 ? (
            <Empty message={t("clients.noApartments")} />
          ) : (
            <div className="space-y-4">
              {contractSubjects.map((apartment) => {
                const row = contractRows.find((c) => c.unit.id === apartment.unitId);

                if (!row) {
                  return (
                    <div
                      key={apartment.unitId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-line bg-brand-surface px-3 py-3"
                    >
                      <div>
                        <div className="text-sm font-semibold">
                          {apartment.projectName} {apartment.code}
                        </div>
                        <div className="text-xs text-brand-graphite/60">
                          {t("clients.noContractYet")}
                        </div>
                      </div>
                      <form action={createContractForUnit.bind(null, id, apartment.unitId)}>
                        <button type="submit" className="btn btn-primary !px-3 !py-1 !text-xs">
                          {t("clients.createContract")}
                        </button>
                      </form>
                    </div>
                  );
                }

                const lines = scheduleRows.filter((l) => l.contractId === row.contract.id);
                const blended = effectiveVatRate(vatSetupOf(row.contract));
                const scheduled = lines.reduce((a, l) => a + toCents(l.totalAmount), 0);
                const paid = lines.reduce((a, l) => a + (paidByInstallment.get(l.id) ?? 0), 0);

                return (
                  <div
                    key={apartment.unitId}
                    className="rounded border border-brand-line bg-white px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/contracts/${row.contract.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-brand-teal-dark hover:underline"
                        >
                          {row.contract.reference}
                        </Link>
                        <div className="text-xs text-brand-graphite/60">
                          {row.project.name} {row.unit.code} .{" "}
                          {formatMoney(toCents(row.contract.netPrice), locale)} before VAT .{" "}
                          {t("contracts.effectiveRate")}{" "}
                          {formatPercent(Number(blended.toFixed(3)), locale)}
                        </div>
                        <div className="mt-1 text-xs text-brand-graphite/60">
                          {formatMoney(paid, locale)} {t("contracts.paid").toLowerCase()} of{" "}
                          {formatMoney(scheduled, locale)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <form action={deleteContract.bind(null, row.contract.id, id)}>
                          <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                            {t("clients.deleteContract")}
                          </button>
                        </form>
                      </div>

                      <InstallmentsPanel
                        showLabel={t("clients.showInstallments")}
                        hideLabel={t("clients.hideInstallments")}
                      >
                        <div className="overflow-x-auto">
                          <table className="data">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>{t("contracts.stage")}</th>
                                <th className="ctr">{t("clients.period")}</th>
                                <th className="ctr">{t("contracts.net")}</th>
                                <th className="ctr">{t("contracts.vatCol")}</th>
                                <th className="ctr">{t("common.total")}</th>
                                <th className="ctr">{t("clients.paid")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((line) => {
                                const paidHere = paidByInstallment.get(line.id) ?? 0;
                                return (
                                  <tr key={line.id}>
                                    <td className="ctr">{line.seq}</td>
                                    <td>{line.label}</td>
                                    <td className="ctr">{day(line.dueDate, locale) || "not set"}</td>
                                    <td className="ctr">
                                      {formatMoney(toCents(line.netAmount), locale)}
                                    </td>
                                    <td className="ctr">
                                      {formatMoney(toCents(line.vatAmount), locale)}
                                      <div className="text-xs text-brand-graphite/50">
                                        {formatPercent(
                                          Number(Number(line.vatRateApplied).toFixed(3)),
                                          locale,
                                        )}
                                      </div>
                                    </td>
                                    <td className="ctr font-semibold">
                                      {formatMoney(toCents(line.totalAmount), locale)}
                                    </td>
                                    <td className="ctr">
                                      {paidHere > 0 ? (
                                        <Pill tone={line.status === "PAID" ? "good" : "warn"}>
                                          {formatMoney(paidHere, locale)}
                                        </Pill>
                                      ) : (
                                        <span className="text-xs text-brand-graphite/50">no</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-3 flex flex-wrap items-end gap-3">
                          <form action={addInstallment.bind(null, row.contract.id, id)}>
                            <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                              {t("clients.addInstallment")}
                            </button>
                          </form>

                          <form
                            action={setContractVatRate.bind(null, row.contract.id, id)}
                            className="flex items-end gap-2"
                          >
                            <div>
                              <label className="label" htmlFor={`rate-${row.contract.id}`}>
                                {t("clients.vatRate")}
                              </label>
                              <select
                                id={`rate-${row.contract.id}`}
                                name="rate"
                                className="select !w-24 !py-1 !text-xs"
                                defaultValue={Number(row.contract.vatRateReduced) === 19 ? "19" : "5"}
                              >
                                <option value="5">5%</option>
                                <option value="19">19%</option>
                              </select>
                            </div>
                            <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                              {t("clients.applyVat")}
                            </button>
                          </form>

                          <Link
                            href={`/contracts/${row.contract.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary !px-3 !py-1 !text-xs"
                          >
                            {t("clients.openContract")}
                          </Link>
                        </div>

                        <p className="mt-2 text-xs text-brand-graphite/60">
                          A split between the two rates, the dates, the stage names and recording a
                          payment are all on the contract page. Anything already paid keeps the
                          figures it was invoiced at.
                        </p>
                      </InstallmentsPanel>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* 4. Documents. The form is first, because adding is the common job. */}
        <Card title={t("contracts.documents")}>
          <div className="mb-5 rounded border border-brand-line bg-brand-surface p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
              {t("clients.docsAdd")}
            </h3>
            <DocumentUpload
              action={uploadClientDocuments.bind(null, id)}
              idNumber={client.idNumber ?? ""}
              labels={{
                category: t("common.category"),
                number: t("clients.idNumber"),
                title: t("common.title"),
                files: t("common.files"),
                add: t("common.add"),
              }}
            />
          </div>

          {documentSection(t("clients.docsIdentification"), "IDENTIFICATION")}
          {documentSection(t("clients.docsContract"), "CONTRACT")}
          {documentSection(t("clients.docsReceipts"), "RECEIPT")}
          {documentSection(t("clients.docsChanges"), "CHANGE_REQUEST")}
          {documentSection(t("clients.docsOther"), "OTHER")}
        </Card>

        {/* 5. Marketing consent, which is what the campaigns audience is built from. */}
        <Card title={t("clients.marketing")}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {client.unsubscribedAt ? (
              <Pill tone="bad">unsubscribed {day(client.unsubscribedAt, locale)}</Pill>
            ) : client.marketingOptIn ? (
              <Pill tone="good">{t("clients.marketingOn")}</Pill>
            ) : (
              <Pill tone="warn">{t("clients.marketingOff")}</Pill>
            )}
            {client.marketingOptInAt ? (
              <span className="text-xs text-brand-graphite/60">
                recorded {day(client.marketingOptInAt, locale)}
                {client.marketingOptInSource ? `, ${client.marketingOptInSource}` : ""}
              </span>
            ) : null}
          </div>

          <form action={setMarketingConsent.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="optIn"
                defaultChecked={client.marketingOptIn}
                className="mt-0.5"
              />
              <span>{t("clients.marketingOn")}</span>
            </label>
            <div>
              <label className="label" htmlFor="optInSource">
                How it was obtained
              </label>
              <input
                id="optInSource"
                name="optInSource"
                defaultValue={client.marketingOptInSource ?? ""}
                placeholder="contract clause, email reply, in person"
                className="input"
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary">
                {t("common.save")}
              </button>
            </div>
          </form>

          {client.unsubscribedAt ? (
            <p className="mt-3 text-xs text-[color:var(--color-negative)]">
              This client said stop, so campaigns will never send to them again. The record is kept
              on purpose: that is how the campaigns section knows to leave them out.
            </p>
          ) : (
            <form action={unsubscribeClient.bind(null, id)} className="mt-3">
              <button type="submit" className="btn btn-secondary">
                Record an unsubscribe
              </button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
