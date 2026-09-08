import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  contractUnits,
  contracts,
  installments,
  payments,
  projects,
  units,
} from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { apartmentsByClient, assignableUnits } from "@/lib/clients";
import { documentsForClientWithUnits } from "@/lib/documents";
import { clientFileLabel } from "@/lib/fileLabels";
import { contractChoices } from "@/lib/contracts";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import InstallmentsPanel from "./InstallmentsPanel";
import PersonalInfo from "./PersonalInfo";
import DocumentUpload from "./DocumentUpload";
import {
  assignApartment,
  attachContract,
  deleteClientDocument,
  detachContract,
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
    documentsForClientWithUnits(id),
  ]);

  const held = assigned.get(id) ?? [];

  // The contracts on this client's apartments. A contract belongs to itself, not
  // to the client, so it arrives through the assignment that puts it on one of
  // their apartments.
  const contractRows = await db
    .select({ assignment: contractUnits, contract: contracts, unit: units, project: projects })
    .from(contractUnits)
    .innerJoin(contracts, eq(contracts.id, contractUnits.contractId))
    .innerJoin(units, eq(units.id, contractUnits.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(contractUnits.clientId, id))
    .orderBy(desc(contractUnits.createdAt));

  // The schedule that matters here is the apartment's own copy, with its own
  // dates, not the contract's plan: this buyer may have signed months later.
  const assignmentIds = contractRows.map((r) => r.assignment.id);

  const [scheduleRows, paymentRows] = await Promise.all([
    assignmentIds.length > 0
      ? db
          .select()
          .from(installments)
          .where(inArray(installments.assignmentId, assignmentIds))
          .orderBy(asc(installments.seq))
      : Promise.resolve([]),
    assignmentIds.length > 0
      ? db.select().from(payments).where(inArray(payments.assignmentId, assignmentIds))
      : Promise.resolve([]),
  ]);

  // What this client's apartment has paid against each installment. The money
  // belongs to the apartment, so the key is the assignment as well as the line.
  const paidByPair = new Map<string, number>();
  const paidByAssignment = new Map<string, number>();
  for (const p of paymentRows) {
    const cents = toCents(p.amount);
    if (p.assignmentId) {
      paidByAssignment.set(p.assignmentId, (paidByAssignment.get(p.assignmentId) ?? 0) + cents);
      if (p.installmentId) {
        const key = `${p.assignmentId}:${p.installmentId}`;
        paidByPair.set(key, (paidByPair.get(key) ?? 0) + cents);
      }
    }
  }

  /**
   * One block per apartment, plus any apartment that has one of their contracts
   * on it but is no longer assigned to them, so nothing can go missing.
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
        contractReference: row.contract.reference,
        assignmentId: row.assignment.id,
      })),
  ];

  // Every contract in the system can be put on an apartment, since a contract
  // is independent of both the buyer and the building.
  const choicesOfContract = await contractChoices();

  const byCategory = (category: string) =>
    theirDocuments.filter((row) => row.document.category === category);

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
            {items.map(({ document: doc, unitCode }) => (
              <li key={doc.id} className="flex items-center justify-between gap-2 py-2">
                <a
                  href={`/api/files/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-brand-teal-dark hover:underline"
                >
                  {clientFileLabel(doc, unitCode)}
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
      <BackLink
        href="/clients"
        label={`${t("common.backTo")} ${t("clients.title").toLowerCase()}`}
      />
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
          {/* Assigning is behind a button, above the table, so the table is what
              the page shows first. */}
          <div className="mb-4">
            <Disclosure showLabel={t("contracts.addApartment")} hideLabel={t("common.cancel")}>
              <form
                action={assignApartment.bind(null, id)}
                className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-[2fr_1fr_auto]"
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
                  <select
                    id="assignStatus"
                    name="status"
                    className="select"
                    defaultValue="RESERVED"
                  >
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
              </form>
            </Disclosure>
          </div>

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
                            <button
                              type="submit"
                              className="btn btn-secondary !px-3 !py-1 !text-xs"
                            >
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
        </Card>

        {/* 3. The contract on each apartment, with its schedule and what this
               apartment has paid against it. */}
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
                      <div className="flex flex-wrap items-end gap-2">
                        {choicesOfContract.length > 0 ? (
                          <form
                            action={attachContract.bind(null, id, apartment.unitId)}
                            className="flex items-end gap-2"
                          >
                            <div>
                              <label className="label" htmlFor={`contract-${apartment.unitId}`}>
                                {t("contracts.selectExisting")}
                              </label>
                              <select
                                id={`contract-${apartment.unitId}`}
                                name="contractId"
                                required
                                className="select !py-1 !text-xs"
                                defaultValue=""
                              >
                                <option value="">choose</option>
                                {choicesOfContract.map((choice) => (
                                  <option key={choice.id} value={choice.id}>
                                    {choice.reference} .{" "}
                                    {formatAmount(toCents(choice.netPrice), locale)} .{" "}
                                    {choice.installmentCount}{" "}
                                    {t("contracts.installmentsCount").toLowerCase()}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button type="submit" className="btn btn-primary !px-3 !py-1 !text-xs">
                              {t("contracts.attach")}
                            </button>
                          </form>
                        ) : null}
                        <Link
                          href="/contracts/new"
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary !px-3 !py-1 !text-xs"
                        >
                          {t("clients.newContract")}
                        </Link>
                      </div>
                    </div>
                  );
                }

                const assignmentId = row.assignment.id;
                const lines = scheduleRows.filter((l) => l.assignmentId === assignmentId);
                const scheduled = lines.reduce((a, l) => a + toCents(l.totalAmount), 0);
                const paid = paidByAssignment.get(assignmentId) ?? 0;

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
                          {formatAmount(toCents(row.contract.netPrice), locale)} before VAT .{" "}
                          {t("contracts.vat")} {formatPercent(Number(row.contract.vatRate), locale)}
                        </div>
                        <div className="mt-1 text-xs text-brand-graphite/60">
                          {formatAmount(paid, locale)} {t("contracts.paid").toLowerCase()} of{" "}
                          {formatAmount(scheduled, locale)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/contracts/${row.contract.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary !px-3 !py-1 !text-xs"
                        >
                          {t("clients.openContract")}
                        </Link>
                        {paid > 0 ? (
                          <span className="text-xs text-brand-graphite/60">
                            {t("clients.paymentsRecorded")}
                          </span>
                        ) : (
                          <form action={detachContract.bind(null, assignmentId, id)}>
                            <button
                              type="submit"
                              className="btn btn-secondary !px-3 !py-1 !text-xs"
                            >
                              {t("clients.detachContract")}
                            </button>
                          </form>
                        )}
                      </div>

                      <InstallmentsPanel
                        showLabel={t("clients.showInstallments")}
                        hideLabel={t("clients.hideInstallments")}
                      >
                        <div className="overflow-x-auto">
                          <table className="data">
                            <thead>
                              <tr>
                                <th className="ctr">#</th>
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
                                const paidHere = paidByPair.get(`${assignmentId}:${line.id}`) ?? 0;
                                return (
                                  <tr key={line.id}>
                                    <td className="ctr">{line.seq}</td>
                                    <td>{line.label}</td>
                                    <td className="ctr">
                                      {day(line.dueDate, locale) || "not set"}
                                    </td>
                                    <td className="ctr">
                                      {formatAmount(toCents(line.netAmount), locale)}
                                    </td>
                                    <td className="ctr">
                                      {formatAmount(toCents(line.vatAmount), locale)}
                                      <div className="text-xs text-brand-graphite/50">
                                        {formatPercent(Number(line.vatRateApplied), locale)}
                                      </div>
                                    </td>
                                    <td className="ctr font-semibold">
                                      {formatAmount(toCents(line.totalAmount), locale)}
                                    </td>
                                    <td className="ctr">
                                      {paidHere > 0 ? (
                                        <Pill
                                          tone={
                                            paidHere >= toCents(line.totalAmount) ? "good" : "warn"
                                          }
                                        >
                                          {formatAmount(paidHere, locale)}
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

                        <p className="mt-2 text-xs text-brand-graphite/60">
                          {t("clients.scheduleOnContractPage")}
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
              apartments={contractSubjects.map((a) => ({
                unitId: a.unitId,
                code: a.code,
                projectName: a.projectName,
              }))}
              labels={{
                category: t("common.category"),
                number: t("clients.idNumber"),
                title: t("common.title"),
                files: t("common.files"),
                add: t("common.add"),
                apartment: t("clients.docsApartment"),
                choose: t("clients.chooseApartmentDoc"),
                anyApartment: t("clients.anyApartment"),
                search: t("clients.searchPlaceholder"),
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
