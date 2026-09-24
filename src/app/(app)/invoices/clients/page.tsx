import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, toCents } from "@/lib/money";
import { listIssued, paymentsWithoutPapers } from "@/lib/issued";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import Pagination, { paginate } from "@/components/Pagination";
import { issuePapers } from "./actions";

/**
 * The invoices and receipts the CRM has issued to buyers.
 *
 * One line per payment, the invoice and its receipt side by side the way the
 * two printed books pair up, with the PDF of each one click away. Narrowed by
 * a name or a number, a period, a development, and whether the papers stand or
 * were voided when a payment was taken off.
 */
const PER_PAGE = 30;

export default async function ClientInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    project?: string;
    kind?: string;
    state?: string;
    page?: string;
  }>;
}) {
  await requireUser(["ADMIN"]);
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const filters = {
    query: (params.q ?? "").trim(),
    from: params.from ?? "",
    to: params.to ?? "",
    project: params.project ?? "",
    kind: params.kind ?? "",
    state: params.state ?? "",
  };

  const [{ rows, total, totals }, projectList, waiting] = await Promise.all([
    listIssued({ ...filters, limit: perPage, offset }),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    paymentsWithoutPapers(15),
  ]);

  const money = (cents: number) => formatAmount(cents, locale);
  const day = (value: Date) =>
    new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader title={t("issued.title")} subtitle={t("issued.subtitle")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label={t("issued.invoiced")} value={money(totals.invoiced)} />
        <Stat label={t("issued.credited")} value={money(totals.credited)} tone={totals.credited ? "warn" : "teal"} />
        <Stat label={t("issued.vatNet")} value={money(totals.vat)} />
        <Stat label={t("issued.received")} value={money(totals.received)} />
      </div>

      <Card>
        {/* The filters, as a plain form so every view is an address to keep. */}
        <form action="/invoices/clients" method="get" className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="q">
              {t("common.search")}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.query}
              placeholder={t("issued.searchPlaceholder")}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="from">
              {t("issued.from")}
            </label>
            <input id="from" name="from" type="date" defaultValue={filters.from} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="to">
              {t("issued.to")}
            </label>
            <input id="to" name="to" type="date" defaultValue={filters.to} className="input" />
          </div>
          <div className="w-48">
            <label className="label" htmlFor="project">
              {t("nav.projects")}
            </label>
            <select id="project" name="project" defaultValue={filters.project} className="select">
              <option value="">{t("common.all")}</option>
              {projectList.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="label" htmlFor="kind">
              {t("issued.type")}
            </label>
            <select id="kind" name="kind" defaultValue={filters.kind} className="select">
              <option value="">{t("common.all")}</option>
              <option value="INVOICE">{t("issued.type.INVOICE")}</option>
              <option value="RECEIPT">{t("issued.type.RECEIPT")}</option>
              <option value="CREDIT_NOTE">{t("issued.type.CREDIT_NOTE")}</option>
            </select>
          </div>
          <div className="w-40">
            <label className="label" htmlFor="state">
              {t("common.status")}
            </label>
            <select id="state" name="state" defaultValue={filters.state} className="select">
              <option value="">{t("issued.state.live")}</option>
              <option value="credited">{t("issued.state.credited")}</option>
              <option value="void">{t("issued.state.void")}</option>
              <option value="all">{t("common.all")}</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            {t("common.search")}
          </button>
          {filtered ? (
            <Link href="/invoices/clients" className="btn btn-secondary" prefetch={false}>
              {t("common.clear")}
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <Empty message={filtered ? t("issued.noneFound") : t("issued.noneYet")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.date")}</th>
                  <th>{t("issued.type")}</th>
                  <th>{t("issued.number")}</th>
                  <th>{t("issued.relates")}</th>
                  <th>{t("clients.title")}</th>
                  <th>{t("issued.property")}</th>
                  <th>{t("issued.stage")}</th>
                  <th className="ctr">{t("issued.net")}</th>
                  <th className="ctr">{t("issued.vat")}</th>
                  <th className="ctr">{t("issued.total")}</th>
                  <th>{t("issued.files")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const paper = row.paper;
                  const voided = Boolean(paper.voidedAt);
                  const credited = Boolean(paper.creditedById);
                  const creditNote = paper.kind === "CREDIT_NOTE";
                  const sign = creditNote ? "−" : "";
                  return (
                    <tr key={paper.id} className={voided ? "opacity-60" : ""}>
                      <td className="nowrap text-xs">{day(paper.issuedOn)}</td>
                      <td className="text-xs">
                        {t(`issued.type.${paper.kind}` as "issued.type.INVOICE")}
                      </td>
                      <td className={`font-semibold ${voided || credited ? "line-through" : ""}`}>
                        {paper.number}
                        {voided ? (
                          <div className="mt-0.5">
                            <Pill tone="warn">{t("issued.void")}</Pill>
                          </div>
                        ) : null}
                        {credited ? (
                          <div className="mt-0.5">
                            <Pill tone="bad">{t("issued.creditedPill")}</Pill>
                          </div>
                        ) : null}
                      </td>
                      <td className="text-xs">
                        {paper.kind === "RECEIPT" && row.invoiceNumber
                          ? `${t("issued.forInvoice")} ${row.invoiceNumber}`
                          : null}
                        {creditNote && row.invoiceNumber ? `${t("issued.credits")} ${row.invoiceNumber}` : null}
                        {creditNote && !row.invoiceNumber ? t(`issued.purpose.${paper.purpose ?? "REFUND"}` as "issued.purpose.REFUND") : null}
                        {credited ? (
                          <div>
                            {t("issued.creditNote")} {row.creditNoteNumber}
                            {row.replacedByNumber ? `, ${t("issued.replacedBy")} ${row.replacedByNumber}` : ""}
                          </div>
                        ) : null}
                        {row.creditApplied ? (
                          <div>
                            {t("issued.creditApplied")} {money(row.creditApplied)}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {row.client?.id ? (
                          <Link href={`/clients/${row.client.id}`} className="hover:underline" prefetch={false}>
                            {row.client.firstName} {row.client.lastName}
                          </Link>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="text-xs">
                        {[row.project?.name, row.unit?.code].filter(Boolean).join(", ")}
                        {row.contract?.id ? (
                          <div>
                            <Link
                              href={`/contracts/${row.contract.id}`}
                              className="text-brand-teal-dark hover:underline"
                              prefetch={false}
                            >
                              {row.contract.reference}
                            </Link>
                          </div>
                        ) : null}
                      </td>
                      <td className="text-xs">{row.stage}</td>
                      <td className="ctr nowrap">{sign}{money(toCents(paper.netAmount))}</td>
                      <td className="ctr nowrap">{sign}{money(toCents(paper.vatAmount))}</td>
                      <td className="ctr nowrap font-semibold">{sign}{money(toCents(paper.totalAmount))}</td>
                      <td className="nowrap text-xs">
                        <span className="flex flex-col gap-0.5">
                          {paper.documentId ? (
                            <a
                              href={`/api/files/${paper.documentId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-teal-dark hover:underline"
                            >
                              {t(`issued.pdf.${paper.kind}` as "issued.pdf.INVOICE")}
                            </a>
                          ) : null}
                          {paper.stampedDocumentId ? (
                            <a
                              href={`/api/files/${paper.stampedDocumentId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[color:var(--color-negative)] hover:underline"
                            >
                              {t("issued.stampedPdf")}
                            </a>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          basePath="/invoices/clients"
          params={params as Record<string, string | undefined>}
          info={{ page, perPage, total }}
          labels={{
            previous: t("common.previous"),
            next: t("common.next"),
            showing: t("common.showing"),
            of: t("common.of"),
          }}
        />
      </Card>

      {/*
        Payments recorded before the CRM issued papers. Nothing is issued for
        them by itself, so old test payments never use numbers from the real
        series; each one is issued by hand when the office wants it.
      */}
      {waiting.length > 0 ? (
        <div className="mt-4">
          <Card title={t("issued.waitingTitle")}>
            <p className="mb-3 max-w-prose text-sm text-brand-graphite/70">{t("issued.waitingHint")}</p>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("clients.title")}</th>
                    <th>{t("contracts.title")}</th>
                    <th className="ctr">{t("issued.total")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((one) => (
                    <tr key={one.payment.id}>
                      <td className="nowrap text-xs">{day(one.payment.paidOn)}</td>
                      <td>
                        {one.client ? `${one.client.firstName} ${one.client.lastName}` : ""}
                      </td>
                      <td className="text-xs">{one.contract.reference}</td>
                      <td className="ctr">{money(toCents(one.payment.amount))}</td>
                      <td>
                        <form action={issuePapers.bind(null, one.payment.id)}>
                          <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                            {t("issued.issueNow")}
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
