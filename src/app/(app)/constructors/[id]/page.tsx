import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { constructorStatusTone, constructorWithJobs, projectsWithoutConstructor } from "@/lib/constructors";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import VatFields from "@/components/VatFields";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import ProfileCard from "@/components/ProfileCard";
import Disclosure from "@/components/Disclosure";
import DateField from "@/components/DateField";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import {
  addConstructorPayment,
  addConstructorProject,
  deleteConstructor,
  deleteConstructorPayment,
  removeConstructorProject,
  setConstructorPaymentStatus,
  setConstructorPaymentVat,
  updateConstructor,
  updateConstructorProject,
  uploadConstructorPapers,
  emailConstructorPayment,
} from "../actions";

/**
 * One constructor: their details, the developments they build with the amount
 * agreed for each, and every payment, with its papers and its status.
 */
export const dynamic = "force-dynamic";

export default async function ConstructorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const { locale, t } = await getTranslator();
  const found = await constructorWithJobs(id);
  if (!found) notFound();
  const { constructor: who, jobs } = found;
  const free = await projectsWithoutConstructor();
  const money = (cents: number) => formatAmount(cents, locale);
  const day = (value: Date) => new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");
  const sum = (pick: (job: (typeof jobs)[number]) => number) => jobs.reduce((a, job) => a + pick(job), 0);

  return (
    <>
      <BackLink href="/constructors" label={`${t("common.backTo")} ${t("constructors.title").toLowerCase()}`} />
      <PageHeader title={who.name} subtitle={[who.company, who.email, who.phone].filter(Boolean).join(" . ")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("constructors.agreed")} value={money(sum((job) => job.agreedCents))} />
        <Stat
          label={t("constructors.paid")}
          value={money(sum((job) => job.paidCents))}
          hint={`${money(sum((job) => job.paidTotalCents))} ${t("vat.withVatShort")}`}
          tone="good"
        />
        <Stat
          label={t("constructors.pending")}
          value={money(sum((job) => job.pendingCents))}
          hint={`${money(sum((job) => job.pendingTotalCents))} ${t("vat.withVatShort")}`}
          tone="warn"
        />
        <Stat label={t("constructors.remaining")} value={money(sum((job) => job.remainingCents))} />
      </div>

      <div className="space-y-4">
        <ProfileCard
          title={t("constructors.details")}
          action={updateConstructor.bind(null, id)}
          labels={{ edit: t("common.edit"), save: t("common.save"), cancel: t("common.cancel") }}
          fields={[
            { name: "name", label: t("common.name"), value: who.name, required: true },
            { name: "company", label: t("constructors.company"), value: who.company ?? "" },
            { name: "contactName", label: t("constructors.contact"), value: who.contactName ?? "" },
            { name: "email", label: t("common.email"), value: who.email ?? "", kind: "email" },
            { name: "phone", label: t("common.phone"), value: who.phone ?? "", kind: "tel" },
            { name: "vatNumber", label: t("constructors.vat"), value: who.vatNumber ?? "" },
            {
              name: "vatRate",
              label: t("constructors.vatRate"),
              value: String(Number(who.vatRate)),
              display: formatPercent(Number(who.vatRate), locale),
              kind: "number",
              hint: t("constructors.vatRateHint"),
            },
            { name: "registryNumber", label: t("constructors.registry"), value: who.registryNumber ?? "" },
            { name: "address", label: t("constructors.address"), value: who.address ?? "" },
            {
              name: "isActive",
              label: t("common.status"),
              kind: "checkbox",
              checked: who.isActive,
              display: who.isActive ? t("constructors.active") : t("constructors.inactive"),
              hint: t("constructors.active"),
            },
            { name: "notes", label: t("common.notes"), kind: "textarea", value: who.notes ?? "" },
          ]}
        />

        <Card title={t("constructors.projects")}>
          {free.length > 0 ? (
            <div className="mb-4">
              <Disclosure key={jobs.length} showLabel={t("constructors.addProject")} hideLabel={t("common.cancel")}>
                <form action={addConstructorProject.bind(null, id)} className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-3" data-add-project>
                  <div>
                    <label className="label" htmlFor="cpProject">
                      {t("constructors.project")}
                    </label>
                    <select id="cpProject" name="projectId" required className="select" defaultValue="">
                      <option value="">{t("constructors.chooseProject")}</option>
                      {free.map((one) => (
                        <option key={one.id} value={one.id}>
                          {one.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="cpAmount">
                      {t("constructors.agreedAmount")}
                    </label>
                    <input id="cpAmount" name="agreedAmount" inputMode="decimal" required className="input" placeholder="1400000" />
                  </div>
                  <div className="flex items-end">
                    <SubmitButton>{t("common.save")}</SubmitButton>
                  </div>
                </form>
              </Disclosure>
            </div>
          ) : (
            <p className="mb-3 text-xs text-brand-graphite/60">{t("constructors.allTaken")}</p>
          )}

          {jobs.length === 0 ? (
            <Empty message={t("constructors.noProjects")} />
          ) : (
            <div className="space-y-6">
              {jobs.map((job) => (
                <section key={job.job.id} className="rounded border border-brand-line p-3" data-job={job.project.name}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/projects/${job.project.id}`} className="text-base font-semibold hover:underline">
                        {job.project.name}
                      </Link>
                      <p className="text-xs text-brand-graphite/70" data-job-figures>
                        {t("constructors.agreed")} {money(job.agreedCents)} . {t("constructors.paid")} {money(job.paidCents)} .{" "}
                        {t("constructors.pending")} {money(job.pendingCents)} . {t("constructors.remaining")}{" "}
                        <span className="font-semibold">{money(job.remainingCents)}</span>
                        <span className="block">
                          {t("vat.allBeforeVat")} {t("constructors.paid")} {money(job.paidTotalCents)} {t("vat.withVatShort")} .{" "}
                          {t("constructors.pending")} {money(job.pendingTotalCents)} {t("vat.withVatShort")}
                        </span>
                      </p>
                    </div>
                    <form action={updateConstructorProject.bind(null, job.job.id)} className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="label" htmlFor={`amount-${job.job.id}`}>
                          {t("constructors.agreedAmount")}
                        </label>
                        <input
                          id={`amount-${job.job.id}`}
                          name="agreedAmount"
                          defaultValue={(job.agreedCents / 100).toFixed(2)}
                          inputMode="decimal"
                          className="input !w-40 !py-1"
                        />
                      </div>
                      <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("constructors.saveAmount")}</SubmitButton>
                    </form>
                  </div>

                  <div className="mb-3">
                    <Disclosure key={job.payments.length} showLabel={t("constructors.addPayment")} hideLabel={t("common.cancel")}>
                      <form
                        action={addConstructorPayment.bind(null, job.job.id)}
                        className="grid gap-3 rounded border border-brand-line bg-brand-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
                        data-add-payment
                      >
                        <div>
                          <label className="label">{t("common.date")}</label>
                          <DateField name="paidOn" defaultValue={new Date().toISOString().slice(0, 10)} />
                        </div>
                        <div>
                          <label className="label">{t("constructors.kind")}</label>
                          <input name="kind" className="input" placeholder={t("constructors.kindHint")} />
                        </div>
                        <VatFields
                          idPrefix={`cpay-${job.job.id}`}
                          locale={locale}
                          defaultRate={Number(who.vatRate)}
                          labels={{
                            amount: t("vat.amountBeforeVat"),
                            rate: t("vat.rate"),
                            vat: t("vat.vat"),
                            total: t("vat.withVat"),
                          }}
                        />
                        <div>
                          <label className="label">{t("common.notes")}</label>
                          <input name="notes" className="input" />
                        </div>
                        <div>
                          <label className="label">{t("constructors.invoice")}</label>
                          <input name="invoice" type="file" multiple className="input !py-1.5 text-xs" />
                        </div>
                        <div>
                          <label className="label">{t("constructors.receipt")}</label>
                          <input name="receipt" type="file" multiple className="input !py-1.5 text-xs" />
                        </div>
                        <div className="flex items-end lg:col-span-2">
                          <SubmitButton>{t("common.save")}</SubmitButton>
                        </div>
                        <p className="text-xs text-brand-graphite/60 lg:col-span-4">{t("constructors.paymentsNote")}</p>
                      </form>
                    </Disclosure>
                  </div>

                  {job.payments.length === 0 ? (
                    <p className="text-sm text-brand-graphite/60">{t("constructors.noPayments")}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>{t("common.date")}</th>
                            <th>{t("constructors.kind")}</th>
                            <th className="ctr">{t("vat.beforeVat")}</th>
                            <th className="ctr">{t("vat.rate")}</th>
                            <th className="ctr">{t("vat.vat")}</th>
                            <th className="ctr">{t("vat.withVat")}</th>
                            <th>{t("common.status")}</th>
                            <th>{t("constructors.invoice")} / {t("constructors.receipt")}</th>
                            <th>{t("common.actions")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {job.payments.map((pay) => (
                            <tr key={pay.id} data-constructor-payment={pay.status}>
                              <td className="nowrap text-xs">{day(pay.paidOn)}</td>
                              <td className="text-xs">
                                {pay.kind ?? ""}
                                {pay.notes ? <div className="text-brand-graphite/60">{pay.notes}</div> : null}
                              </td>
                              <td className="ctr nowrap">{money(toCents(pay.amount))}</td>
                              <td className="ctr">
                                {/* The VAT on this payment, the constructor's rate unless changed here. */}
                                <form action={setConstructorPaymentVat.bind(null, pay.id)} className="flex items-center justify-center gap-1">
                                  <input
                                    name="vatRate"
                                    defaultValue={Number(pay.vatRate)}
                                    inputMode="decimal"
                                    aria-label={t("vat.rate")}
                                    className="input !w-14 !px-1 !py-0.5 text-center !text-xs"
                                    data-payment-vat
                                  />
                                  <SubmitButton className="btn btn-secondary !px-1.5 !py-0.5 !text-xs">{t("common.save")}</SubmitButton>
                                </form>
                              </td>
                              <td className="ctr nowrap">{money(toCents(pay.vatAmount))}</td>
                              <td className="ctr nowrap font-semibold">{money(toCents(pay.totalAmount))}</td>
                              <td>
                                <Pill tone={constructorStatusTone(pay.status) as "good" | "warn" | "bad"}>
                                  {t(`constructors.status.${pay.status}` as MessageKey)}
                                </Pill>
                              </td>
                              <td className="text-xs">
                                <div className="flex flex-wrap gap-2">
                                  {pay.invoices.map((doc) => (
                                    <a key={doc.id} href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" title={doc.title} data-paper="invoice" className="text-brand-teal-dark hover:underline">
                                      {t("constructors.invoice")}
                                    </a>
                                  ))}
                                  {pay.receipts.map((doc) => (
                                    <a key={doc.id} href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" title={doc.title} data-paper="receipt" className="text-brand-teal-dark hover:underline">
                                      {t("constructors.receipt")}
                                    </a>
                                  ))}
                                </div>
                                {pay.status !== "CANCELLED" && (pay.invoices.length === 0 || pay.receipts.length === 0) ? (
                                  <div className="text-[color:var(--color-warning)]">{t("constructors.papersMissing")}</div>
                                ) : null}
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-brand-graphite/70">{t("constructors.addPapers")}</summary>
                                  <form action={uploadConstructorPapers.bind(null, pay.id)} className="mt-1 space-y-1" data-papers-form>
                                    <label className="block">
                                      {t("constructors.invoice")} <input name="invoice" type="file" className="text-xs" />
                                    </label>
                                    <label className="block">
                                      {t("constructors.receipt")} <input name="receipt" type="file" className="text-xs" />
                                    </label>
                                    <SubmitButton className="btn btn-secondary !px-2 !py-1 !text-xs">{t("common.save")}</SubmitButton>
                                  </form>
                                </details>
                              </td>
                              <td>
                                <div className="flex flex-wrap gap-1">
                                  {/* Paid or Cancelled is decided on a pending payment; a decision is undone with Back to pending. */}
                                  {pay.status === "PENDING" ? (
                                    <form action={setConstructorPaymentStatus.bind(null, pay.id, "PAID")} data-mark-paid>
                                      <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">{t("constructors.markPaid")}</SubmitButton>
                                    </form>
                                  ) : null}
                                  {pay.status === "PENDING" ? (
                                    <form action={setConstructorPaymentStatus.bind(null, pay.id, "CANCELLED")} data-mark-cancelled>
                                      <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("constructors.markCancelled")}</SubmitButton>
                                    </form>
                                  ) : null}
                                  {/* The confirmation to the constructor, only by this button and only once it is paid. */}
                                  {pay.status === "PAID" && who.email ? (
                                    <form action={emailConstructorPayment.bind(null, pay.id)} data-email-constructor>
                                      <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">{t("constructors.emailIt")}</SubmitButton>
                                    </form>
                                  ) : null}
                                  {pay.status === "PAID" && !who.email ? (
                                    <span className="text-xs text-brand-graphite/60" data-no-constructor-email>{t("constructors.noEmail")}</span>
                                  ) : null}
                                  {pay.status !== "PENDING" ? (
                                    <form action={setConstructorPaymentStatus.bind(null, pay.id, "PENDING")}>
                                      <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("constructors.markPending")}</SubmitButton>
                                    </form>
                                  ) : null}
                                  <ConfirmButton
                                    action={deleteConstructorPayment.bind(null, pay.id)}
                                    label={t("common.delete")}
                                    confirm={t("remove.sure")}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-3">
                    <ConfirmButton
                      action={removeConstructorProject.bind(null, job.job.id)}
                      label={t("constructors.removeProject")}
                      confirm={t("remove.sure")}
                    />
                  </div>
                </section>
              ))}
            </div>
          )}
        </Card>

        <div>
          <ConfirmButton action={deleteConstructor.bind(null, id)} label={t("common.delete")} confirm={t("remove.sure")} />
        </div>
      </div>
    </>
  );
}
