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

  /* The order the office asked for: what is done every day first, then the
     work itself, the people, the reach, the money and the figures. */
  const items: NavItem[] = [
    { href: "/", label: t("nav.dashboard"), group: "main" },
    { href: "/leads", label: t("nav.leads"), group: "main", count: waiting?.total ?? 0 },
    {
      href: "/follow-ups",
      label: t("nav.followUps"),
      group: "main",
      count: followUps ?? 0,
    },
    { href: "/clients", label: t("nav.clients"), group: "main" },
    {
      href: "/appointments",
      label: t("nav.appointments"),
      group: "main",
      count: asking ?? 0,
    },
    { href: "/projects", label: t("nav.projects"), group: "work" },
    { href: "/contracts", label: t("nav.contracts"), group: "work" },
    { href: "/team", label: t("nav.team"), group: "network" },
    { href: "/agents", label: t("nav.agents"), group: "network" },
    { href: "/subowners", label: t("nav.subowners"), group: "network" },
    { href: "/campaigns", label: t("nav.campaigns"), group: "marketing" },
    { href: "/emails", label: t("nav.emails"), group: "marketing" },
    { href: "/commissions", label: t("nav.commissions"), group: "finance" },
    {
      href: "/invoices",
      label: t("nav.invoices"),
      group: "finance",
      count: bills?.total ?? 0,
      /* Two kinds of paper: what we issue to buyers, and what the company is billed. */
      children: [
        { href: "/invoices/clients", label: t("nav.invoicesClients") },
        { href: "/invoices", label: t("nav.invoicesCompany"), count: bills?.total ?? 0 },
      ],
    },
    { href: "/reports", label: t("nav.reports"), group: "insights" },
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
            main: t("shell.groupMain"),
            work: t("shell.groupWork"),
            network: t("shell.groupNetwork"),
            marketing: t("shell.groupMarketing"),
            finance: t("shell.groupFinance"),
            insights: t("shell.groupInsights"),
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
          message={
            /* "key|detail": the sentence, then what the server actually said. */
            said.message.includes("|")
              ? `${t(said.message.split("|")[0] as MessageKey)}: ${said.message.split("|").slice(1).join("|")}`
              : t(said.message as MessageKey)
          }
          tone={said.tone}
          undo={undo ? { label: t("said.undo"), action: undoLast } : undefined}
        />
      ) : null}
    </>
  );
}
