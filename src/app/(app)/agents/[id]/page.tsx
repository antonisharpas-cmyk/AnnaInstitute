import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, commissionPayments } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { amountForInput } from "@/lib/money";
import { commissionTotals, papersFor, salesOfAgent, salesWithoutAnAgent } from "@/lib/commissions";
import CommissionRecord from "./CommissionRecord";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import SubmitButton from "@/components/SubmitButton";
import DateField from "@/components/DateField";
import ProfileCard from "@/components/ProfileCard";
import {
  addExtra,
  saveAgentProfile,
  deleteCommissionPayment,
  payLine,
  recordCommissionPayment,
  recordSale,
  removeCommissionLine,
  removeCommissionPaper,
  setSaleRate,
  uploadCommissionPaper,
} from "../actions";

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const found = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  const agent = found[0];
  if (!agent) notFound();

  const [sales, paidOut, totals, unclaimed] = await Promise.all([
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
  ]);

  /* The two papers filed against every commission line on this page. */
  const papers = await papersFor(sales.flatMap((sale) => sale.lines.map((line) => line.id)));

  const shortDay = (value: Date | null | undefined) =>
    value ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB") : "";

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

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("agents.rate")}
          value={formatPercent(Number(agent.commissionRate), locale)}
        />
        <Stat label={t("agents.sales")} value={String(sales.length)} />
        <Stat label={t("agents.generated")} value={formatAmount(totals.generatedCents, locale)} />
        <Stat label={t("agents.owed")} value={formatAmount(totals.outstandingCents, locale)} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ProfileCard
            title={t("agents.profile")}
            action={saveAgentProfile.bind(null, id)}
            labels={{ edit: t("common.edit"), save: t("common.save"), cancel: t("common.cancel") }}
            fields={[
              { name: "name", label: t("common.name"), value: agent.name, required: true },
              { name: "company", label: t("subowners.company"), value: agent.company ?? "" },
              { name: "email", label: t("leads.email"), value: agent.email ?? "", kind: "email" },
              { name: "phone", label: t("leads.phone"), value: agent.phone ?? "" },
              {
                name: "commissionRate",
                label: t("agents.rate"),
                value: String(Number(agent.commissionRate)),
                display: formatPercent(Number(agent.commissionRate), locale),
                kind: "number",
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

        <div className="space-y-4 lg:col-span-2">
          {/* What he sold, and what each sale earns him. */}
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
                {sales.map((sale) => (
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
                          {/* The cash is half of what the agent sold, so it is
                              named here rather than left for somebody to find
                              on the contract. */}
                          {sale.value.cashCents > 0
                            ? ` ${t("common.and")} ${formatAmount(sale.value.cashCents, locale)} ${t(
                                "commissions.inCash",
                              )}`
                            : ""}
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

                      {/* The rate for this sale alone, when a better one was promised. */}
                      <form
                        action={setSaleRate.bind(null, sale.contract.id, id)}
                        className="flex items-end gap-2"
                      >
                        <div>
                          <label className="label" htmlFor={`rate-${sale.contract.id}`}>
                            {t("agents.rateOnThisSale")}
                          </label>
                          <input
                            id={`rate-${sale.contract.id}`}
                            name="rate"
                            defaultValue={
                              sale.contract.commissionRate
                                ? Number(sale.contract.commissionRate)
                                : ""
                            }
                            placeholder={String(Number(agent.commissionRate))}
                            className="input !w-20 !py-1 !text-xs"
                          />
                        </div>
                        <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                          {t("common.save")}
                        </button>
                      </form>
                    </div>

                    {sale.lines.length === 0 ? (
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
                          {formatPercent(
                            Number(sale.contract.commissionRate ?? agent.commissionRate),
                            locale,
                          )}{" "}
                          {t("common.of")} {formatAmount(sale.value.fullCents, locale)} .{" "}
                          {formatAmount(
                            Math.round(
                              (sale.value.fullCents *
                                Number(sale.contract.commissionRate ?? agent.commissionRate)) /
                                100,
                            ),
                            locale,
                          )}
                        </p>
                        {sale.value.cashCents > 0 ? (
                          <p className="text-xs text-brand-graphite/70">
                            {formatAmount(sale.value.priceCents, locale)}{" "}
                            {t("commissions.onTheContract")}{" "}
                            {formatAmount(sale.value.cashCents, locale)} {t("commissions.inCash")}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-brand-graphite/70">
                          {t("commissions.notYetEarned")}
                        </p>
                      </div>
                    ) : null}

                    <div
                      className={`mt-3 overflow-x-auto${sale.lines.length === 0 ? " hidden" : ""}`}
                    >
                      <table className="data">
                        <thead>
                          <tr>
                            <th>{t("commissions.line")}</th>
                            <th className="ctr">{t("commissions.base")}</th>
                            <th className="ctr">{t("agents.rate")}</th>
                            <th className="ctr">{t("contracts.amount")}</th>
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
                                {line.kind === "RATE" ? formatPercent(line.rate, locale) : ""}
                              </td>
                              <td className="ctr font-semibold">
                                {formatAmount(line.amountCents, locale)}
                              </td>
                              <td className="ctr">{formatAmount(line.paidCents, locale)}</td>
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
                            <td className="ctr font-semibold">
                              {formatAmount(sale.generatedCents, locale)}
                            </td>
                            <td className="ctr">{formatAmount(sale.paidCents, locale)}</td>
                            <td className="ctr" colSpan={2}>
                              {t("agents.owed")} {formatAmount(sale.outstandingCents, locale)}
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
                              ? `${formatPercent(line.rate, locale)} ${t("common.of")} ${formatAmount(
                                  line.baseCents,
                                  locale,
                                )} . ${t("commissions.fullValue").toLowerCase()} . ${formatAmount(
                                  line.amountCents,
                                  locale,
                                )}`
                              : `${line.label ?? t("commissions.extra")} . ${formatAmount(
                                  line.amountCents,
                                  locale,
                                )}`
                          }
                          madeUpOf={
                            line.kind === "RATE" && sale.value.cashCents > 0
                              ? `${formatAmount(sale.value.priceCents, locale)} ${t(
                                  "commissions.onTheContract",
                                )} ${formatAmount(sale.value.cashCents, locale)} ${t(
                                  "commissions.inCash",
                                )}`
                              : null
                          }
                          generatedOn={`${shortDay(line.generatedAt)} . ${t("commissions.onFirstPayment")}`}
                          completedOn={shortDay(line.completedAt) || null}
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
                          <div>
                            <label className="label" htmlFor={`extra-${sale.contract.id}`}>
                              {t("contracts.amount")}
                            </label>
                            <input
                              id={`extra-${sale.contract.id}`}
                              name="amount"
                              required
                              defaultValue={
                                sale.differenceCents > 0
                                  ? amountForInput(sale.differenceCents / 100)
                                  : ""
                              }
                              className="input !w-28 !py-1 !text-xs"
                            />
                          </div>
                          <button type="submit" className="btn btn-primary !px-3 !py-1 !text-xs">
                            {t("common.add")}
                          </button>
                          <p className="w-full text-xs text-brand-graphite/60">
                            {t("commissions.extraNote")}
                          </p>
                        </form>
                      </Disclosure>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

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
                              . {formatAmount(l.outstandingCents, locale)}
                            </option>
                          )),
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="amount">
                      {t("contracts.amount")}
                    </label>
                    <input id="amount" name="amount" required className="input" />
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
                    <th className="ctr">{t("contracts.amount")}</th>
                    <th>{t("commissions.reference")}</th>
                    <th className="ctr">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paidOut.map((p) => (
                    <tr key={p.id}>
                      <td>{day(p.paidOn)}</td>
                      <td className="ctr">{formatAmount(toCents(p.amount), locale)}</td>
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
          </Card>
        </div>
      </div>
    </>
  );
}
