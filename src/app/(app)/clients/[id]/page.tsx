import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  changeRequests,
  clients,
  contracts,
  installments,
  leads,
  payments,
  projects,
  units,
} from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { apartmentsByClient, assignableUnits } from "@/lib/clients";
import { documentsForClientWithUnits } from "@/lib/documents";
import { notesForLead } from "@/lib/leads";
import { titleWithExtension } from "@/lib/fileLabels";
import { clientFileLabel } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import InstallmentsPanel from "./InstallmentsPanel";
import PersonalInfo from "./PersonalInfo";
import DocumentUpload from "@/components/DocumentUpload";
import { ChangeRequestForm, PaymentForm } from "@/components/MoneyForms";
import { addChangeRequest, recordPayment } from "../../contracts/actions";
import { undoConversion } from "../../leads/actions";
import {
  assignApartment,
  deleteClientDocument,
  setMarketingConsent,
  unassignApartment,
  unsubscribeClient,
  uploadClientDocuments,
} from "../actions";

/** A moment, with the time, for the notes that carry one. */
const when = (value: Date, locale: string) =>
  new Date(value).toLocaleString(locale === "el" ? "el-GR" : "en-GB");

const day = (value: Date | null | undefined, locale: string) =>
  value ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB") : "";

const statusTone = (status: string) =>
  status === "SOLD" || status === "DELIVERED" ? "good" : status === "RESERVED" ? "warn" : "neutral";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ undo?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { locale, t } = await getTranslator();

  const found = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  const client = found[0];
  if (!client) notFound();

  // The enquiry this client was made from, when there was one. It is what makes
  // undoing a conversion possible.
  const leadRows = await db.select().from(leads).where(eq(leads.clientId, id)).limit(1);
  const fromLead = leadRows[0];

  const [assigned, choices, theirDocuments, enquiryNotes] = await Promise.all([
    apartmentsByClient([id]),
    assignableUnits(id),
    documentsForClientWithUnits(id),
    // The record the office kept while this was still an enquiry.
    fromLead ? notesForLead(fromLead.id) : Promise.resolve([]),
  ]);

  const held = assigned.get(id) ?? [];

  // Their contracts: one per apartment they have bought.
  const contractRows = await db
    .select({ contract: contracts, unit: units, project: projects, agent: agents })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    // The agent who brought the sale, when one did. It belongs to the contract,
    // which is where the commission is worked out from, and it is shown here so
    // the client profile answers "who introduced this buyer" without leaving.
    .leftJoin(agents, eq(agents.id, contracts.agentId))
    .where(eq(contracts.clientId, id))
    .orderBy(desc(contracts.createdAt));

  const contractIds = contractRows.map((r) => r.contract.id);

  const [scheduleRows, paymentRows, requestRows] = await Promise.all([
    contractIds.length > 0
      ? db
          .select()
          .from(installments)
          .where(inArray(installments.contractId, contractIds))
          .orderBy(asc(installments.seq))
      : Promise.resolve([]),
    contractIds.length > 0
      ? db
          .select()
          .from(payments)
          .where(inArray(payments.contractId, contractIds))
          .orderBy(desc(payments.paidOn))
      : Promise.resolve([]),
    /**
     * Every adjustment the buyer has asked for, on any of their contracts.
     * Here rather than only on the contract page, because "what did they ask us
     * to change" is a question about the buyer, not about the paperwork.
     */
    contractIds.length > 0
      ? db
          .select()
          .from(changeRequests)
          .where(inArray(changeRequests.contractId, contractIds))
          .orderBy(desc(changeRequests.requestedOn))
      : Promise.resolve([]),
  ]);

  /**
   * The paperwork behind each payment and each adjustment, taken from the
   * client's own file, so a receipt filed on the contract page shows here
   * against the payment it belongs to.
   */
  const filesByPayment = new Map<string, typeof theirDocuments>();
  const filesByRequest = new Map<string, typeof theirDocuments>();
  for (const row of theirDocuments) {
    if (row.document.paymentId) {
      const list = filesByPayment.get(row.document.paymentId) ?? [];
      list.push(row);
      filesByPayment.set(row.document.paymentId, list);
    }
    if (row.document.changeRequestId) {
      const list = filesByRequest.get(row.document.changeRequestId) ?? [];
      list.push(row);
      filesByRequest.set(row.document.changeRequestId, list);
    }
  }

  /** How a payment arrived, in words, with older free text left as it stands. */
  const howPaid = (value: string | null) => {
    if (!value) return "";
    const known = ["CASH", "BANK", "CHEQUE", "CARD", "OTHER"];
    return known.includes(value) ? t(`contracts.method.${value}` as MessageKey) : value;
  };

  const paidByInstallment = new Map<string, number>();
  const paidByContract = new Map<string, number>();
  for (const p of paymentRows) {
    const cents = toCents(p.amount);
    paidByContract.set(p.contractId, (paidByContract.get(p.contractId) ?? 0) + cents);
    if (p.installmentId) {
      paidByInstallment.set(p.installmentId, (paidByInstallment.get(p.installmentId) ?? 0) + cents);
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
      })),
  ];

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
        subtitle={[
          client.email,
          client.phone,
          /*
            A buyer who gave land rather than money is a different kind of
            counterparty, and the office needs to know that before it starts
            talking about installments. It is read off their contracts rather
            than kept as a second flag on the client, so it can never disagree
            with them.
          */
          contractRows.some((row) => row.contract.kind === "LAND_EXCHANGE")
            ? t("contracts.kind.LAND_EXCHANGE")
            : null,
        ]
          .filter(Boolean)
          .join(" . ")}
        action={
          <div className="flex flex-wrap gap-2">
            {/* One page that says where this buyer stands, ready to print. */}
            <Link href={`/clients/${id}/statement`} className="btn btn-secondary">
              {t("clients.makeStatement")}
            </Link>
            <Link href={`/contracts/new?client=${id}`} className="btn btn-primary">
              {t("clients.newContract")}
            </Link>
          </div>
        }
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
                    <th>{t("clients.partner")}</th>
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
                      <td className="text-xs">
                        {/*
                          Who holds the development this apartment is in, which
                          comes with the apartment rather than being typed here:
                          assign the apartment and the development, its partner
                          and its share follow.
                        */}
                        {a.partners.length === 0 ? (
                          <span className="text-brand-graphite/60">{t("clients.oursOnly")}</span>
                        ) : (
                          a.partners.map((name) => (
                            <div key={name} className="whitespace-nowrap">
                              {name}
                            </div>
                          ))
                        )}
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
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/contracts/new?client=${id}&unit=${apartment.unitId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-primary !px-3 !py-1 !text-xs"
                        >
                          {t("clients.newContract")}
                        </Link>
                        <Link
                          href="/contracts"
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary !px-3 !py-1 !text-xs"
                        >
                          {t("clients.copyExisting")}
                        </Link>
                      </div>
                    </div>
                  );
                }

                const lines = scheduleRows.filter((l) => l.contractId === row.contract.id);
                const mine = {
                  payments: paymentRows.filter((pay) => pay.contractId === row.contract.id),
                  requests: requestRows.filter((ask) => ask.contractId === row.contract.id),
                };
                const scheduled = lines.reduce((a, l) => a + toCents(l.totalAmount), 0);
                const paid = paidByContract.get(row.contract.id) ?? 0;

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
                        {row.agent ? (
                          <div className="mt-1 text-xs">
                            {t("contracts.agent")}:{" "}
                            <Link
                              href={`/agents/${row.agent.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-teal-dark hover:underline"
                            >
                              {row.agent.name}
                            </Link>
                            {row.contract.commissionRate ? (
                              <span className="text-brand-graphite/55">
                                {" "}
                                . {formatPercent(Number(row.contract.commissionRate), locale)}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-brand-graphite/60">
                          {formatAmount(paid, locale)} {t("contracts.paid").toLowerCase()} of{" "}
                          {formatAmount(scheduled, locale)}
                        </div>
                        {row.contract.kind === "LAND_EXCHANGE" ? (
                          <div className="mt-1">
                            <Pill tone="teal">{t("contracts.kind.LAND_EXCHANGE")}</Pill>
                            {row.contract.cashAmount ? (
                              <span className="ml-2 text-xs text-brand-graphite/60">
                                {t("contracts.cash")}{" "}
                                {formatAmount(toCents(row.contract.cashAmount), locale)}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {row.contract.notes ? (
                          /*
                            The term the office agreed for this apartment, read
                            where the office works. A note that only exists on
                            the edit page is a note nobody sees.
                          */
                          <p className="mt-1 max-w-prose text-xs whitespace-pre-line text-brand-graphite">
                            {row.contract.notes}
                          </p>
                        ) : null}
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
                        <Link
                          href={`/contracts/new?from=${row.contract.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary !px-3 !py-1 !text-xs"
                        >
                          {t("contracts.copy")}
                        </Link>
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
                                const paidHere = paidByInstallment.get(line.id) ?? 0;
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

                    {/*
                      A payment and a change request belong to the contract, and
                      a contract belongs to one buyer, so both jobs can be done
                      from here rather than sending somebody to another page.
                      The forms and the actions are the contract's own.
                    */}
                    {/*
                      What has been received against this contract, and what the
                      buyer has asked us to change, with the paperwork behind
                      each one. Recorded here or on the contract page, it reads
                      the same in both, which is what the office asked for.
                    */}
                    {mine.payments.length > 0 ? (
                      <div className="mt-3 overflow-x-auto">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>{t("common.date")}</th>
                              <th className="ctr">{t("contracts.amount")}</th>
                              <th>{t("contracts.receipt")}</th>
                              <th>{t("contracts.method")}</th>
                              <th>{t("clients.docsReceipts")}</th>
                              <th className="ctr">{t("common.actions")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mine.payments.map((paid) => (
                              <tr key={paid.id}>
                                <td className="whitespace-nowrap">{day(paid.paidOn, locale)}</td>
                                <td className="ctr font-semibold">
                                  {formatAmount(toCents(paid.amount), locale)}
                                </td>
                                <td>{paid.receiptNumber ?? ""}</td>
                                <td>{howPaid(paid.method)}</td>
                                <td className="text-xs">
                                  {(filesByPayment.get(paid.id) ?? []).map((file) => (
                                    <div key={file.document.id}>
                                      <a
                                        href={`/api/files/${file.document.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-brand-teal-dark hover:underline"
                                      >
                                        {titleWithExtension(file.document)}
                                      </a>
                                    </div>
                                  ))}
                                  {paid.notes ? (
                                    <div className="text-brand-graphite/55">{paid.notes}</div>
                                  ) : null}
                                </td>
                                <td className="ctr">
                                  {/*
                                    The receipt for this payment, which opens to
                                    be read and is only emailed from there.
                                  */}
                                  <Link
                                    href={`/clients/${id}/receipt/${paid.id}`}
                                    className="btn btn-secondary !px-2 !py-1 !text-xs"
                                  >
                                    {t("receipts.open")}
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {mine.requests.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <p className="label">{t("clients.docsChanges")}</p>
                        {mine.requests.map((ask) => (
                          <div
                            key={ask.id}
                            className="rounded border border-brand-line bg-brand-surface px-3 py-2 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold">{ask.title}</span>
                              <span className="flex flex-wrap items-center gap-2 text-xs">
                                {ask.costImpact ? (
                                  <span className="font-semibold">
                                    {formatAmount(toCents(ask.costImpact), locale)}
                                  </span>
                                ) : null}
                                <Pill
                                  tone={
                                    ask.status === "COMPLETED" || ask.status === "APPROVED"
                                      ? "good"
                                      : ask.status === "REJECTED"
                                        ? "bad"
                                        : "warn"
                                  }
                                >
                                  {t(`contracts.changeStatus.${ask.status}` as MessageKey)}
                                </Pill>
                                <span className="text-brand-graphite/55">
                                  {day(ask.requestedOn, locale)}
                                </span>
                              </span>
                            </div>
                            {ask.description ? (
                              <p className="mt-1 text-xs text-brand-graphite/70">
                                {ask.description}
                              </p>
                            ) : null}
                            {(filesByRequest.get(ask.id) ?? []).map((file) => (
                              <div key={file.document.id} className="mt-1 text-xs">
                                <a
                                  href={`/api/files/${file.document.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-teal-dark hover:underline"
                                >
                                  {titleWithExtension(file.document)}
                                </a>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 space-y-2 border-t border-brand-line pt-3">
                      <Disclosure
                        showLabel={t("contracts.recordPayment")}
                        hideLabel={t("common.cancel")}
                      >
                        <PaymentForm
                          action={recordPayment.bind(null, row.contract.id)}
                          lines={lines.map((l) => ({
                            id: l.id,
                            seq: l.seq,
                            label: l.label,
                            amount: formatAmount(toCents(l.totalAmount), locale),
                          }))}
                          labels={{
                            stage: t("contracts.stage"),
                            notAgainstOne: t("contracts.notAgainstOne"),
                            amount: t("contracts.amount"),
                            date: t("common.date"),
                            receipt: t("contracts.receipt"),
                            method: t("contracts.method"),
                            methods: {
                              CASH: t("contracts.method.CASH"),
                              BANK: t("contracts.method.BANK"),
                              CHEQUE: t("contracts.method.CHEQUE"),
                              CARD: t("contracts.method.CARD"),
                              OTHER: t("contracts.method.OTHER"),
                            },
                            chooseMethod: t("contracts.chooseMethod"),
                            files: t("contracts.paymentFiles"),
                            filesNote: t("contracts.paymentFilesNote"),
                            fileTitle: t("contracts.paymentFileTitle"),
                            fileTitlePlaceholder: t("contracts.paymentFileTitlePlaceholder"),
                            save: t("common.save"),
                          }}
                        />
                      </Disclosure>

                      <Disclosure
                        showLabel={t("contracts.addChangeRequest")}
                        hideLabel={t("common.cancel")}
                      >
                        <ChangeRequestForm
                          action={addChangeRequest.bind(null, row.contract.id)}
                          labels={{
                            name: t("common.name"),
                            notes: t("common.notes"),
                            amount: t("contracts.amount"),
                            files: t("common.files"),
                            add: t("common.add"),
                          }}
                        />
                      </Disclosure>
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
                category: t("clients.docType"),
                selectOne: t("clients.docSelectOne"),
                pickFirst: t("clients.docPickFirst"),
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

        {/* 6. Where this client came from, and the way back if it was a mistake. */}
        {fromLead ? (
          <Card title={t("leads.cameFromLead")}>
            <p className="mb-3 text-sm">
              <Link href={`/leads/${fromLead.id}`} className="hover:underline">
                {[fromLead.firstName, fromLead.lastName].filter(Boolean).join(" ") ||
                  t("leads.title")}
              </Link>
              <span className="ml-2 text-xs text-brand-graphite/60">
                {t(`leads.source.${fromLead.sourceKind}` as MessageKey)}
                {fromLead.source ? ` . ${fromLead.source}` : ""}
              </span>
            </p>

            {/*
              What the enquiry said, and everything the office wrote about it,
              here rather than only on the enquiry: the client profile is where
              the work happens now, and the history of how this buyer arrived is
              part of the work.
            */}
            {fromLead.message ? (
              <div className="mb-3 rounded border border-brand-line bg-brand-surface p-2">
                <p className="label">{t("leads.theirWords")}</p>
                <p className="mt-1 text-xs whitespace-pre-wrap">{fromLead.message}</p>
              </div>
            ) : null}

            {enquiryNotes.length > 0 ? (
              <div className="mb-3">
                <p className="label">{t("leads.notes")}</p>
                <ol className="notes mt-1">
                  {enquiryNotes.slice(0, 5).map((note) => (
                    <li key={note.id} className="note">
                      <div className="notewhen">
                        {when(note.createdAt, locale)}
                        {note.writtenBy ? (
                          <span className="notewho">
                            {t("leads.noteBy")} {note.writtenBy}
                          </span>
                        ) : null}
                      </div>
                      <p className="notebody">{note.body}</p>
                    </li>
                  ))}
                </ol>
                {enquiryNotes.length > 5 ? (
                  <Link
                    href={`/leads/${fromLead.id}`}
                    className="mt-2 inline-block text-xs text-brand-teal-dark hover:underline"
                  >
                    {enquiryNotes.length} {t("leads.noteCount")}
                  </Link>
                ) : null}
              </div>
            ) : null}
            {query.undo === "contract" ? (
              <p className="mb-3 rounded border border-[color:var(--color-warning)] bg-white p-2 text-xs text-[color:var(--color-warning)]">
                {t("leads.undoBlocked")}
              </p>
            ) : null}
            <p className="mb-3 text-xs text-brand-graphite/60">{t("leads.undoNote")}</p>
            <form action={undoConversion.bind(null, id)}>
              <button type="submit" className="btn btn-secondary">
                {t("leads.undo")}
              </button>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
