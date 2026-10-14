import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { PageHeader } from "@/components/ui";

/** Every report, by name. Each opens on its own page with its own filters. */
const REPORTS: { href: string; title: MessageKey }[] = [
  { href: "/reports/apartments", title: "sales.title" },
  { href: "/reports/agents", title: "reports.agents" },
  { href: "/reports/leads", title: "reports.leadsReport" },
  { href: "/reports/marketing", title: "reports.marketing" },
  { href: "/reports/costs", title: "reports.costs" },
  { href: "/reports/constructors", title: "reports.constructors" },
  { href: "/reports/project", title: "projectReport.title" },
  { href: "/reports/shareholders", title: "reports.shareholders" },
];

export default async function ReportsPage() {
  const { t } = await getTranslator();

  return (
    <>
      <PageHeader title={t("reports.title")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-report-list>
        {REPORTS.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="card flex items-center justify-between gap-3 p-5 text-base font-semibold text-brand-teal-dark transition hover:bg-brand-teal-soft/40"
          >
            {t(report.title)}
            <span aria-hidden="true" className="text-brand-graphite/50">
              &rarr;
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
