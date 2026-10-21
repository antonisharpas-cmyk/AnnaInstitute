import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { BackLink, Card, PageHeader, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import PasswordField from "./PasswordField";
import { addLogin, resetLoginPassword, saveLogin, setLoginActive } from "./actions";

/*
 * Who can sign in to the CRM.
 *
 * The office's own people, each with a name, an email and a password. An
 * administrator adds them, renames them, gives them a new password and
 * switches them off when they leave; each person changes their own password
 * under My password. Everyone has full access for now.
 */
export default async function LoginsPage() {
  const me = await requireUser(["ADMIN"]);
  const { t, locale } = await getTranslator();

  const people = await db
    .select()
    .from(users)
    .where(eq(users.role, "ADMIN"))
    .orderBy(desc(users.isActive), asc(users.name));

  const when = (value: Date | null) =>
    value
      ? value.toLocaleString(locale === "el" ? "el-GR" : "en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : t("logins.never");

  const passwordLabels = { makeOne: t("logins.makeOne"), show: t("logins.show"), hide: t("logins.hide") };

  return (
    <>
      <BackLink href="/settings" label={t("settings.title")} />
      <PageHeader title={t("logins.title")} subtitle={t("logins.subtitle")} />

      <div className="max-w-5xl space-y-4">
        <Card title={t("logins.list")} flush>
          <div className="overflow-x-auto">
            <table className="data" data-nosort="true" data-logins>
              <thead>
                <tr>
                  <th>{t("logins.name")}</th>
                  <th>{t("logins.email")}</th>
                  <th>{t("logins.role")}</th>
                  <th>{t("logins.lastLogin")}</th>
                  <th>{t("logins.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {people.map((one) => {
                  const self = one.id === me.id;
                  return (
                    <tr key={one.id} data-login={one.email}>
                      <td className="font-medium">
                        {one.name}
                        {self ? <span className="ml-2 text-xs text-brand-graphite/60">({t("logins.you")})</span> : null}
                      </td>
                      <td>{one.email}</td>
                      <td className="text-sm">{t("logins.admin")}</td>
                      <td className="text-sm">{when(one.lastLoginAt)}</td>
                      <td>
                        <Pill tone={one.isActive ? "good" : "bad"}>{one.isActive ? t("logins.active") : t("logins.off")}</Pill>
                      </td>
                      <td className="text-right">
                        <details className="inline-block text-left" data-login-change>
                          <summary className="btn btn-secondary !px-3 !py-1 !text-xs cursor-pointer list-none">
                            {t("common.edit")}
                          </summary>
                          <div className="mt-2 w-[22rem] max-w-[80vw] space-y-4 rounded border border-brand-line bg-brand-surface p-3 text-sm">
                            {/* Name and email */}
                            <form action={saveLogin.bind(null, one.id)} className="space-y-2">
                              <p className="label !mb-0">{t("logins.edit")}</p>
                              <input name="name" defaultValue={one.name} required className="input" aria-label={t("logins.name")} />
                              <input name="email" type="email" defaultValue={one.email} required className="input" aria-label={t("logins.email")} />
                              <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("logins.save")}</SubmitButton>
                            </form>

                            {/* A new password */}
                            <form action={resetLoginPassword.bind(null, one.id)} className="space-y-2 border-t border-brand-line pt-3">
                              <p className="label !mb-0">{t("logins.reset")}</p>
                              <PasswordField labels={passwordLabels} />
                              <p className="text-xs text-brand-graphite/60">{t("logins.resetHint")}</p>
                              <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("logins.resetButton")}</SubmitButton>
                            </form>

                            {/* Switched off, or on again */}
                            <div className="space-y-2 border-t border-brand-line pt-3">
                              {self ? (
                                <p className="text-xs text-brand-graphite/60">{t("logins.cannotSelf")}</p>
                              ) : (
                                <form action={setLoginActive.bind(null, one.id, !one.isActive)}>
                                  <SubmitButton className={`btn !px-3 !py-1 !text-xs ${one.isActive ? "btn-secondary" : "btn-primary"}`}>
                                    {one.isActive ? t("logins.switchOff") : t("logins.switchOn")}
                                  </SubmitButton>
                                  <p className="mt-1 text-xs text-brand-graphite/60">{t("logins.offHint")}</p>
                                </form>
                              )}
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-brand-line px-4 py-2.5 text-xs text-brand-graphite/60">{t("logins.roleNote")}</p>
        </Card>

        <Card title={t("logins.add")}>
          <form action={addLogin} className="grid max-w-2xl gap-3 sm:grid-cols-2" data-add-login>
            <div>
              <label className="label" htmlFor="loginName">
                {t("logins.name")}
              </label>
              <input id="loginName" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="loginEmail">
                {t("logins.email")}
              </label>
              <input id="loginEmail" name="email" type="email" required className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="loginPassword">
                {t("logins.tempPassword")}
              </label>
              <PasswordField id="loginPassword" labels={passwordLabels} />
              <p className="mt-1 text-xs text-brand-graphite/60">{t("logins.passwordHint")}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="label">{t("logins.role")}</p>
              <p className="text-sm">{t("logins.admin")}</p>
            </div>
            <p className="text-xs text-brand-graphite/60 sm:col-span-2">{t("logins.addHint")}</p>
            <div className="sm:col-span-2">
              <SubmitButton className="btn btn-primary">{t("logins.addButton")}</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
