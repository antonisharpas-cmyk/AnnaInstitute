import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailTemplates } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { AUTOMATIC_KEYS, ensureSystemTemplates, requiredKeys } from "@/lib/templates";
import { automaticHistory } from "@/lib/automaticEmails";
import { emailConfigured } from "@/lib/messaging";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import SubmitButton from "@/components/SubmitButton";
import EmailSwitch from "@/components/EmailSwitch";
import { saveAutomatic, saveTestAddress, sendTestLetterNow, switchAutomatic } from "./actions";
import { readSetting } from "@/lib/settings";
import type { MessageKey } from "@/i18n";

/**
 * The letters the CRM writes by itself.
 *
 * One page, four letters, each with the same three things: when it goes, a
 * switch, and its own words in both languages. The office asked for exactly
 * this, and the reason is worth saying: an email that leaves the building
 * without anybody pressing send has to be readable in full, beforehand, by the
 * person whose name is at the bottom of it.
 *
 * Underneath is the record of what has actually gone, because a switch and a
 * draft are promises and the list is what happened.
 */
export default async function AutomaticEmailsPage() {
  const user = await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  await ensureSystemTemplates();

  const [written, history] = await Promise.all([
    db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.isAutomatic, true))
      .orderBy(asc(emailTemplates.createdAt)),
    automaticHistory(30),
  ]);

  /*
   * In the order things happen to a buyer, not the order the rows were made.
   *
   * They are all written at the same instant the first time somebody opens this
   * page, so the database has no opinion about which comes first. The office
   * does: reservation, signing, installments, paid off, then the three that
   * follow an appointment.
   */
  const order = (key: string) => {
    const at = (AUTOMATIC_KEYS as readonly string[]).indexOf(key);
    return at === -1 ? AUTOMATIC_KEYS.length : at;
  };
  const letters = [...written].sort((a, b) => order(a.key) - order(b.key));

  /* Where the tests go, and the twelve emails in the order they happen. */
  const testTo = (await readSetting("emails.testAddress")).trim();
  const nameOf = (key: string) =>
    letters.find((one) => one.key === key)?.name ?? t(`emails.test.${key}` as MessageKey);
  const testGroups: { title: string; keys: string[] }[] = [
    { title: t("emails.test.buyer"), keys: ["paid_reservation", "paid_signing", "paid_installment", "paid_final", "paper_review", "paper_invoice", "paper_signed"] },
    {
      title: t("emails.test.appointments"),
      keys: ["appointment_made", "appointment_moved", "appointment_cancelled", "appointment_reminder"],
    },
    { title: t("emails.test.agent"), keys: ["agent_new_lead", "agent_new_client", "agent_commission"] },
    { title: t("emails.test.clients"), keys: ["birthday"] },
    { title: t("emails.test.team"), keys: ["day_summary"] },
    { title: t("emails.test.invoices"), keys: ["partner_invoice", "invoice_received"] },
  ];

  const when = (value: Date | null) =>
    value ? new Date(value).toLocaleString(locale === "el" ? "el-GR" : "en-GB") : "";

  return (
    <>
      <PageHeader title={t("emails.title")} subtitle={t("emails.subtitle")} />

      {/* Every email from the CRM, on or off, in one place. */}
      <EmailSwitch />

      {/* Nothing is sent until the mail account is set up, and saying so here
          saves somebody wondering why a switched on letter never arrived. */}
      {emailConfigured() ? null : (
        <div className="card mb-4 border-[color:var(--color-warning)] p-3 text-sm">
          {t("emails.notConfigured")}
        </div>
      )}

      {/* Try every letter on yourself first, one at a time. */}
      <div className="mb-4">
        <Card title={t("emails.test.title")}>
          <p className="mb-3 max-w-prose text-sm text-brand-graphite/70">{t("emails.test.note")}</p>
          {emailConfigured() ? null : (
            <p className="mb-3 text-sm text-[color:var(--color-negative)]">{t("emails.test.notConfigured")}</p>
          )}
          <form action={saveTestAddress} className="mb-4 flex flex-wrap items-end gap-2" data-test-address>
            <div className="min-w-64 flex-1 sm:max-w-sm">
              <label className="label" htmlFor="testTo">
                {t("emails.test.address")}
              </label>
              <input
                id="testTo"
                name="to"
                type="email"
                defaultValue={testTo}
                placeholder={user.email}
                className="input"
              />
              <p className="mt-1 text-xs text-brand-graphite/60">{t("emails.test.addressHint")}</p>
            </div>
            <SubmitButton className="btn btn-secondary">{t("common.save")}</SubmitButton>
          </form>
          <p className="mb-2 text-xs text-brand-graphite/60">
            {t("emails.test.goesTo")} <span className="font-semibold">{testTo || user.email}</span>
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {testGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite/60">
                  {group.title}
                </p>
                <ul className="divide-y divide-brand-line rounded border border-brand-line">
                  {group.keys.map((key) => (
                    <li key={key} className="flex items-center justify-between gap-2 px-3 py-1.5" data-test-letter={key}>
                      <span className="text-sm">{nameOf(key)}</span>
                      <form action={sendTestLetterNow.bind(null, key)}>
                        <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                          {t("emails.test.send")}
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {letters.map((letter) => (
          <Card
            key={letter.id}
            title={letter.name}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={letter.isActive ? "good" : "warn"}>
                  {letter.isActive ? t("emails.on") : t("emails.off")}
                </Pill>
                <form action={switchAutomatic.bind(null, letter.id, !letter.isActive)}>
                  <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">
                    {letter.isActive ? t("emails.switchOff") : t("emails.switchOn")}
                  </SubmitButton>
                </form>
              </div>
            }
          >
            <p className="mb-3 max-w-prose text-sm text-brand-graphite/70">
              {letter.description}
            </p>

            <p className="mb-3 text-xs text-brand-graphite/60">
              {t("emails.keysKept")}{" "}
              {requiredKeys(letter.key).map((key) => (
                <code key={key} className="mr-2 font-mono">{`{{${key}}}`}</code>
              ))}
            </p>

            <Disclosure showLabel={t("emails.reword")} hideLabel={t("common.cancel")}>
              <form
                action={saveAutomatic.bind(null, letter.id)}
                className="space-y-3 rounded border border-brand-line bg-brand-surface p-3"
              >
                <div>
                  <label className="label" htmlFor={`subject-${letter.id}`}>
                    {t("emails.subject")}
                  </label>
                  <input
                    id={`subject-${letter.id}`}
                    name="subject"
                    defaultValue={letter.subject ?? ""}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`body-${letter.id}`}>
                    {t("emails.body")}
                  </label>
                  <textarea
                    id={`body-${letter.id}`}
                    name="body"
                    rows={12}
                    defaultValue={letter.body}
                    className="textarea font-mono text-xs"
                  />
                </div>
                {/* The appointment letters also go by SMS, with this shorter text. */}
                {letter.key.startsWith("appointment_") ? (
                  <div>
                    <label className="label" htmlFor={`sms-${letter.id}`}>
                      {t("emails.smsText")}
                    </label>
                    <textarea
                      id={`sms-${letter.id}`}
                      name="bodySms"
                      rows={3}
                      defaultValue={letter.bodyWhatsapp ?? ""}
                      className="textarea font-mono text-xs"
                    />
                    <p className="mt-1 text-xs text-brand-graphite/60">{t("emails.smsHint")}</p>
                  </div>
                ) : null}
                {/* English only: every letter the CRM sends goes in English. */}
                <SubmitButton>{t("common.save")}</SubmitButton>
              </form>
            </Disclosure>
          </Card>
        ))}
      </div>

      {/* What has actually gone, and what is waiting. */}
      <div className="mt-4">
        <Card title={t("emails.history")}>
          {history.length === 0 ? (
            <Empty message={t("emails.noneYet")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("emails.letter")}</th>
                    <th>{t("clients.title")}</th>
                    <th>{t("contracts.title")}</th>
                    <th>{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(({ row, client, contract }) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-xs">
                        {when(row.sentAt ?? row.createdAt)}
                      </td>
                      <td className="text-xs">
                        {letters.find((one) => one.key === row.templateKey)?.name ??
                          row.templateKey}
                      </td>
                      <td className="text-xs">
                        {client ? (
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-brand-teal-dark hover:underline"
                            prefetch={false}
                          >
                            {client.firstName} {client.lastName}
                          </Link>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="text-xs">
                        {contract ? (
                          <Link
                            href={`/contracts/${contract.id}`}
                            className="text-brand-teal-dark hover:underline"
                            prefetch={false}
                          >
                            {contract.reference}
                          </Link>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="text-xs">
                        <Pill
                          tone={
                            row.status === "SENT"
                              ? "good"
                              : row.status === "WAITING"
                                ? "warn"
                                : "neutral"
                          }
                        >
                          {t(
                            row.status === "SENT"
                              ? "emails.sent"
                              : row.status === "WAITING"
                                ? "emails.waiting"
                                : row.status === "FAILED"
                                  ? "emails.failed"
                                  : "emails.skipped",
                          )}
                        </Pill>
                        {row.reason ? (
                          <div className="mt-0.5 text-brand-graphite/60">{row.reason}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
