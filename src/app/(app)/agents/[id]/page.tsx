import Link from "next/link";
import { dayAndTime } from "@/lib/when";
import { notFound } from "next/navigation";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { agents, campaigns, commissionPayments, documents, shareLinks } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { amountForInput } from "@/lib/money";
import { commissionDue, commissionTotals, papersFor, salesOfAgent, salesWithoutAnAgent } from "@/lib/commissions";
import CommissionChoice from "@/components/CommissionChoice";
import { commissionModeOf } from "@/lib/commissionChoice";
import CommissionRecord from "./CommissionRecord";
import VatFields from "@/components/VatFields";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import SubmitButton from "@/components/SubmitButton";
import DateField from "@/components/DateField";
import { birthdayText } from "@/lib/buyers";
import { TITLES, titleWord } from "@/lib/titles";
import ProfileCard from "@/components/ProfileCard";
import DeleteRecord from "@/components/DeleteRecord";
import DocumentList from "@/components/DocumentList";
import PartyInvoices from "@/components/PartyInvoices";
import Pagination, { pageOf, pageWords } from "@/components/Pagination";
import ConfirmButton from "@/components/ConfirmButton";
import { whatGoesWithAgent } from "@/lib/deletes";
import { agentCampaignChannel } from "@/lib/textChannel";
import {
  addExtra,
  deleteAgent,
  deleteAgentAgreement,
  saveAgentProfile,
  uploadAgentAgreement,
  deleteCommissionPayment,
  payLine,
  recordCommissionPayment,
  recordSale,
  removeCommissionLine,
  removeCommissionPaper,
  setLineVatRate,
  setSaleRate,
  uploadCommissionPaper,
} from "../actions";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salesPage?: string; paidPage?: string; openedPage?: string }>;
}) {
  const { id } = await params;
  const pages = await searchParams;
  const { locale, t } = await getTranslator();

  const found = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  const agent = found[0];
  if (!agent) notFound();

  const [sales, paidOut, totals, unclaimed, opened, agreement] = await Promise.all([
    salesOfAgent(id),
    db
      .select()
      .from(commissionPayments)
      .where(eq(commissionPayments.agentId, id))
      .orderBy(desc(commissionPayments.paidOn)),
    commissionTotals(id),
    // Contracts nobody is named on yet, which is what a sale recorded by hand
    // attaches to.
    salesWithoutAnAgent(),
    /* The campaign files they opened, by their own link. */
    db
      .select({ link: shareLinks, title: campaigns.title })
      .from(shareLinks)
      .leftJoin(campaigns, eq(campaigns.id, shareLinks.campaignId))
      .where(and(eq(shareLinks.agentId, id), gt(shareLinks.openCount, 0)))
      .orderBy(desc(shareLinks.lastOpenedAt)),
    /* The agreement signed with them, every version kept. */
    db.select().from(documents).where(eq(documents.agentId, id)).orderBy(desc(documents.createdAt)),
  ]);

  const goes = await whatGoesWithAgent(id);

  /* The two papers filed against every commission line on this page. */
  const papers = await papersFor(sales.flatMap((sale) => sale.lines.map((line) => line.id)));

  /* Every list on the page ten at a time, each with its own page numbers; the figures above count them all. */
  const salesShown = pageOf(sales, pages, 10, "salesPage");
  const paidShown = pageOf(paidOut, pages, 10, "paidPage");
  const openedShown = pageOf(opened, pages, 10, "openedPage");

  return (
    <>
      <BackLink href="/agents" label={`${t("common.backTo")} ${t("agents.title").toLowerCase()}`} />
      <PageHeader
        title={agent.name}
        subtitle={[agent.company, agent.email, agent.phone].filter(Boolean).join(" . ")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={agent.isActive ? "good" : "warn"}>
              {agent.isActive ? t("agents.active") : t("agents.inactive")}
            </Pill>
            <Link href={`/agents/${id}/edit`} className="btn btn-secondary">
              {t("common.edit")}
            </Link>
          </div>
        }
      />

      {/*
        The three figures the office asks for by name, at the top where they are
        read: what this agent has earned, what has actually been paid to them,
        and what is still owed. Paid is the money recorded against the
        commission lines, installment by installment, so the three always agree
        with the payments below rather than with a rate on paper.
      */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label={t("agents.rate")}
          value={formatPercent(Number(agent.commissionRate), locale)}
        />
        {/* A sale that fell through is not one of the agent's sales. */}
        <Stat
          label={t("agents.sales")}
          value={String(sales.filter((sale) => sale.contract.status !== "CANCELLED").length)}
        />
        {/* What the agent invoices and is paid, VAT included, with the figure before VAT under it. */}
        <Stat
          label={t("agents.generated")}
          value={formatAmount(totals.generatedTotalCents, locale)}
          hint={`${formatAmount(totals.generatedCents, locale)} ${t("vat.beforeVatShort")}`}
        />
        <Stat
          label={t("agents.paidOut")}
          value={formatAmount(totals.paidTotalCents, locale)}
          hint={`${formatAmount(totals.paidCents, locale)} ${t("vat.beforeVatShort")}`}
        />
        <Stat
          label={t("agents.owed")}
          value={formatAmount(totals.outstandingTotalCents, locale)}
          hint={`${formatAmount(totals.outstandingCents, locale)} ${t("vat.beforeVatShort")}`}
        />
      </div>

      {/* One column, top to bottom: the agent, the sales, what was paid. */}
      <div className="mb-4 space-y-4">
        <div>
          <ProfileCard
            title={t("agents.profile")}
            action={saveAgentProfile.bind(null, id)}
            labels={{ edit: t("common.edit"), save: t("common.save"), cancel: t("common.cancel") }}
            fields={[
              {
                name: "title",
                label: t("clients.salutation"),
                value: agent.title ?? "",
                display: titleWord(agent.title),
                kind: "select",
                options: [{ value: "", label: t("clients.salutationNone") }, ...TITLES.map((one) => ({ value: one, label: titleWord(one) }))],
              },
              { name: "name", label: t("common.name"), value: agent.name, required: true },
              { name: "company", label: t("subowners.company"), value: agent.company ?? "" },
              { name: "email", label: t("leads.email"), value: agent.email ?? "", kind: "email" },
              { name: "phone", label: t("leads.phone"), value: agent.phone ?? "" },
              {
                name: "birthDate",
                label: t("people.birthDate"),
                value: agent.birthDate ?? "",
                display: birthdayText(agent.birthDate, locale),
                kind: "date",
                hint: t("people.birthDateHint"),
              },
              {
                name: "campaignChannel",
                label: t("agents.campaignChannel"),
                value: agentCampaignChannel(agent.campaignChannel),
                display: t(`agents.channel.${agentCampaignChannel(agent.campaignChannel)}` as MessageKey),
                kind: "select",
                options: [
                  { value: "EMAIL", label: t("agents.channel.EMAIL") },
                  { value: "SMS", label: t("agents.channel.SMS") },
                  { value: "BOTH", label: t("agents.channel.BOTH") },
                ],
              },
              {
                name: "commissionRate",
                label: t("agents.rate"),
                value: String(Number(agent.commissionRate)),
                display: formatPercent(Number(agent.commissionRate), locale),
                kind: "number",
              },
              {
                name: "vatRate",
                label: t("agents.vatRate"),
                value: String(Number(agent.vatRate)),
                display: formatPercent(Number(agent.vatRate), locale),
                kind: "number",
                hint: t("agents.vatRateHint"),
              },
              { name: "address", label: t("clients.address"), value: agent.address ?? "" },
              { name: "country", label: t("clients.country"), value: agent.country ?? "" },
              { name: "vatNumber", label: t("subowners.vatNumber"), value: agent.vatNumber ?? "" },
              {
                name: "licenceNumber",
                label: t("agents.licenceNumber"),
                value: agent.licenceNumber ?? "",
              },
              { name: "website", label: t("agents.website"), value: agent.website ?? "" },
              {
                name: "isActive",
                label: t("common.status"),
                kind: "checkbox",
                checked: agent.isActive,
                display: agent.isActive ? t("agents.active") : t("agents.inactive"),
                hint: t("agents.active"),
              },
              {
                name: "notes",
                label: t("common.notes"),
                kind: "textarea",
                value: agent.notes ?? "",
              },
            ]}
          />
        </div>

        {/* The agreement signed with the agent: a title and the file, or several. */}
        <Card title={t("agents.agreement")}>
          <form action={uploadAgentAgreement.bind(null, id)} className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-agent-agreement>
            <div>
              <label className="label" htmlFor="agentAgreementTitle">
                {t("common.title")}
              </label>
              <input id="agentAgreementTitle" name="title" required placeholder={t("agents.agreementTitleHint")} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="agentAgreementFiles">
                {t("common.files")}
              </label>
              <input id="agentAgreementFiles" name="files" type="file" multiple required accept="image/*,application/pdf,.doc,.docx" className="input !py-1.5 text-xs" />
            </div>
            <SubmitButton>{t("common.add")}</SubmitButton>
          </form>
          <DocumentList
            items={agreement}
            emptyMessage={t("agents.noAgreement")}
            locale={locale}
            action={(doc) => (
              <ConfirmButton action={deleteAgentAgreement.bind(null, doc.id, id)} label={t("common.delete")} confirm={t("remove.sure")} />
            )}
          />
        </Card>

        <PartyInvoices kind="AGENT" id={id} t={t} locale={locale} />

        <div className="space-y-4">
          {/* What he sold, and what each sale earns him. */}
          <div id="agent-sales" className="scroll-mt-24">
          <Card title={t("agents.sales")}>
            {/*
              A sale recorded by hand, for the apartments whose contract was
              written without naming anybody. The commission itself still waits
              for the first installment, exactly as it does for a sale that came
              in the ordinary way.
            */}
            <div className="mb-4">
              <Disclosure showLabel={t("agents.recordSale")} hideLabel={t("common.cancel")}>
                <form
                  action={recordSale.bind(null, id)}
                  className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-3"
                >
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="contractId">
                      {t("agents.saleApartment")}
                    </label>
                    <select id="contractId" name="contractId" required className="select">
                      <option value="">{t("agents.chooseSale")}</option>
                      {unclaimed.map((one) => (
                        <option key={one.contractId} value={one.contractId}>
                          {one.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="saleRate">
                      {t("agents.rateOnThisSale")}
                    </label>
                    <input
                      id="saleRate"
                      name="rate"
                      inputMode="decimal"
                      placeholder={String(Number(agent.commissionRate))}
                      className="input"
                    />
                  </div>
                  <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                    <SubmitButton>{t("common.save")}</SubmitButton>
                    <p className="text-xs text-brand-graphite/60">{t("agents.saleNote")}</p>
                  </div>
                </form>
              </Disclosure>
            </div>

            {sales.length === 0 ? (
              <Empty message={t("agents.noSales")} />
            ) : (
              <div className="space-y-4">
                {salesShown.rows.map((sale) => (
                  <div
                    key={sale.contract.id}
                    className="rounded border border-brand-line bg-white px-3 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/contracts/${sale.contract.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-brand-teal-dark hover:underline"
                        >
                          {sale.project && sale.unit
                            ? `${sale.project.name} ${sale.unit.code}`
                            : sale.contract.reference}
                        </Link>
                        <div className="text-xs text-brand-graphite/60">
                          {sale.client ? `${sale.client.firstName} ${sale.client.lastName} . ` : ""}
                          {sale.contract.reference}
                        </div>
                        <div className="mt-1 text-xs text-brand-graphite/60">
                          {t("agents.soldFor")} {formatAmount(sale.soldCents, locale)}
                          {sale.listPriceCents > 0
                            ? ` . ${t("agents.listedAt")} ${formatAmount(sale.listPriceCents, locale)}`
                            : ""}
                          {sale.differenceCents > 0 ? (
                            <span className="ml-1 font-semibold text-[color:var(--color-positive)]">
                              +{formatAmount(sale.differenceCents, locale)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* What was agreed on this sale alone: another rate, a fixed amount, or no commission. */}
                      <form
                        action={setSaleRate.bind(null, sale.contract.id, id)}
                        className="w-full max-w-sm space-y-2"
                        data-sale-commission
                      >
                        <CommissionChoice
                          compact
                          agentRate={Number(agent.commissionRate)}
                          baseCents={sale.value.fullCents}
                          defaults={{
                            mode: commissionModeOf(sale.contract),
                            rate: sale.contract.commissionRate ? String(Number(sale.contract.commissionRate)) : "",
                            fixed: sale.contract.commissionFixed ? String(Number(sale.contract.commissionFixed)) : "",
                            noCommission: sale.contract.noCommission,
                          }}
                          locale={locale}
                          labels={{
                            title: t("commission.title"),
                            standard: t("commission.standard"),
                            otherRate: t("commission.otherRate"),
                            fixed: t("commission.fixed"),
                            beforeVat: t("commission.beforeVat"),
                            noCommission: t("commission.none"),
                            noCommissionHint: t("commission.noneHint"),
                            fixedPreview: t("commission.fixedPreview"),
                            of: t("common.of"),
                            vatTail: t("commission.vatTail"),
                          }}
                        />
                        <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                          {t("commission.save")}
                        </button>
                      </form>
                    </div>

                    {sale.contract.status === "CANCELLED" && sale.lines.length === 0 ? (
                      <p className="mt-3 rounded border border-dashed border-brand-line bg-brand-surface p-3 text-sm font-semibold text-[color:var(--color-negative)]">
                        {t("agents.saleCancelled")}
                      </p>
                    ) : sale.lines.length === 0 && sale.contract.noCommission ? (
                      <p className="mt-3 rounded border border-dashed border-brand-line bg-brand-surface p-3 text-sm text-brand-graphite/70" data-no-commission-sale>
                        {t("commission.noneOnSale")}
                      </p>
                    ) : sale.lines.length === 0 ? (
                      /*
                        Nothing earned yet is not the same as nothing to say.
                        Left as an empty table with a nought in it, the page
                        looks broken to somebody who has just named an agent on
                        a sale. So it does the sum anyway, shows what the
                        commission will be, and says the one thing that has to
                        happen for it to become real.
                      */
                      <div className="mt-3 rounded border border-dashed border-brand-line bg-brand-surface p-3">
                        <p className="text-sm font-semibold">
                          {(() => {
                            const due = commissionDue(sale.contract, agent.commissionRate);
                            return due.rate === null
                              ? `${t("commissions.fixedAmount")} . ${formatAmount(due.amountCents, locale)}`
                              : `${formatPercent(due.rate, locale)} ${t("common.of")} ${formatAmount(due.fullCents, locale)} . ${formatAmount(due.amountCents, locale)}`;
                          })()}
                        </p>
                        <p className="mt-1 text-xs text-brand-graphite/70">
                          {t("commissions.notYetEarned")}
                        </p>
                      </div>
                    ) : null}

                    {/* The sale in one line: when its commission was generated,
                        how much, how much is paid, and where it stands. The
                        figures and the two papers open underneath on a click. */}
                    {sale.lines.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                        <span>
                          <span className="text-xs text-brand-graphite/60">{t("commissions.generatedOn")} </span>
                          <span className="font-semibold">
                            {dayAndTime(
                              sale.lines.reduce<Date | null>(
                                (first, l) => (!first || l.generatedAt < first ? l.generatedAt : first),
                                null,
                              ),
                              locale,
                            )}
                          </span>
                        </span>
                        <span>
                          <span className="text-xs text-brand-graphite/60">{t("agents.generated")} </span>
                          <span className="font-semibold">{formatAmount(sale.generatedTotalCents, locale)}</span>
                          <span className="text-xs text-brand-graphite/60"> {t("vat.withVatShort")}</span>
                        </span>
                        <span>
                          <span className="text-xs text-brand-graphite/60">{t("agents.paidOut")} </span>
                          <span className="font-semibold">{formatAmount(sale.paidTotalCents, locale)}</span>
                          <span className="text-xs text-brand-graphite/60"> {t("vat.withVatShort")}</span>
                        </span>
                        {sale.lines.every((l) => papers.get(l.id)?.complete) ? (
                          <Pill tone="good">{t("commissions.completed")}</Pill>
                        ) : sale.lines.every((l) => l.status === "CANCELLED") ? (
                          <Pill tone="bad">{t("commissions.cancelled")}</Pill>
                        ) : (
                          <Pill tone="warn">{t("commissions.pending")}</Pill>
                        )}
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <Disclosure
                        showLabel={t("agents.showDetails")}
                        hideLabel={t("agents.hideDetails")}
                        tone="secondary"
                      >
                    <div
                      className={`mt-3 overflow-x-auto${sale.lines.length === 0 ? " hidden" : ""}`}
                    >
                      <table className="data">
                        <thead>
                          <tr>
                            <th>{t("commissions.line")}</th>
                            <th className="ctr">{t("commissions.base")}</th>
                            <th className="ctr">{t("agents.rate")}</th>
                            <th className="ctr">{t("vat.beforeVat")}</th>
                            <th className="ctr">{t("vat.rate")}</th>
                            <th className="ctr">{t("vat.vat")}</th>
                            <th className="ctr">{t("vat.withVat")}</th>
                            <th className="ctr">{t("agents.paidOut")}</th>
                            <th className="ctr">{t("common.status")}</th>
                            <th className="ctr">{t("common.actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sale.lines.map((line) => (
                            <tr key={line.id}>
                              <td>
                                {line.kind === "RATE"
                                  ? t("commissions.onThePrice")
                                  : (line.label ?? t("commissions.extra"))}
                              </td>
                              <td className="ctr">
                                {line.kind === "RATE" ? formatAmount(line.baseCents, locale) : ""}
                              </td>
                              <td className="ctr">
                                {line.kind === "RATE"
                                  ? sale.contract.commissionFixed != null
                                    ? t("commissions.fixedAmount")
                                    : formatPercent(line.rate, locale)
                                  : ""}
                              </td>
                              <td className="ctr">{formatAmount(line.amountCents, locale)}</td>
                              <td className="ctr">
                                {/* The VAT on this line, the agent's rate unless changed here. */}
                                <form action={setLineVatRate.bind(null, line.id, id)} className="flex items-center justify-center gap-1">
                                  <input
                                    name="vatRate"
                                    defaultValue={line.vatRate}
                                    inputMode="decimal"
                                    aria-label={t("vat.rate")}
                                    className="input !w-14 !px-1 !py-0.5 text-center !text-xs"
                                    data-line-vat
                                  />
                                  <button type="submit" className="btn btn-secondary !px-1.5 !py-0.5 !text-xs">
                                    {t("common.save")}
                                  </button>
                                </form>
                              </td>
                              <td className="ctr">{formatAmount(line.vatCents, locale)}</td>
                              <td className="ctr font-semibold">{formatAmount(line.totalCents, locale)}</td>
                              <td className="ctr">{formatAmount(line.paidTotalCents, locale)}</td>
                              <td className="ctr">
                                {/*
                                  One meaning of finished, not two. The papers
                                  below decide it, so this says the same thing
                                  they do rather than a second story told by the
                                  payments.
                                */}
                                <Pill tone={papers.get(line.id)?.complete ? "good" : "warn"}>
                                  {papers.get(line.id)?.complete
                                    ? t("commissions.completed")
                                    : t("commissions.notCompleted")}
                                </Pill>
                              </td>
                              <td className="ctr">
                                <div className="flex flex-wrap justify-center gap-1">
                                  {line.outstandingCents > 0 ? (
                                    <form action={payLine.bind(null, line.id, id)}>
                                      <button
                                        type="submit"
                                        className="btn btn-secondary !px-2 !py-1 !text-xs"
                                      >
                                        {t("commissions.markPaid")}
                                      </button>
                                    </form>
                                  ) : null}
                                  {line.kind === "EXTRA" && line.paidCents === 0 ? (
                                    <form action={removeCommissionLine.bind(null, line.id, id)}>
                                      <button
                                        type="submit"
                                        className="btn btn-secondary !px-2 !py-1 !text-xs"
                                      >
                                        {t("common.delete")}
                                      </button>
                                    </form>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3}>{t("agents.generated")}</td>
                            <td className="ctr">{formatAmount(sale.generatedCents, locale)}</td>
                            <td />
                            <td className="ctr">{formatAmount(sale.generatedTotalCents - sale.generatedCents, locale)}</td>
                            <td className="ctr font-semibold">{formatAmount(sale.generatedTotalCents, locale)}</td>
                            <td className="ctr">{formatAmount(sale.paidTotalCents, locale)}</td>
                            <td className="ctr" colSpan={2}>
                              {t("agents.owed")} {formatAmount(sale.outstandingTotalCents, locale)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {sale.lines.map((line) => {
                      const mine = papers.get(line.id) ?? {
                        invoice: null,
                        receipt: null,
                        complete: false,
                      };
                      const where =
                        sale.project && sale.unit
                          ? `${sale.project.name} ${sale.unit.code}`
                          : sale.contract.reference;

                      const missing = mine.invoice
                        ? mine.receipt
                          ? null
                          : t("commissions.waitingReceipt")
                        : mine.receipt
                          ? t("commissions.waitingInvoice")
                          : t("commissions.waitingBoth");

                      return (
                        <CommissionRecord
                          key={line.id}
                          papers={mine}
                          headline={`${t("commissions.title")} . ${where}`}
                          workedOut={
                            line.kind === "RATE"
                              ? `${
                                  sale.contract.commissionFixed != null
                                    ? t("commissions.fixedAmount")
                                    : `${formatPercent(line.rate, locale)} ${t("common.of")} ${formatAmount(line.baseCents, locale)} . ${t(
                                        "commissions.fullValue",
                                      ).toLowerCase()}`
                                } . ${formatAmount(
                                  line.amountCents,
                                  locale,
                                )} ${t("vat.beforeVatShort")} + ${t("vat.vat")} ${formatPercent(line.vatRate, locale)} ${formatAmount(
                                  line.vatCents,
                                  locale,
                                )} = ${formatAmount(line.totalCents, locale)}`
                              : `${line.label ?? t("commissions.extra")} . ${formatAmount(
                                  line.amountCents,
                                  locale,
                                )} ${t("vat.beforeVatShort")} + ${t("vat.vat")} ${formatPercent(line.vatRate, locale)} ${formatAmount(
                                  line.vatCents,
                                  locale,
                                )} = ${formatAmount(line.totalCents, locale)}`
                          }
                          madeUpOf={null}
                          generatedOn={`${dayAndTime(line.generatedAt, locale)} . ${t("commissions.onFirstPayment")}`}
                          completedOn={dayAndTime(line.completedAt, locale) || null}
                          waitingFor={missing}
                          upload={async (kind, formData) => {
                            "use server";
                            await uploadCommissionPaper(line.id, id, kind, formData);
                          }}
                          remove={async (documentId) => {
                            "use server";
                            await removeCommissionPaper(documentId, line.id, id);
                          }}
                          labels={{
                            record: t("commissions.recordNote"),
                            completed: t("commissions.completed"),
                            waiting: t("commissions.notCompleted"),
                            invoice: t("commissions.agentInvoice"),
                            invoiceHint: t("commissions.agentInvoiceHint"),
                            receipt: t("commissions.agentReceipt"),
                            receiptHint: t("commissions.agentReceiptHint"),
                            open: t("common.open"),
                            replace: t("common.delete"),
                            add: t("common.add"),
                            generated: t("commissions.generatedOn"),
                          }}
                        />
                      );
                    })}

                    <div className="mt-3">
                      <Disclosure
                        showLabel={t("commissions.addExtra")}
                        hideLabel={t("common.cancel")}
                        tone="secondary"
                      >
                        <form
                          action={addExtra.bind(null, sale.contract.id)}
                          className="flex flex-wrap items-end gap-2 rounded border border-brand-line bg-brand-surface p-3"
                        >
                          <div>
                            <label className="label" htmlFor={`label-${sale.contract.id}`}>
                              {t("commissions.whatFor")}
                            </label>
                            <input
                              id={`label-${sale.contract.id}`}
                              name="label"
                              defaultValue={
                                sale.differenceCents > 0 ? t("commissions.aboveThePrice") : ""
                              }
                              placeholder={t("commissions.aboveThePrice")}
                              className="input !w-64 !py-1 !text-xs"
                            />
                          </div>
                          <VatFields
                            idPrefix={`extra-${sale.contract.id}`}
                            compact
                            locale={locale}
                            defaultAmount={sale.differenceCents > 0 ? amountForInput(sale.differenceCents / 100) : ""}
                            defaultRate={Number(agent.vatRate)}
                            labels={{
                              amount: t("vat.amountBeforeVat"),
                              rate: t("vat.rate"),
                              vat: t("vat.vat"),
                              total: t("vat.withVat"),
                            }}
                          />
                          <button type="submit" className="btn btn-primary !px-3 !py-1 !text-xs">
                            {t("common.add")}
                          </button>
                          <p className="w-full text-xs text-brand-graphite/60">
                            {t("commissions.extraNote")}
                          </p>
                        </form>
                      </Disclosure>
                    </div>
                      </Disclosure>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pagination basePath={`/agents/${id}`} params={pages} pageKey="salesPage" anchor="agent-sales" info={salesShown.info} labels={pageWords(t)} />
          </Card>
          </div>

          <div id="agent-paid" className="scroll-mt-24">
          <Card title={t("agents.paidOut")}>
            <div className="mb-4">
              <Disclosure showLabel={t("agents.recordPayment")} hideLabel={t("common.cancel")}>
                <form
                  action={recordCommissionPayment}
                  className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2"
                >
                  <input type="hidden" name="agentId" value={id} />
                  <div>
                    <label className="label" htmlFor="commissionId">
                      {t("commissions.sale")}
                    </label>
                    <select id="commissionId" name="commissionId" className="select">
                      <option value="">not against one line</option>
                      {sales.flatMap((sale) =>
                        sale.lines
                          .filter((l) => l.outstandingCents > 0)
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {sale.project && sale.unit
                                ? `${sale.project.name} ${sale.unit.code}`
                                : sale.contract.reference}{" "}
                              . {l.kind === "RATE" ? t("commissions.onThePrice") : (l.label ?? "")}{" "}
                              . {formatAmount(l.outstandingCents, locale)} {t("vat.beforeVatShort")}
                            </option>
                          )),
                      )}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
                    <VatFields
                      idPrefix="pay"
                      locale={locale}
                      defaultRate={Number(agent.vatRate)}
                      labels={{
                        amount: t("vat.amountBeforeVat"),
                        rate: t("vat.rate"),
                        vat: t("vat.vat"),
                        total: t("vat.withVat"),
                      }}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="paidOn">
                      {t("common.date")}
                    </label>
                    <DateField id="paidOn" name="paidOn" />
                  </div>
                  <div>
                    <label className="label" htmlFor="reference">
                      {t("commissions.reference")}
                    </label>
                    <input id="reference" name="reference" className="input" />
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <button type="submit" className="btn btn-primary">
                      {t("common.save")}
                    </button>
                  </div>
                </form>
              </Disclosure>
            </div>

            {paidOut.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("credits.recordedOn")}</th>
                    <th className="ctr">{t("vat.beforeVat")}</th>
                    <th className="ctr">{t("vat.vat")}</th>
                    <th className="ctr">{t("vat.withVat")}</th>
                    <th>{t("commissions.reference")}</th>
                    <th className="ctr">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paidShown.rows.map((p) => (
                    <tr key={p.id}>
                      <td>{day(p.paidOn)}</td>
                      <td className="nowrap text-xs">{dayAndTime(p.createdAt, locale)}</td>
                      <td className="ctr">{formatAmount(toCents(p.amount), locale)}</td>
                      <td className="ctr nowrap">
                        {formatAmount(toCents(p.vatAmount), locale)}{" "}
                        <span className="text-xs text-brand-graphite/60">{formatPercent(Number(p.vatRate), locale)}</span>
                      </td>
                      <td className="ctr font-semibold">{formatAmount(toCents(p.totalAmount), locale)}</td>
                      <td>{p.reference ?? ""}</td>
                      <td className="ctr">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          {/*
                            The receipt for this payment. It opens to be read,
                            and the email goes only from there, on a button.
                          */}
                          <Link
                            href={`/agents/${id}/receipt/${p.id}`}
                            className="btn btn-secondary !px-2 !py-1 !text-xs"
                          >
                            {t("receipts.open")}
                          </Link>
                          <form action={deleteCommissionPayment.bind(null, p.id, id)}>
                            <button
                              type="submit"
                              className="btn btn-secondary !px-2 !py-1 !text-xs"
                            >
                              {t("common.delete")}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Pagination basePath={`/agents/${id}`} params={pages} pageKey="paidPage" anchor="agent-paid" info={paidShown.info} labels={pageWords(t)} />
          </Card>
          </div>

          {opened.length > 0 ? (
            <div id="agent-opened" className="scroll-mt-24">
            <Card title={t("agents.filesOpened")}>
              <table className="data" data-agent-files-opened>
                <thead>
                  <tr>
                    <th>{t("agents.campaignName")}</th>
                    <th className="ctr">{t("campaigns.filesOpened")}</th>
                  </tr>
                </thead>
                <tbody>
                  {openedShown.rows.map(({ link, title }) => (
                    <tr key={link.id}>
                      <td>
                        {link.campaignId ? (
                          <Link href={`/campaigns/${link.campaignId}`} className="text-brand-teal-dark hover:underline">
                            {title ?? link.campaignId}
                          </Link>
                        ) : (
                          title
                        )}
                      </td>
                      <td className="ctr text-xs">
                        {link.firstOpenedAt ? dayAndTime(link.firstOpenedAt, locale) : ""}
                        {link.openCount > 1 ? (
                          <div className="text-brand-graphite/60">{t("campaigns.timesOpened").replace("{n}", String(link.openCount))}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination basePath={`/agents/${id}`} params={pages} pageKey="openedPage" anchor="agent-opened" info={openedShown.info} labels={pageWords(t)} />
            </Card>
            </div>
          ) : null}

          {/*
            Every agent can be deleted. What goes with them is spelled out, and
            when there is a history attached the sentence counts it, because the
            office should be able to see what it is about to lose before it
            presses rather than afterwards.
          */}
          <DeleteRecord
            action={deleteAgent.bind(null, id)}
            label={t("remove.agent")}
            what={
              goes.commissions > 0 || goes.payments > 0
                ? `${t("remove.agentWhat")} ${t("remove.agentAlsoGoes")
                    .replace("{lines}", String(goes.commissions))
                    .replace("{payments}", String(goes.payments))}`
                : t("remove.agentWhat")
            }
            confirm={t("remove.confirm")}
          />
        </div>
      </div>
    </>
  );
}
