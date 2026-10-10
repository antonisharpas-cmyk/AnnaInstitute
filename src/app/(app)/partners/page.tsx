import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { labelKey, optionsFor } from "@/lib/choices";
import { listPartners, telHref } from "@/lib/partners";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";
import RowLink from "@/components/RowLink";

/** The directory of the office's outside partners and collaborators. */
export const dynamic = "force-dynamic";

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  await requireUser(["ADMIN"]);
  const params = await searchParams;
  const { t } = await getTranslator();
  const q = (params.q ?? "").trim();
  const category = (params.category ?? "").trim();

  const [found, every, active] = await Promise.all([
    listPartners(q),
    optionsFor("partnerCategory", t, { everything: true }),
    optionsFor("partnerCategory", t),
  ]);

  /* The tabs: the categories in use in the Builder, and any older one a partner still has. */
  const counts = new Map<string, number>();
  for (const row of found) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  const on = new Set(active.map((one) => one.value));
  const tabs = every.filter((one) => on.has(one.value) || (counts.get(one.value) ?? 0) > 0);
  const rows = category ? found.filter((row) => row.category === category) : found;
  const word = (code: string) => t(labelKey("partnerCategory", code) as MessageKey);

  const href = (next: { category?: string }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (next.category) query.set("category", next.category);
    const text = query.toString();
    return text ? `/partners?${text}` : "/partners";
  };

  return (
    <>
      <PageHeader
        title={t("partners.title")}
        subtitle={t("partners.subtitle")}
        action={
          <Link href={category ? `/partners/new?category=${encodeURIComponent(category)}` : "/partners/new"} className="btn btn-primary">
            {t("partners.new")}
          </Link>
        }
      />
      <Card>
        <form action="/partners" method="get" className="mb-3 flex flex-wrap gap-2">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <input name="q" defaultValue={q} placeholder={t("partners.searchPlaceholder")} className="input min-w-0 flex-1 sm:max-w-md" />
          <button type="submit" className="btn btn-secondary">
            {t("common.search")}
          </button>
        </form>

        <nav className="segment mb-4 flex-wrap" aria-label={t("partners.categoryLabel")} data-partner-tabs>
          <Link href={href({})} aria-current={category ? undefined : "true"}>
            {t("common.all")} <span className="text-brand-graphite/50">{found.length}</span>
          </Link>
          {tabs.map((one) => (
            <Link key={one.value} href={href({ category: one.value })} aria-current={category === one.value ? "true" : undefined} data-category={one.value}>
              {one.label} <span className="text-brand-graphite/50">{counts.get(one.value) ?? 0}</span>
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <Empty
            message={q || category ? t("partners.noneFound") : t("partners.none")}
            action={
              q || category ? null : (
                <Link href="/partners/new" className="btn btn-primary">
                  {t("partners.new")}
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data" data-partners>
              <thead>
                <tr>
                  <th>{t("partners.name")}</th>
                  <th>{t("partners.categoryLabel")}</th>
                  <th>{t("partners.email")}</th>
                  <th>{t("partners.mobile")}</th>
                  <th>{t("common.notes")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <RowLink key={row.id} href={`/partners/${row.id}`} data-partner={row.id}>
                    <td>
                      <Link href={`/partners/${row.id}`} className="font-semibold hover:underline" data-open>
                        {row.name}
                      </Link>
                    </td>
                    <td className="nowrap">
                      <Pill tone="teal">{word(row.category)}</Pill>
                    </td>
                    <td>
                      {row.email ? (
                        <a href={`mailto:${row.email}`} className="text-brand-teal-dark hover:underline">
                          {row.email}
                        </a>
                      ) : null}
                    </td>
                    <td className="nowrap">
                      {row.mobile ? (
                        <a href={telHref(row.mobile)} className="text-brand-teal-dark hover:underline">
                          {row.mobile}
                        </a>
                      ) : null}
                      {row.locationUrl ? (
                        <div>
                          <a href={row.locationUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-teal-dark hover:underline" data-partner-map>
                            {t("partners.onTheMap")}
                          </a>
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-xs text-xs text-brand-graphite/70">
                      <span className="line-clamp-2 whitespace-pre-line">{row.notes ?? ""}</span>
                    </td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
