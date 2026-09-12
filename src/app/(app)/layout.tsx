import { requireUser } from "@/lib/auth";
import { getTranslator } from "@/i18n";
import Nav from "@/components/Nav";
import LocaleSwitch from "@/components/LocaleSwitch";
import Logo from "@/components/Logo";
import { signOut } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const items = [
    { href: "/", label: t("nav.dashboard") },
    { href: "/leads", label: t("nav.leads") },
    { href: "/projects", label: t("nav.projects") },
    { href: "/clients", label: t("nav.clients") },
    { href: "/contracts", label: t("nav.contracts") },
    { href: "/agents", label: t("nav.agents") },
    { href: "/commissions", label: t("nav.commissions") },
    { href: "/campaigns", label: t("nav.campaigns") },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-brand-line bg-white px-4 py-5 md:flex">
        <div className="mb-6 px-2">
          <Logo width={130} />
          <div className="mt-2 text-xs text-brand-graphite/70">{t("app.subtitle")}</div>
        </div>
        <Nav items={items} />
        <div className="mt-auto space-y-3 pt-6">
          <LocaleSwitch current={locale} />
          <div className="border-t border-brand-line pt-3">
            <div className="truncate text-xs font-semibold text-brand-graphite">{user.name}</div>
            <div className="truncate text-xs text-brand-graphite/60">{user.email}</div>
            <form action={signOut} className="mt-2">
              <button type="submit" className="text-xs text-brand-teal hover:text-brand-teal-dark">
                {t("nav.signOut")}
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-3 border-b border-brand-line bg-white px-4 py-3 md:hidden">
          <Logo width={104} />
          <LocaleSwitch current={locale} />
        </header>
        <main className="mx-auto max-w-[90rem] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
