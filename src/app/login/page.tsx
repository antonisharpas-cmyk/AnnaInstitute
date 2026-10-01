import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getTranslator } from "@/i18n";
import Logo from "@/components/Logo";
import LoginForm from "./LoginForm";

/**
 * The first thing anybody sees.
 *
 * It is worth more than a box in the middle of a grey page: this is the screen
 * that tells the office, twice a day, what kind of tool they are about to use.
 * So the sign in sits on one side and, on the other, the glass towers from One
 * Eleven's own brand guideline under its teal. On a telephone the picture
 * steps aside and the form takes the screen.
 */
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { t } = await getTranslator();

  return (
    <main className="loginpage">
      <section className="loginside no-print" aria-hidden="true">
        {/* The towers from the brand guideline, under the brand's own teal. */}
        <div className="loginphoto" />
        <div className="loginshade" />
        <div className="loginmark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/oneeleven-mark.png" alt="" width={72} />
        </div>
        <div className="loginwords">
          <p className="loginhead">{t("login.side")}</p>
          <p className="loginnote">{t("login.sideNote")}</p>
        </div>
      </section>

      <section className="loginmain">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <Logo width={168} />
            <div className="mt-2 text-sm text-brand-graphite/70">{t("app.subtitle")}</div>
          </div>

          <div className="card logincard p-6">
            <h1 className="mb-1 text-lg font-semibold tracking-tight">{t("login.title")}</h1>
            <p className="mb-5 text-xs text-brand-graphite/65">{t("login.hint")}</p>
            <LoginForm
              labels={{
                email: t("login.email"),
                password: t("login.password"),
                submit: t("login.submit"),
                failed: t("login.failed"),
                show: t("login.showPassword"),
                hide: t("login.hidePassword"),
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
