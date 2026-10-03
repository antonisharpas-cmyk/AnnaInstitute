import { optionsFor, shownCode } from "@/lib/choices";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { getContract } from "@/lib/contracts";
import {
  agents,
  clients,
  contracts,
  installments,
  leads,
  payments,
  refunds,
  projects,
  units,
} from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { apartmentsByClient, assignableUnits } from "@/lib/clients";
import { landExchangesForClient } from "@/lib/contracts";
import { appointmentsForClient } from "@/lib/appointments";
import { whoCanGo } from "@/lib/team";
import { whoWhereLabels } from "@/lib/appointmentLabels";
import { buildingChoices } from "@/lib/appointments";
import Appointments from "@/components/Appointments";
import { documentsForClientWithUnits } from "@/lib/documents";
import { notesForLead } from "@/lib/leads";
import { clientFileLabel } from "@/lib/fileLabels";
import { dayAndTime } from "@/lib/when";
import { clientHistory } from "@/lib/clientHistory";
import ClientHistory from "@/components/ClientHistory";
import ClientFollowUps from "@/components/ClientFollowUps";
import { followUpsForClient } from "@/lib/followUps";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import SubmitButton from "@/components/SubmitButton";
import PersonalInfo from "./PersonalInfo";
import { LoanCard, SecondBuyerCard } from "./BuyerCards";
import { extrasLabels } from "@/lib/buyerLabels";
import { buyersName, hasSecondBuyer, mainName, secondName } from "@/lib/buyers";
import DocumentUpload from "@/components/DocumentUpload";
import { undoConversion } from "../../leads/actions";
import {
  assignApartment,
  assignClient,
  closeClient,
  deleteClientDocument,
  reopenClient,
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

/** The six kinds, in the order the office listed them. */

/** The parts of a client, one at a time, apartments first. */
const TABS = ["apartments", "contracts", "appointments", "followups", "documents", "history"] as const;

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ undo?: string; tab?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { locale, t } = await getTranslator();
  const tab = (TABS as readonly string[]).includes(query.tab ?? "") ? (query.tab as (typeof TABS)[number]) : "apartments";

  const found = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  const client = found[0];
  if (!client) notFound();

  // The lead this client was made from, when there was one. It is what makes
  // undoing a conversion possible.
  const leadRows = await db.select().from(leads).where(eq(leads.clientId, id)).limit(1);
  /* The whole story, only when it is the part being read. */
  const history = tab === "history" ? await clientHistory(id, locale) : [];
  const historyLabels = {
    title: t("clients.tab.history"),
    all: t("common.all"),
    none: t("common.none"),
    open: t("common.open"),
    by: t("clients.historyBy"),
    kinds: {
      lead: t("clients.history.lead"),
      client: t("clients.history.client"),
      apartment: t("clients.history.apartment"),
      contract: t("clients.history.contract"),
      appointment: t("clients.history.appointment"),
      followUp: t("clients.history.followUp"),
      payment: t("clients.history.payment"),
      paper: t("clients.history.paper"),
      email: t("clients.history.email"),
      document: t("clients.history.document"),
    },
  };
  const fromLead = leadRows[0];
  const buyerCardLabels = {
    ...extrasLabels(t),
    edit: t("clients.edit"),
    save: t("common.save"),
    cancel: t("common.cancel"),
    secondTitle: t("clients.second.title"),
    secondAdd: t("clients.second.add"),
    secondRemove: t("clients.second.remove"),
    secondNone: t("clients.second.none"),
    loanTitle: t("clients.loan.title"),
    loanNone: t("clients.loan.none"),
    loanYes: t("clients.loan.yes"),
    sure: t("remove.sure"),
  };

  const [assigned, choices, theirDocuments, enquiryNotes] = await Promise.all([
    apartmentsByClient([id]),
    assignableUnits(id),
    documentsForClientWithUnits(id),
    // The record the office kept while this was still a lead.
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

  /*
    The land exchanges this owner signed. They name no single apartment, so the
    query above, which reads a contract through the apartment on it, cannot see
    them. They get their own card, because the office needs the whole agreement
    on the owner's page and not only on the contract's.
  */
  const exchanges = await landExchangesForClient(id);

  /* Where the office is meeting them, what came of the last one, and who is
     free to be given the next one. */
  const [meetings, team, theirFollowUps] = await Promise.all([
    appointmentsForClient(id),
    whoCanGo(),
    tab === "followups" ? followUpsForClient(id) : Promise.resolve([]),
  ]);
  const everyKind = await optionsFor("appointmentType", t, { everything: true });
  const activeKinds = new Set((await optionsFor("appointmentType", t)).map((one) => one.value));

  const contractIds = contractRows.map((r) => r.contract.id);

  /* A contract with the reduced VAT approved is read through getContract
     first, which puts any VAT paid over on the next stage before the figures
     below are taken. */
  for (const row of contractRows) {
    if (row.contract.reducedVatApprovedOn) await getContract(row.contract.id);
  }

  const [scheduleRows, paymentRows, refundRows] = await Promise.all([
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
    /* Paid back by credit note: off the total and off what was paid, as on the contract. */
    contractIds.length > 0
      ? db.select().from(refunds).where(inArray(refunds.contractId, contractIds))
      : Promise.resolve([]),
  ]);
  const refundedByContract = new Map<string, number>();
  for (const r of refundRows) {
    refundedByContract.set(r.contractId, (refundedByContract.get(r.contractId) ?? 0) + toCents(r.amount));
  }


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

  /* The invoices, receipts and credit notes the CRM issues are filed with the
     receipts, which is where the office looks for a buyer's money papers. */
  const PAPERS: Record<string, string[]> = { RECEIPT: ["RECEIPT", "INVOICE", "CREDIT_NOTE", "REFUND_ACK"] };
  const byCategory = (category: string) =>
    theirDocuments
      .filter((row) => category === "SECOND_BUYER" ? row.document.secondBuyer : !row.document.secondBuyer && (PAPERS[category] ?? [category]).includes(row.document.category))
      /* Newest first, by the moment it was filed. */
      .sort((a, b) => new Date(b.document.createdAt).getTime() - new Date(a.document.createdAt).getTime());

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
                    {dayAndTime(doc.createdAt, locale)}
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
        title={buyersName(client)}
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
          exchanges.length > 0 || contractRows.some((row) => row.contract.kind === "LAND_EXCHANGE")
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
        {/*
          Closed, said at the top.

          A client on the Closed list is still a whole record, with their money
          and their papers, so the card opens as normal. But the first thing it
          says is that they walked away, when, and why, so nobody rings them
          about a payment that is no longer due.
        */}
        {client.closedAt ? (
          <div className="card flex flex-wrap items-center justify-between gap-3 border-[color:var(--color-warning)] p-3">
            <div className="text-sm">
              <span className="font-semibold">
                {t("clients.closedOn")} {day(client.closedAt, locale)}
              </span>
              {client.closedReason ? (
                <span className="text-brand-graphite/70">{` . ${client.closedReason}`}</span>
              ) : null}
            </div>
            <form action={reopenClient.bind(null, id)}>
              <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                {t("clients.reopen")}
              </SubmitButton>
            </form>
          </div>
        ) : null}

        {/* 1. Personal information, edited in place. */}
        <PersonalInfo
          client={{
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phone: client.phone,
            idType: client.idType ? shownCode(client.idType, client.idTypeChoice) : null,
            idNumber: client.idNumber,
            country: client.country,
            address: client.address,
            source: shownCode(client.source, client.sourceChoice),
            agentId: client.agentId,
            notes: client.notes,
            birthDate: client.birthDate,
          }}
          agents={(await db.select().from(agents).orderBy(asc(agents.name)))
            .filter((one) => one.isActive || one.id === client.agentId)
            .map((one) => ({ value: one.id, label: one.name, hint: one.email ?? one.phone ?? undefined }))}
          idTypes={await optionsFor("idType", t, {
            current: client.idType ? shownCode(client.idType, client.idTypeChoice) : null,
          })}
          sources={await optionsFor("clientSource", t, { current: shownCode(client.source, client.sourceChoice) })}
          labels={{
            title: t("clients.personal"),
            edit: t("clients.edit"),
            save: t("common.save"),
            cancel: t("common.cancel"),
            name: t("common.name"),
            surname: t("common.surname"),
            email: t("common.email"),
            phone: t("common.phone"),
            idType: t("clients.idType"),
            idNumber: t("clients.idNumber"),
            vatNumber: t("clients.vatNumber"),
            country: t("clients.country"),
            address: t("clients.address"),
            source: t("clients.source"),
            agent: t("clients.referralAgent"),
            choose: t("common.choose"),
            search: t("common.searchByName"),
            noMatch: t("common.noMatch"),
            notes: t("common.notes"),
            notRecorded: t("clients.notRecorded"),
            birthDate: t("clients.birthDate"),
            birthDateHint: t("clients.birthDateHint"),
          }}
        />

        {/* Who in the office looks after this client. */}
        <Card title={t("appointments.assignedTo")}>
          <form action={assignClient.bind(null, client.id)} className="flex flex-wrap items-center gap-2" data-client-assigned>
            <select name="assignedToId" defaultValue={client.assignedToId ?? ""} className="select sm:max-w-xs">
              <option value="">{t("appointments.nobody")}</option>
              {team.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </select>
            <SubmitButton className="btn btn-secondary">{t("common.save")}</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-brand-graphite/60">{t("clients.assignedNote")}</p>
        </Card>

        {/* The second buyer, when the apartment is in two names, and the bank, when a loan pays. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <SecondBuyerCard
            clientId={client.id}
            values={{
              secondFirstName: client.secondFirstName,
              secondLastName: client.secondLastName,
              secondEmail: client.secondEmail,
              secondPhone: client.secondPhone,
              secondIdType: client.secondIdType ? shownCode(client.secondIdType, client.secondIdTypeChoice) : null,
              secondIdNumber: client.secondIdNumber,
              secondAddress: client.secondAddress,
              secondCountry: client.secondCountry,
              secondBirthDate: client.secondBirthDate,
              secondRelation: client.secondRelation,
            }}
            idTypes={await optionsFor("idType", t, {
              current: client.secondIdType ? shownCode(client.secondIdType, client.secondIdTypeChoice) : null,
            })}
            labels={buyerCardLabels}
          />
          <LoanCard
            clientId={client.id}
            values={{
              loan: client.loan,
              loanBank: client.loanBank,
              loanContact: client.loanContact,
              loanEmail: client.loanEmail,
              loanPhone: client.loanPhone,
              loanNotes: client.loanNotes,
            }}
            labels={buyerCardLabels}
          />
        </div>


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

        {/*
          The rest of the client, one part at a time.

          Buttons rather than one long page: the office picks what it came for
          and reads only that. Apartments is open first, since it is what a
          buyer is about. Each part has its own address, so a link can open
          straight on the history, say.
        */}
        <nav className="flex flex-wrap gap-2" aria-label={t("clients.sections")}>
          {TABS.map((one) => (
            <Link
              key={one}
              href={`/clients/${id}?tab=${one}`}
              scroll={false}
              aria-current={tab === one ? "page" : undefined}
              className={tab === one ? "btn btn-primary !px-4 !py-1.5" : "btn btn-secondary !px-4 !py-1.5"}
            >
              {t(`clients.tab.${one}` as MessageKey)}
            </Link>
          ))}
        </nav>

        {tab === "apartments" ? (
          <>
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
                          {t(`units.status.${shownCode(a.status, a.statusChoice)}` as MessageKey)}
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

          </>
        ) : null}

        {tab === "contracts" ? (
          <>
        {/*
          The land exchange, whole, on the owner's own page.

          Everything the office asked to be able to read without opening the
          contract: what kind of transaction it is, the value of the agreement
          and the value the deed states, the VAT, the cash, the plot that came
          in, the share promised, the apartments it has turned into so far, the
          number and date of the contract, and whatever else was agreed. One
          card per agreement, and it stays until the whole thing is finished.
        */}
        {exchanges.map(({ contract, apartments }) => (
          <Card key={contract.id} title={t("contracts.theExchange")}>
            <p className="mb-3 max-w-prose text-xs text-brand-graphite/60">
              {t("contracts.theExchangeOnClient")}
            </p>

            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-3">
              <div>
                <dt className="label">{t("contracts.kind")}</dt>
                <dd className="text-sm font-semibold">{t("contracts.kind.LAND_EXCHANGE")}</dd>
              </div>
              <div>
                <dt className="label">{t("contracts.agreementValue")}</dt>
                <dd className="text-sm font-semibold">
                  {formatAmount(toCents(contract.netPrice), locale)}
                </dd>
              </div>
              <div>
                <dt className="label">{t("contracts.contractValue")}</dt>
                <dd className="text-sm font-semibold">
                  {contract.contractValue
                    ? formatAmount(toCents(contract.contractValue), locale)
                    : formatAmount(toCents(contract.netPrice), locale)}
                </dd>
              </div>
              <div>
                <dt className="label">{t("contracts.vat")}</dt>
                <dd className="text-sm font-semibold">
                  {formatPercent(Number(contract.vatRate), locale)}
                </dd>
              </div>
              <div>
                <dt className="label">{t("contracts.cash")}</dt>
                <dd className="text-sm font-semibold">
                  {contract.cashAmount
                    ? formatAmount(toCents(contract.cashAmount), locale)
                    : t("common.none")}
                </dd>
              </div>
              <div>
                <dt className="label">{t("contracts.contractNumber")}</dt>
                <dd className="text-sm font-semibold">{contract.reference}</dd>
              </div>
              <div>
                <dt className="label">{t("contracts.contractDate")}</dt>
                <dd className="text-sm font-semibold">
                  {contract.contractDate
                    ? new Date(contract.contractDate).toLocaleDateString(locale)
                    : t("common.none")}
                </dd>
              </div>
              <div>
                <dt className="label">{t("common.status")}</dt>
                <dd className="text-sm">
                  <Pill tone={contract.status === "COMPLETED" ? "good" : "warn"}>
                    {t(`contracts.status.${shownCode(contract.status, contract.statusChoice)}` as MessageKey)}
                  </Pill>
                </dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="label">{t("contracts.thePlot")}</dt>
                <dd className="text-sm">
                  <span className="font-semibold">
                    {contract.plotDescription ?? t("common.none")}
                  </span>
                  <div className="text-xs text-brand-graphite/60">
                    {[
                      contract.plotReference,
                      contract.plotArea ? `${Number(contract.plotArea)} m2` : null,
                    ]
                      .filter(Boolean)
                      .join(" . ")}
                  </div>
                </dd>
              </div>
              {contract.notes ? (
                <div className="sm:col-span-3">
                  <dt className="label">{t("contracts.extraAgreement")}</dt>
                  <dd className="text-sm whitespace-pre-line">{contract.notes}</dd>
                </div>
              ) : null}
              <div className="sm:col-span-3">
                <dt className="label">{t("contracts.exchangeApartments")}</dt>
                <dd className="text-sm">
                  {apartments.length === 0 ? (
                    <span className="text-brand-graphite/50">
                      {t("contracts.noExchangeApartments")}
                    </span>
                  ) : (
                    <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                      {apartments.map(({ unit, project }) => (
                        <li key={unit.id}>
                          <Link
                            href={`/projects/${project.id}/units/${unit.id}`}
                            className="font-semibold text-brand-teal-dark hover:underline"
                            prefetch={false}
                          >
                            {unit.code}
                          </Link>{" "}
                          <span className="text-xs text-brand-graphite/60">{project.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-3">
              <Link
                href={`/contracts/${contract.id}`}
                className="btn btn-secondary !px-3 !py-1 !text-xs"
                prefetch={false}
              >
                {t("contracts.openTheContract")}
              </Link>
            </div>
          </Card>
        ))}

        {/*
          3. Their contracts, as a short list.

          The office works a contract on the contract's own page: the schedule,
          the payments, the VAT and the papers are all there, and one place for
          them is clearer than two. So the profile only says which contracts
          this client has and where each stands, with the way in.
        */}
        <Card title={t("contracts.title")}>
          {contractSubjects.length === 0 ? (
            <Empty message={t("clients.noApartments")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("contracts.title")}</th>
                    <th>{t("clients.apartments")}</th>
                    <th className="ctr">{t("common.total")}</th>
                    <th className="ctr">{t("contracts.paid")}</th>
                    <th className="ctr">{t("contracts.balance")}</th>
                    <th className="ctr">{t("common.status")}</th>
                    <th className="ctr">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {contractSubjects.map((apartment) => {
                    const row = contractRows.find((c) => c.unit.id === apartment.unitId);
                    if (!row) {
                      return (
                        <tr key={apartment.unitId}>
                          <td className="text-brand-graphite/60">{t("clients.noContractYet")}</td>
                          <td>
                            {apartment.projectName} {apartment.code}
                          </td>
                          <td colSpan={4} />
                          <td className="ctr">
                            <Link
                              href={`/contracts/new?client=${id}&unit=${apartment.unitId}`}
                              className="btn btn-primary !px-3 !py-1 !text-xs"
                            >
                              {t("clients.newContract")}
                            </Link>
                          </td>
                        </tr>
                      );
                    }
                    const back = refundedByContract.get(row.contract.id) ?? 0;
                    const scheduled =
                      scheduleRows
                        .filter((l) => l.contractId === row.contract.id)
                        .reduce((a, l) => a + toCents(l.totalAmount), 0) - back;
                    const paid = (paidByContract.get(row.contract.id) ?? 0) - back;
                    return (
                      <tr key={apartment.unitId}>
                        <td>
                          <Link
                            href={`/contracts/${row.contract.id}`}
                            className="font-semibold text-brand-teal-dark hover:underline"
                          >
                            {row.contract.reference}
                          </Link>
                        </td>
                        <td>
                          {row.project.name} {row.unit.code}
                        </td>
                        <td className="ctr">{formatAmount(scheduled, locale)}</td>
                        <td className="ctr">
                          {formatAmount(paid, locale)}
                          {back > 0 ? (
                            <span className="block text-xs text-[color:var(--color-negative)]" data-client-paid-back>
                              {t("refunds.paidBack")} {formatAmount(back, locale)}
                            </span>
                          ) : null}
                        </td>
                        <td className="ctr font-semibold">
                          {formatAmount(Math.max(0, scheduled - paid), locale)}
                        </td>
                        <td className="ctr">
                          {scheduled > 0 && paid >= scheduled ? (
                            <Pill tone="good">{t("contracts.paidInFull")}</Pill>
                          ) : (
                            <Pill tone={row.contract.status === "CANCELLED" ? "bad" : "neutral"}>
                              {t(`contracts.status.${shownCode(row.contract.status, row.contract.statusChoice)}` as MessageKey)}
                            </Pill>
                          )}
                        </td>
                        <td className="ctr">
                          <Link
                            href={`/contracts/${row.contract.id}`}
                            className="btn btn-secondary !px-3 !py-1 !text-xs"
                          >
                            {t("clients.openContract")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
          </>
        ) : null}

        {tab === "appointments" ? (
          <>
        {/*
          Where we are meeting them. High on the card on purpose: it is the
          thing about a buyer that is happening this week, and the day after a
          viewing it is the thing somebody has to answer for.
        */}
        <Appointments
          rows={meetings}
          with={`client:${id}`}
          locale={locale}
          labels={{
            title: t("appointments.title"),
            waiting: t("appointments.waiting"),
            waitingHint: t("appointments.waitingHint"),
            next: t("appointments.next"),
            been: t("appointments.been"),
            none: t("appointments.none"),
            add: t("appointments.add"),
            place: t("appointments.place"),
            placeHint: t("appointments.placeHint"),
            day: t("appointments.day"),
            time: t("appointments.time"),
            save: t("common.save"),
            cancel: t("common.cancel"),
            itHappened: t("appointments.itHappened"),
            itDidNot: t("appointments.itDidNot"),
            statusDone: t("appointments.done"),
            statusMissed: t("appointments.missed"),
            statusPlanned: t("appointments.pending"),
            move: t("appointments.move"),
            remove: t("common.delete"),
            sure: t("remove.sure"),
            type: t("appointments.type"),
            /* The kinds as the office has them in the Builder, and any older
               one these appointments still carry. */
            kinds: everyKind.filter(
              (one) => activeKinds.has(one.value) || meetings.some((row) => row.type === one.value),
            ),
            kindOf: Object.fromEntries(everyKind.map((one) => [one.value, one.label])),
            typeOther: t("appointments.typeOther"),
            typeOtherHint: t("appointments.typeOtherHint"),
            assignedTo: t("appointments.assignedTo"),
            assignTo: t("appointments.assignTo"),
            nobody: t("appointments.nobody"),
            team,
            whoWhere: whoWhereLabels(t),
            buildings: await buildingChoices(),
          }}
        />
          </>
        ) : null}

        {tab === "followups" ? (
          <ClientFollowUps clientId={id} rows={theirFollowUps} team={team} defaultMember={client.assignedToId ?? ""} locale={locale} t={t} />
        ) : null}

        {tab === "documents" ? (
          <>
        {/* 4. Documents. The form is first, because adding is the common job. */}
        <Card title={t("contracts.documents")}>
          <div className="mb-5 rounded border border-brand-line bg-brand-surface p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
              {t("clients.docsAdd")}
            </h3>
            <DocumentUpload
              action={uploadClientDocuments.bind(null, id)}
              idNumber={client.idNumber ?? ""}
              people={
                hasSecondBuyer(client)
                  ? [
                      { value: "1", label: mainName(client), idNumber: client.idNumber ?? "" },
                      { value: "2", label: `${secondName(client)}, ${t("clients.second.title").toLowerCase()}`, idNumber: client.secondIdNumber ?? "" },
                    ]
                  : undefined
              }
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
                whose: t("clients.second.whose"),
              }}
            />
          </div>

          {documentSection(t("clients.docsIdentification"), "IDENTIFICATION")}
          {documentSection(t("clients.docsContract"), "CONTRACT")}
          {documentSection(t("clients.docsReceipts"), "RECEIPT")}
          {documentSection(t("clients.docsChanges"), "CHANGE_REQUEST")}
          {documentSection(t("clients.docsOther"), "OTHER")}
          {hasSecondBuyer(client) || theirDocuments.some((row) => row.document.secondBuyer)
            ? documentSection(
                `${t("clients.second.docs")}${hasSecondBuyer(client) ? `, ${secondName(client)}` : ""}`,
                "SECOND_BUYER",
              )
            : null}
        </Card>
          </>
        ) : null}

        {tab === "history" ? (
          <ClientHistory events={history} locale={locale} labels={historyLabels} />
        ) : null}




        {/* 6. Where this client came from, and the way back if it was a mistake. */}
        {fromLead ? (
          <Card title={t("leads.cameFromLead")}>
            <p className="mb-3 text-sm">
              <Link href={`/leads/${fromLead.id}`} className="hover:underline">
                {[fromLead.firstName, fromLead.lastName].filter(Boolean).join(" ") ||
                  t("leads.title")}
              </Link>
              <span className="ml-2 text-xs text-brand-graphite/60">
                {t(`leads.source.${shownCode(fromLead.sourceKind, fromLead.sourceChoice)}` as MessageKey)}
                {fromLead.source ? ` . ${fromLead.source}` : ""}
              </span>
            </p>

            {/*
              What the lead said, and everything the office wrote about it,
              here rather than only on the lead: the client profile is where
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

        {/*
          Closing a client who walked away.

          At the foot of the card, behind a button, with the reason asked for,
          because it releases an apartment and cancels a contract. It says so
          in plain words before anybody presses it.
        */}
        {client.closedAt ? null : (
          <div className="rounded border border-brand-line bg-brand-surface p-3">
            <Disclosure showLabel={t("clients.close")} hideLabel={t("common.cancel")} tone="secondary">
              <form action={closeClient.bind(null, id)} className="space-y-2">
                <p className="max-w-prose text-xs text-brand-graphite/70">{t("clients.closeWhat")}</p>
                <div>
                  <label className="label" htmlFor="closeReason">
                    {t("clients.closeReason")}
                  </label>
                  <input
                    id="closeReason"
                    name="reason"
                    placeholder={t("clients.closeReasonHint")}
                    className="input"
                  />
                </div>
                <SubmitButton className="btn btn-danger">{t("clients.closeConfirm")}</SubmitButton>
              </form>
            </Disclosure>
          </div>
        )}
      </div>
    </>
  );
}
