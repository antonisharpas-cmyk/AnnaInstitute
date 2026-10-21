import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { changeOwnPassword } from "../../settings/logins/actions";

/*
 * My password: anybody signed in changes their own, knowing the current one.
 * Other devices still signed in with the old password are signed out.
 */
export default async function MyPasswordPage() {
  const me = await requireUser();
  const { t } = await getTranslator();

  return (
    <>
      <PageHeader title={t("account.password")} subtitle={t("account.passwordSubtitle")} />
      <div className="max-w-md">
        <Card title={me.email}>
          <form action={changeOwnPassword} className="space-y-3" data-my-password>
            {/* The address, for the browser's password manager to file the new one under. */}
            <input type="email" name="username" defaultValue={me.email} autoComplete="username" hidden readOnly />
            <div>
              <label className="label" htmlFor="current">
                {t("account.current")}
              </label>
              <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="next">
                {t("account.new")}
              </label>
              <input id="next" name="next" type="password" required minLength={8} autoComplete="new-password" className="input" />
              <p className="mt-1 text-xs text-brand-graphite/60">{t("logins.passwordHint").split(".")[0]}.</p>
            </div>
            <div>
              <label className="label" htmlFor="again">
                {t("account.repeat")}
              </label>
              <input id="again" name="again" type="password" required minLength={8} autoComplete="new-password" className="input" />
            </div>
            <SubmitButton className="btn btn-primary">{t("account.change")}</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
