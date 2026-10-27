import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { readSettings } from "@/lib/settings";
import { buildSummaries, summaryText } from "@/lib/appointmentSummary";
import { emailConfigured } from "@/lib/messaging";
import { emailSetup } from "@/lib/messaging/email";
import { diagnoseMail } from "@/lib/mailDiagnosis";
import { Card, Empty, PageHeader } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import EmailSwitch from "@/components/EmailSwitch";
import HistorySwitch from "@/components/HistorySwitch";
import { saveAppointmentSettings, saveCompanySettings, saveLeadAlert, sendSummaryNow, sendTestEmail, sendTestText } from "./actions";
import { channelConfigured, textProvider } from "@/lib/messaging";
import { phonesToCheck } from "@/lib/phoneCheckList";

/**
 * The admin panel, which is one panel so far.
 *
 * The office asked for the day's summary to be configurable from here: whether
 * it goes, at what hour, and what happens on a day with nothing on it. And
 * because a setting nobody can see the effect of is a setting nobody trusts,
 * the page also shows exactly what each person will receive, as it stands right
 * now, and offers to send it this minute.
 */
export default async function SettingsPage() {
  await requireUser(["ADMIN"]);
  const { t } = await getTranslator();

  const config = await readSettings([
    "appointments.summaryOn",
    "appointments.summaryHour",
    "appointments.summaryWhenEmpty",
    "appointments.summaryLastResult",
    "appointments.reminderOn",
    "appointments.reminderHour",
    "leads.alertOn",
    "leads.alertTo",
  ]);
  const company = await readSettings([
    "company.name",
    "company.registration",
    "company.vat",
    "company.tic",
    "company.address",
    "company.phone",
    "company.mobile",
    "company.fax",
    "company.email",
    "company.website",
    "company.bankName",
    "company.beneficiary",
    "company.bankAccount",
    "company.iban",
    "company.swift",
    "numbers.nextInvoice",
    "numbers.nextReceipt",
    "numbers.nextCreditNote",
  ]);
  const mail = emailSetup();
  const badPhones = await phonesToCheck();
  const diagnosis = diagnoseMail();
  const companyFields: { key: keyof typeof company; name: string; label: string; wide?: boolean }[] = [
    { key: "company.name", name: "name", label: t("settings.company.name"), wide: true },
    { key: "company.registration", name: "registration", label: t("settings.company.registration") },
    { key: "company.vat", name: "vat", label: t("settings.company.vat") },
    { key: "company.tic", name: "tic", label: t("settings.company.tic") },
    { key: "company.email", name: "email", label: t("settings.company.email") },
    { key: "company.address", name: "address", label: t("settings.company.address"), wide: true },
    { key: "company.phone", name: "phone", label: t("settings.company.phone") },
    { key: "company.mobile", name: "mobile", label: t("settings.company.mobile") },
    { key: "company.fax", name: "fax", label: t("settings.company.fax") },
    { key: "company.website", name: "website", label: t("settings.company.website") },
    { key: "company.bankName", name: "bankName", label: t("settings.company.bankName") },
    { key: "company.beneficiary", name: "beneficiary", label: t("settings.company.beneficiary") },
    { key: "company.bankAccount", name: "bankAccount", label: t("settings.company.bankAccount") },
    { key: "company.iban", name: "iban", label: t("settings.company.iban") },
    { key: "company.swift", name: "swift", label: t("settings.company.swift") },
  ];

  const summaries = await buildSummaries(0);

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        action={
          <>
            <a href="/settings/logins" className="btn btn-secondary" data-logins-link>
              {t("logins.link")}
            </a>
            <a href="/settings/data" className="btn btn-secondary" data-data-link>
              {t("data.link")}
            </a>
          </>
        }
      />

      <EmailSwitch />
      <HistorySwitch />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={t("settings.appointments")}>
            <form action={saveAppointmentSettings} className="space-y-4">
              <label className="flex items-start gap-2 rounded border border-brand-line bg-brand-surface p-3 text-sm">
                <input
                  type="checkbox"
                  name="on"
                  defaultChecked={config["appointments.summaryOn"] === "yes"}
                  className="mt-0.5"
                />
                <span>
                  {t("settings.summaryOn")}
                  <span className="mt-0.5 block text-xs text-brand-graphite/60">
                    {t("settings.summaryOnHint")}
                  </span>
                </span>
              </label>

              <div className="sm:w-48">
                <label className="label" htmlFor="hour">
                  {t("settings.summaryHour")}
                </label>
                <input
                  id="hour"
                  name="hour"
                  inputMode="numeric"
                  defaultValue={config["appointments.summaryHour"]}
                  className="input"
                />
                <p className="mt-1 text-xs text-brand-graphite/60">
                  {t("settings.summaryHourHint")}
                </p>
              </div>

              <label className="flex items-start gap-2 rounded border border-brand-line bg-brand-surface p-3 text-sm">
                <input
                  type="checkbox"
                  name="whenEmpty"
                  defaultChecked={config["appointments.summaryWhenEmpty"] === "yes"}
                  className="mt-0.5"
                />
                <span>
                  {t("settings.summaryWhenEmpty")}
                  <span className="mt-0.5 block text-xs text-brand-graphite/60">
                    {t("settings.summaryWhenEmptyHint")}
                  </span>
                </span>
              </label>

              {/* The buyer's own reminder, the day before their appointment. */}
              <div className="space-y-3 border-t border-brand-line pt-4">
                <label className="flex items-start gap-2 rounded border border-brand-line bg-brand-surface p-3 text-sm">
                  <input
                    type="checkbox"
                    name="reminderOn"
                    defaultChecked={config["appointments.reminderOn"] === "yes"}
                    className="mt-0.5"
                  />
                  <span>
                    {t("settings.reminderOn")}
                    <span className="mt-0.5 block text-xs text-brand-graphite/60">
                      {t("settings.reminderOnHint")}
                    </span>
                  </span>
                </label>
                <div className="sm:w-48">
                  <label className="label" htmlFor="reminderHour">
                    {t("settings.reminderHour")}
                  </label>
                  <input
                    id="reminderHour"
                    name="reminderHour"
                    inputMode="numeric"
                    defaultValue={config["appointments.reminderHour"]}
                    className="input"
                  />
                  <p className="mt-1 text-xs text-brand-graphite/60">
                    {t("settings.reminderHourHint")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-brand-line pt-4">
                <SubmitButton>{t("common.save")}</SubmitButton>
                <span className="text-xs text-brand-graphite/60">
                  {t("settings.lastRun")}:{" "}
                  {config["appointments.summaryLastResult"] || t("settings.neverRun")}
                </span>
              </div>
            </form>

            <form action={sendSummaryNow} className="mt-4 border-t border-brand-line pt-4">
              <SubmitButton className="btn btn-secondary">{t("settings.sendNow")}</SubmitButton>
            </form>

            {emailConfigured() ? null : (
              <p className="mt-3 max-w-prose rounded border border-[color:var(--color-warning)] bg-brand-surface px-3 py-2 text-xs">
                {t("settings.noEmailYet")}
              </p>
            )}

            <p className="mt-3 max-w-prose text-xs text-brand-graphite/55">
              {t("settings.byScheduler")}
            </p>
          </Card>

          {/* An email to the office when a lead comes in through the QR code. */}
          <div className="mt-4">
            <Card title={t("settings.leadAlert")}>
              <form action={saveLeadAlert} className="space-y-3" data-lead-alert>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="on" defaultChecked={config["leads.alertOn"] === "yes"} className="mt-1" />
                  <span>
                    {t("settings.leadAlertOn")}
                    <span className="block text-xs text-brand-graphite/60">{t("settings.leadAlertOnHint")}</span>
                  </span>
                </label>
                <div>
                  <label className="label" htmlFor="leadAlertTo">
                    {t("settings.leadAlertTo")}
                  </label>
                  <input id="leadAlertTo" name="to" defaultValue={config["leads.alertTo"]} className="input max-w-md" />
                  <p className="mt-1 text-xs text-brand-graphite/60">{t("settings.leadAlertToHint")}</p>
                </div>
                <SubmitButton className="btn btn-secondary">{t("common.save")}</SubmitButton>
              </form>
            </Card>
          </div>

          {/* The mail account, and a button that proves it works. */}
          <div className="mt-4">
            <Card title={t("settings.mail")}>
              {mail ? (
                <p className="mb-3 text-sm">
                  {t("settings.mailSetUp")}{" "}
                  <span className="font-mono text-xs">
                    {mail.host}:{mail.port} {mail.secure ? "(SSL)" : "(STARTTLS)"}, {mail.user || "no user"}, from {mail.from}{mail.tenant ? `, Amazon SES tenant ${mail.tenant}` : ""}
                  </span>
                </p>
              ) : (
                <p className="mb-3 max-w-prose rounded border border-[color:var(--color-warning)] bg-brand-surface px-3 py-2 text-xs">
                  {t("settings.noEmailYet")}
                </p>
              )}

              {/* Why it is or is not set up: names only, never a value. */}
              {diagnosis.hints.length > 0 ? (
                <ul className="mb-3 max-w-prose list-disc space-y-1 rounded border border-[color:var(--color-warning)] bg-brand-surface py-2 pl-7 pr-3 text-xs">
                  {diagnosis.hints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              ) : null}
              <details className="mb-3 text-xs">
                <summary className="cursor-pointer font-semibold text-brand-teal-dark">{t("settings.mailCheck")}</summary>
                <div className="mt-2 space-y-2">
                  <p className="text-brand-graphite/70">
                    {t("settings.mailFolder")} <span className="font-mono">{diagnosis.folder}</span>.{" "}
                    {t("settings.mailStarted")} {diagnosis.startedAt.toLocaleString("en-GB")}.
                  </p>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{t("settings.mailSetting")}</th>
                        <th>{t("settings.mailLoaded")}</th>
                        <th>{t("settings.mailSameAsFile")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnosis.settings.map((one) => (
                        <tr key={one.setting}>
                          <td className="font-mono">{one.setting}</td>
                          <td>
                            {one.foundAs ? (
                              <span className="text-[color:var(--color-positive,#2f855a)]">{one.foundAs} ✓</span>
                            ) : (
                              <span className={one.required ? "text-[color:var(--color-negative)]" : "text-brand-graphite/50"}>
                                {one.required ? t("settings.mailMissing") : t("settings.mailOptional")}
                              </span>
                            )}
                            {one.shown ? <div className="font-mono text-brand-graphite/70">{one.shown}</div> : null}
                            {one.setting === "password" && diagnosis.password ? (
                              <div className="text-brand-graphite/70">
                                {diagnosis.password.length} {t("settings.mailCharacters")}
                                {diagnosis.password.lettersOnly ? `, ${t("settings.mailLettersOnly")}` : ""}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            {one.sameAsLocal === null ? (
                              <span className="text-brand-graphite/40">{t("settings.mailNotInFile")}</span>
                            ) : one.sameAsLocal ? (
                              <span className="text-[color:var(--color-positive,#2f855a)]">✓</span>
                            ) : (
                              <span className="font-semibold text-[color:var(--color-negative)]">{t("settings.mailDiffers")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{t("settings.mailFile")}</th>
                        <th>{t("settings.mailLines")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnosis.files.filter((one) => one.exists).map((one) => (
                        <tr key={one.name}>
                          <td className="font-mono">
                            {one.name}
                            {one.changedAfterStart ? <div className="text-[color:var(--color-negative)]">{t("settings.mailChanged")}</div> : null}
                          </td>
                          <td className="font-mono">
                            {one.keys.length === 0
                              ? t("settings.mailNoLines")
                              : one.keys.map((key) => `${key.key}${key.hasValue ? " ✓" : " (empty)"}`).join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <form action={sendTestEmail} className="flex flex-wrap items-end gap-2">
                <div className="min-w-64 flex-1">
                  <label className="label" htmlFor="testTo">
                    {t("settings.testTo")}
                  </label>
                  <input id="testTo" name="to" type="email" placeholder={t("settings.testToHint")} className="input" />
                </div>
                <SubmitButton className="btn btn-secondary">{t("settings.testSend")}</SubmitButton>
              </form>
              <p className="mt-2 max-w-prose text-xs text-brand-graphite/55">{t("settings.testHint")}</p>
            </Card>
          </div>

          {/* SMS, and a button that proves it works. */}
          <div className="mt-4">
            <Card title={t("settings.texts")}>
              {channelConfigured("SMS") ? (
                <p className="mb-3 text-sm" data-texts-setup>
                  {t("settings.textsVia")} <span className="font-semibold">{textProvider() === "twilio" ? "Twilio" : "SMS.to"}</span>: SMS{" "}
                  <span className={channelConfigured("SMS") ? "text-[color:var(--color-positive,#2f855a)]" : "text-brand-graphite/50"}>
                    {channelConfigured("SMS") ? t("settings.textReady") : t("settings.textNotReady")}
                  </span>
                </p>
              ) : (
                <p className="mb-3 max-w-prose rounded border border-[color:var(--color-warning)] bg-brand-surface px-3 py-2 text-xs">
                  {t("settings.noTextsYet")}
                </p>
              )}
              <form action={sendTestText} className="flex flex-wrap items-end gap-2" data-test-text>
                <div className="min-w-56 flex-1">
                  <label className="label" htmlFor="testTextTo">
                    {t("settings.testTextTo")}
                  </label>
                  <input id="testTextTo" name="to" type="tel" required placeholder={t("settings.testTextToHint")} className="input" />
                </div>
                <input type="hidden" name="channel" value="SMS" />
                <SubmitButton className="btn btn-secondary">{t("settings.testTextSend")}</SubmitButton>
              </form>
              <p className="mt-2 max-w-prose text-xs text-brand-graphite/55">{t("settings.testTextHint")}</p>

              {/* The mobiles an SMS cannot reach as they are written, to fix before a campaign. */}
              <div className="mt-4 border-t border-brand-line pt-3" data-phones-to-check>
                <p className="text-sm font-semibold">
                  {t("settings.phonesToCheck")}: {badPhones.length}
                </p>
                <p className="mt-0.5 max-w-prose text-xs text-brand-graphite/60">{t("settings.phonesToCheckHint")}</p>
                {badPhones.length === 0 ? (
                  <p className="mt-2 text-xs text-[color:var(--color-positive,#2f855a)]">{t("settings.phonesAllGood")}</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="data" data-nosort="true">
                      <thead>
                        <tr>
                          <th>{t("common.name")}</th>
                          <th>{t("leads.phone")}</th>
                          <th>{t("settings.phoneWhy")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {badPhones.map((one) => (
                          <tr key={`${one.kind}${one.id}`} data-phone-row={one.kind}>
                            <td>
                              <a href={one.href} className="font-medium text-brand-teal-dark hover:underline">
                                {one.name}
                              </a>
                              <div className="text-xs text-brand-graphite/50">{t(`settings.phoneKind.${one.kind}` as MessageKey)}</div>
                            </td>
                            <td className="font-mono text-xs">{one.phone}</td>
                            <td className="text-xs">{one.problem}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* The company on its invoices and receipts, and the running numbers. */}
          <div className="mt-4">
            <Card title={t("settings.company")}>
              <p className="mb-3 max-w-prose text-xs text-brand-graphite/60">{t("settings.companyHint")}</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {(["invoice", "receipt", "credit"] as const).map((kind) => (
                  <a
                    key={kind}
                    href={`/api/companies/sample?issuer=&kind=${kind}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary !text-xs"
                  >
                    {t(`subowners.sample.${kind}` as MessageKey)}
                  </a>
                ))}
              </div>
              <form action={saveCompanySettings} className="grid gap-3 sm:grid-cols-2">
                {companyFields.map((field) => (
                  <div key={field.name} className={field.wide ? "sm:col-span-2" : ""}>
                    <label className="label" htmlFor={`company-${field.name}`}>
                      {field.label}
                    </label>
                    <input
                      id={`company-${field.name}`}
                      name={field.name}
                      defaultValue={company[field.key]}
                      className={`input ${company[field.key] ? "" : "border-[color:var(--color-warning)]"}`}
                    />
                  </div>
                ))}
                <div>
                  <label className="label" htmlFor="nextInvoice">
                    {t("settings.nextInvoice")}
                  </label>
                  <input
                    id="nextInvoice"
                    name="nextInvoice"
                    inputMode="numeric"
                    defaultValue={company["numbers.nextInvoice"]}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="nextReceipt">
                    {t("settings.nextReceipt")}
                  </label>
                  <input
                    id="nextReceipt"
                    name="nextReceipt"
                    inputMode="numeric"
                    defaultValue={company["numbers.nextReceipt"]}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="nextCreditNote">
                    {t("settings.nextCreditNote")}
                  </label>
                  <input
                    id="nextCreditNote"
                    name="nextCreditNote"
                    inputMode="numeric"
                    defaultValue={company["numbers.nextCreditNote"]}
                    className="input"
                  />
                </div>
                <p className="text-xs text-brand-graphite/55 sm:col-span-2">{t("settings.numbersHint")}</p>
                <div className="sm:col-span-2">
                  <SubmitButton>{t("common.save")}</SubmitButton>
                </div>
              </form>
            </Card>
          </div>
        </div>

        <div>
          <Card title={t("settings.preview")}>
            <p className="mb-3 text-xs text-brand-graphite/60">{t("settings.previewHint")}</p>
            {summaries.length === 0 ? (
              <Empty message={t("team.none")} />
            ) : (
              <ul className="space-y-3 text-sm">
                {summaries.map((summary) => (
                  <li key={summary.id}>
                    <p className="font-semibold">{summary.name}</p>
                    <p className="text-xs break-all text-brand-graphite/60">
                      {summary.email ?? t("team.noEmail")}
                    </p>
                    <pre className="mt-1 overflow-x-auto rounded border border-brand-line bg-brand-surface p-2 text-xs whitespace-pre-wrap">
                      {summaryText(summary, 0)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
