import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenses, installments, leads } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/health";
import { readFlash } from "@/lib/flash";
import { howManyNeedAnAnswer } from "@/lib/appointments";
import { readUndo } from "@/lib/undo";
import { pressingFollowUpCount } from "@/lib/followUps";
import { getTranslator, type MessageKey } from "@/i18n";
import AppShell, { type Alert, type NavItem } from "@/components/AppShell";
import Toaster from "@/components/Toaster";
import Sortable from "@/components/Sortable";
import AfterSave from "@/components/AfterSave";
import SchemaGap from "@/components/SchemaGap";
import { setLocale, signOut, undoLast } from "@/app/actions";

/**
 * Everything behind the login.
 *
 * The shell itself is a client component, because a sidebar that remembers its
 * width, a theme that survives a reload and a search box on Control K all need
 * to live in the browser. What the server does here is decide what goes in it:
 * the sections, what needs attention today, and who is signed in.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  /**
   * Nothing else can work if the database is behind the code, so it is checked
   * once here, before the first query. If something is missing the CRM brings
   * the database up to date itself, on this very connection, and only if that
   * cannot be done does it say so on the screen instead of throwing a query
   * at somebody.
   */
  const gaps = await ensureSchema();
  if (gaps.length > 0) {
    return (
      <SchemaGap
        gaps={gaps}
        labels={{
          title: t("gap.title"),
          note: t("gap.note"),
          missing: t("gap.missing"),
          how: t("gap.how"),
          stop: t("gap.stop"),
          run: "npm run db:fix",
          runNote: t("gap.runNote"),
          start: t("gap.start"),
          warn: t("gap.warn"),
        }}
      />
    );
  }

  // The three figures the bell counts. One query each, all at once.
  const unpaidHere = sql`coalesce((
      select sum(p.amount) from payments p where p.installment_id = installments.id
    ), 0) < ${installments.totalAmount}`;

  const [[late], [waiting], [bills], asking, followUps, said, undo] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(installments)
      .where(
        and(isNotNull(installments.dueDate), lt(installments.dueDate, new Date()), unpaidHere),
      ),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.status, "NEW"), isNull(leads.clientId), isNull(leads.deletedAt))),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(expenses)
      .where(
        and(
          isNotNull(expenses.dueDate),
          lt(expenses.dueDate, new Date()),
          sql`${expenses.status} <> 'PAID'`,
        ),
      ),
    /* Appointments whose day has passed with nobody saying what happened. */
    howManyNeedAnAnswer(),
    /* Follow ups due tomorrow or already due, still pending. */
    pressingFollowUpCount(),
    readFlash(),
    readUndo(),
  ]);

  const items: NavItem[] = [
    { href: "/", label: t("nav.dashboard"), group: "everyDay" },
    { href: "/leads", label: t("nav.leads"), group: "everyDay", count: waiting?.total ?? 0 },
    { href: "/clients", label: t("nav.clients"), group: "everyDay" },
    {
      href: "/appointments",
      label: t("nav.appointments"),
      group: "everyDay",
      count: asking ?? 0,
    },
    { href: "/projects", label: t("nav.projects"), group: "everyDay" },
    { href: "/contracts", label: t("nav.contracts"), group: "everyDay" },
    { href: "/team", label: t("nav.team"), group: "people" },
    { href: "/agents", label: t("nav.agents"), group: "people" },
    { href: "/subowners", label: t("nav.subowners"), group: "people" },
    { href: "/campaigns", label: t("nav.campaigns"), group: "people" },
    { href: "/emails", label: t("nav.emails"), group: "people" },
    { href: "/commissions", label: t("nav.commissions"), group: "money" },
    { href: "/invoices", label: t("nav.invoices"), group: "money", count: bills?.total ?? 0 },
    { href: "/reports", label: t("nav.reports"), group: "insight" },
  ];

  const creates = [
    { href: "/leads/new", label: t("shell.newLead") },
    { href: "/clients/new", label: t("shell.newClient") },
    { href: "/contracts/new", label: t("shell.newContract") },
    { href: "/projects/new", label: t("shell.newProject") },
    { href: "/invoices/new", label: t("shell.newInvoice") },
    { href: "/campaigns/new", label: t("shell.newCampaign") },
    { href: "/agents/new", label: t("shell.newAgent") },
    { href: "/subowners/new", label: t("shell.newPartner") },
  ];

  const alerts: Alert[] = (
    [
      {
        label: t("shell.alertOverdue"),
        href: "/reports/money",
        count: late?.total ?? 0,
        tone: "bad",
      },
      {
        label: t("shell.alertLeads"),
        href: "/leads?status=NEW",
        count: waiting?.total ?? 0,
        tone: "warn",
      },
      {
        label: t("shell.alertBills"),
        href: "/invoices?status=UNPAID",
        count: bills?.total ?? 0,
        tone: "warn",
      },
      {
        /* Yesterday's appointments that nobody has answered for. */
        label: t("appointments.waitingShort"),
        href: "/appointments?when=waiting",
        count: asking ?? 0,
        tone: "warn",
      },
    ] satisfies Alert[]
  ).filter((alert) => alert.count > 0);

  return (
    <>
      <AppShell
        user={{ name: user.name, email: user.email }}
        locale={locale}
        items={items}
        alerts={alerts}
        creates={creates}
        signOut={signOut}
        setLocale={setLocale}
        undo={
          undo
            ? { label: t("said.undo"), title: t("shell.undoTitle"), action: undoLast }
            : undefined
        }
        labels={{
          subtitle: t("app.subtitle"),
          settings: t("nav.settings"),
          search: t("shell.search"),
          searchHint: t("shell.searchHint"),
          nothing: t("shell.nothingFound"),
          goTo: t("shell.goTo"),
          create: t("shell.create"),
          groups: {
            everyDay: t("shell.groupEveryDay"),
            people: t("shell.groupPeople"),
            money: t("shell.groupMoney"),
            insight: t("shell.groupInsight"),
            clients: t("nav.clients"),
            projects: t("nav.projects"),
            units: t("units.title"),
            contracts: t("nav.contracts"),
            leads: t("nav.leads"),
            agents: t("nav.agents"),
            subowners: t("nav.subowners"),
            invoices: t("nav.invoices"),
          },
          quickAdd: t("shell.quickAdd"),
          alerts: t("shell.alerts"),
          noAlerts: t("shell.noAlerts"),
          theme: t("shell.theme"),
          density: t("shell.density"),
          densityRoomy: t("shell.densityRoomy"),
          densityTight: t("shell.densityTight"),
          themeDay: t("shell.themeDay"),
          themeNight: t("shell.themeNight"),
          language: t("shell.language"),
          signOut: t("nav.signOut"),
          shortcuts: t("shell.shortcuts"),
          shortcutsTitle: t("shell.shortcutsTitle"),
          shortcutSearch: t("shell.shortcutSearch"),
          shortcutNew: t("shell.shortcutNew"),
          shortcutTheme: t("shell.shortcutTheme"),
          shortcutHelp: t("shell.shortcutHelp"),
          shortcutClose: t("shell.shortcutClose"),
          menu: t("shell.menu"),
          collapse: t("shell.collapse"),
        }}
      >
        {children}
      </AppShell>

      {/*
        Every table that shows all of itself on the page becomes sortable by
        clicking a heading. Mounted once here rather than on each page, so it
        covers the tables that already exist and the ones added later.
      */}
      <Sortable />

      {/* Anything saved shows up without anybody pressing refresh. */}
      <AfterSave />

      {said ? (
        <Toaster
          message={t(said.message as MessageKey)}
          tone={said.tone}
          undo={undo ? { label: t("said.undo"), action: undoLast } : undefined}
        />
      ) : null}
    </>
  );
}
