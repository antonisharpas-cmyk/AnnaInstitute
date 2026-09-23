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
import { saveAutomatic, switchAutomatic } from "./actions";

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
  await requireUser(["ADMIN"]);
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

  const when = (value: Date | null) =>
    value ? new Date(value).toLocaleString(locale === "el" ? "el-GR" : "en-GB") : "";

  return (
    <>
      <PageHeader title={t("emails.title")} subtitle={t("emails.subtitle")} />

      {/* Nothing is sent until the mail account is set up, and saying so here
          saves somebody wondering why a switched on letter never arrived. */}
      {emailConfigured() ? null : (
        <div className="card mb-4 border-[color:var(--color-warning)] p-3 text-sm">
          {t("emails.notConfigured")}
        </div>
      )}

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
                <div>
                  <label className="label" htmlFor={`subjectEl-${letter.id}`}>
                    {t("emails.subjectEl")}
                  </label>
                  <input
                    id={`subjectEl-${letter.id}`}
                    name="subjectEl"
                    defaultValue={letter.subjectEl ?? ""}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`bodyEl-${letter.id}`}>
                    {t("emails.bodyEl")}
                  </label>
                  <textarea
                    id={`bodyEl-${letter.id}`}
                    name="bodyEl"
                    rows={12}
                    defaultValue={letter.bodyEl ?? ""}
                    className="textarea font-mono text-xs"
                  />
                </div>
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
