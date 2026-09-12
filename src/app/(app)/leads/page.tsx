import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { leadCounts, leadStatusTone, listLeads } from "@/lib/leads";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";

const PER_PAGE = 20;

const when = (value: Date, locale: string) =>
  new Date(value).toLocaleString(locale === "el" ? "el-GR" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const status = params.status ?? "";
  const source = params.source ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const [{ rows, total }, counts] = await Promise.all([
    listLeads({ query, status, source, limit: perPage, offset }),
    leadCounts(),
  ]);

  return (
    <>
      <PageHeader
        title={t("leads.title")}
        subtitle={t("leads.subtitle")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/leads/api" className="btn btn-secondary">
              {t("leads.apiAccess")}
            </Link>
            <Link href="/leads/new" target="_blank" rel="noreferrer" className="btn btn-primary">
              {t("leads.newLead")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t("leads.fresh")} value={String(counts.fresh)} />
        <Stat label={t("leads.working")} value={String(counts.working)} />
        <Stat label={t("leads.convertedCount")} value={String(counts.converted)} />
      </div>

      <Card>
        <SearchBox
          action="/leads"
          query={query}
          placeholder={t("leads.searchPlaceholder")}
          searchLabel={t("common.search")}
          clearLabel={t("common.clear")}
        >
          <div className="w-48">
            <label className="label" htmlFor="status">
              {t("common.status")}
            </label>
            <select id="status" name="status" defaultValue={status} className="select">
              <option value="">{t("common.all")}</option>
              <option value="NEW">{t("leads.status.NEW")}</option>
              <option value="CONTACTED">{t("leads.status.CONTACTED")}</option>
              <option value="QUALIFIED">{t("leads.status.QUALIFIED")}</option>
              <option value="CONVERTED">{t("leads.status.CONVERTED")}</option>
              <option value="CLOSED">{t("leads.status.CLOSED")}</option>
            </select>
          </div>

          <div className="w-48">
            <label className="label" htmlFor="source">
              {t("leads.camefrom")}
            </label>
            <select id="source" name="source" defaultValue={source} className="select">
              <option value="">{t("common.all")}</option>
              <option value="WEBSITE">{t("leads.source.WEBSITE")}</option>
              <option value="ENQUIRY">{t("leads.source.ENQUIRY")}</option>
              <option value="AGENT">{t("leads.source.AGENT")}</option>
              <option value="WHATSAPP">{t("leads.source.WHATSAPP")}</option>
              <option value="OTHER">{t("leads.source.OTHER")}</option>
            </select>
          </div>
        </SearchBox>

        <div className="mt-4 overflow-x-auto">
          {rows.length === 0 ? (
            <Empty
              message={query || status || source ? t("leads.noneFound") : t("leads.noneYet")}
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("leads.received")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("leads.contact")}</th>
                  <th>{t("leads.camefrom")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("leads.about")}</th>
                  <th>{t("leads.note")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.lead.id}>
                    <td className="whitespace-nowrap text-xs">{when(r.lead.createdAt, locale)}</td>
                    <td>
                      <Link
                        href={`/leads/${r.lead.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:underline"
                      >
                        {[r.lead.firstName, r.lead.lastName].filter(Boolean).join(" ") || "?"}
                      </Link>
                    </td>
                    <td className="text-xs">
                      <div className="break-all">{r.lead.email ?? ""}</div>
                      <div>{r.lead.phone ?? ""}</div>
                    </td>
                    <td className="text-xs">
                      <div>{t(`leads.source.${r.lead.sourceKind}` as MessageKey)}</div>
                      {r.lead.sourceKind === "OTHER" && r.lead.source ? (
                        <div className="text-brand-graphite/60">{r.lead.source}</div>
                      ) : null}
                      {r.lead.utmCampaign ? (
                        <div className="text-brand-graphite/60">{r.lead.utmCampaign}</div>
                      ) : null}
                    </td>
                    <td>
                      <Pill tone={leadStatusTone(r.lead.status) as "good" | "warn" | "neutral"}>
                        {t(`leads.status.${r.lead.status}` as MessageKey)}
                      </Pill>
                      {r.client ? (
                        <div className="mt-1">
                          <Link
                            href={`/clients/${r.client.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-brand-teal-dark hover:underline"
                          >
                            {r.client.firstName} {r.client.lastName}
                          </Link>
                        </div>
                      ) : null}
                    </td>
                    <td className="text-xs">
                      {r.project ? (
                        <Link
                          href={`/projects/${r.project.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {r.project.name}
                        </Link>
                      ) : (
                        (r.lead.projectName ?? "")
                      )}
                      {r.lead.unitCode ? <div>{r.lead.unitCode}</div> : null}
                    </td>
                    <td className="max-w-80 text-xs text-brand-graphite/70">
                      {r.lead.message ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          basePath="/leads"
          params={params}
          info={{ page, perPage, total }}
          labels={{
            previous: t("common.previous"),
            next: t("common.next"),
            showing: t("common.showing"),
            of: t("common.of"),
          }}
        />
      </Card>
    </>
  );
}
