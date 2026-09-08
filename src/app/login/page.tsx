import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getTranslator } from "@/i18n";
import Logo from "@/components/Logo";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { t } = await getTranslator();

  return (
    <main className="grid min-h-screen place-items-center bg-brand-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo width={170} />
          <div className="mt-2 text-sm text-brand-graphite/70">{t("app.subtitle")}</div>
        </div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold mb-4">{t("login.title")}</h1>
          <LoginForm
            labels={{
              email: t("login.email"),
              password: t("login.password"),
              submit: t("login.submit"),
              failed: t("login.failed"),
            }}
          />
        </div>
      </div>
    </main>
  );
}
