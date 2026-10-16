import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { optionsFor } from "@/lib/choices";
import { labelKey, shownCode } from "@/lib/choices/lists";
import { knownNames, listCash } from "@/lib/cashEntries";
import { many } from "@/lib/filters";
import { formatAmount, toCents } from "@/lib/money";
import { ourCompanies } from "@/lib/parties";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import Disclosure from "@/components/Disclosure";
import Pagination, { paginate } from "@/components/Pagination";
import Pick from "@/components/Pick";
import RowLink from "@/components/RowLink";
import SearchBox from "@/components/SearchBox";
import CashForm from "./CashForm";
import { createCashEntry } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Cash, paid and received outside the invoices.
 *
 * A record of the money only: no invoice, no receipt, no VAT, and nothing of
 * it goes to the accountant. It counts in the Income and expenses report and
 * in the Shareholders report, as cash beside the invoices.
 */
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; direction?: string; company?: string; project?: string; page?: string }>;
}) {
  await requireUser(["ADMIN"]);
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const direction = many(params.direction).length === 1 ? many(params.direction)[0] : "";
  const { page, perPage, offset } = paginate(params as Record<string, string | undefined>, 20);

  const [list, categories, projectRows, companies, names] = await Promise.all([
    listCash({ query, direction, company: params.company, project: params.project }, perPage, offset),
    optionsFor("expenseCategory", t),
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    ourCompanies(),
    knownNames(),
  ]);
  const money = (cents: number) => formatAmount(cents, locale);
  const day = (value: Date) => new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");
  const companyName = new Map(companies.map((one) => [one.id, one.name]));
  const whatFor = (row: { category: string; categoryChoice: string | null; categoryOther: string | null }) =>
    row.category === "OTHER" && row.categoryOther
      ? row.categoryOther
      : t(labelKey("expenseCategory", shownCode(row.category, row.categoryChoice)) as MessageKey);
  const filtered = Boolean(query || params.direction || params.company || params.project);

  return (
    <>
      <PageHeader title={t("cash.title")} subtitle={t("cash.subtitle")} />

      <div className="tinted mb-4 grid gap-3 sm:grid-cols-2" data-cash-totals>
        <Stat tone="good" label={t("cash.received")} value={money(list.receivedCents)} />
        <Stat tone="bad" label={t("cash.paid")} value={money(list.paidCents)} />
      </div>

      <div className="space-y-4">
        <Card title={t("cash.record")}>
          <Disclosure showLabel={t("cash.add")} hideLabel={t("common.cancel")}>
            <div className="mt-3 rounded border border-brand-line bg-brand-surface p-3">
              <CashForm action={createCashEntry} categories={categories} projects={projectRows} companies={companies} names={names} t={t} />
            </div>
          </Disclosure>
        </Card>

        <Card>
          <SearchBox
            key={`${query}|${params.direction}|${params.company}|${params.project}`}
            action="/invoices/cash"
            query={query}
            placeholder={t("cash.searchPlaceholder")}
            searchLabel={t("common.search")}
            clearLabel={t("common.clear")}
            filtered={filtered}
            resetLabel={t("list.resetAll")}
          >
            <Pick
              name="direction"
              label={t("cash.which")}
              chosen={many(params.direction)}
              anything={t("common.all")}
              choices={[
                { value: "IN", label: t("cash.received") },
                { value: "OUT", label: t("cash.paid") },
              ]}
            />
            <Pick
              name="company"
              label={t("cash.ourCompany")}
              chosen={many(params.company)}
              anything={t("common.all")}
              choices={companies.map((one) => ({ value: one.id || "oneEleven", label: one.name }))}
            />
            <Pick
              name="project"
              label={t("projects.title")}
              chosen={many(params.project)}
              anything={t("common.all")}
              choices={[{ value: "NONE", label: t("invoices.noProject") }, ...projectRows.map((one) => ({ value: one.id, label: one.name }))]}
            />
          </SearchBox>

          <div className="mt-4 overflow-x-auto">
            {list.rows.length === 0 ? (
              <Empty message={filtered ? t("cash.noneFound") : t("cash.none")} />
            ) : (
              <table className="data" data-cash-list>
                <thead>
                  <tr>
                    <th>{t("common.date")}</th>
                    <th>{t("cash.which")}</th>
                    <th>{t("cash.party")}</th>
                    <th>{t("cash.whatFor")}</th>
                    <th>{t("projects.title")}</th>
                    <th>{t("cash.ourCompany")}</th>
                    <th className="num">{t("cash.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map(({ entry, project }) => (
                    <RowLink key={entry.id} href={`/invoices/cash/${entry.id}`} data-cash={entry.direction}>
                      <td className="whitespace-nowrap">{day(entry.entryDate)}</td>
                      <td>
                        <Pill tone={entry.direction === "IN" ? "good" : "bad"}>
                          {entry.direction === "IN" ? t("cash.kindIn") : t("cash.kindOut")}
                        </Pill>
                      </td>
                      <td>
                        <Link href={`/invoices/cash/${entry.id}`} className="font-semibold hover:underline" data-open>
                          {entry.party}
                        </Link>
                        {entry.description ? <div className="text-xs text-brand-graphite/60">{entry.description}</div> : null}
                      </td>
                      <td>{whatFor(entry)}</td>
                      <td className="text-xs">{project?.name ?? t("invoices.noProject")}</td>
                      <td className="text-xs">{companyName.get(entry.ourCompanyId) ?? companies[0]?.name ?? ""}</td>
                      <td className={`num whitespace-nowrap font-semibold ${entry.direction === "IN" ? "text-[color:var(--color-positive)]" : "text-[color:var(--color-negative)]"}`}>
                        {money(entry.direction === "IN" ? toCents(entry.amount) : -toCents(entry.amount))}
                      </td>
                    </RowLink>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Pagination
            basePath="/invoices/cash"
            params={params as Record<string, string | undefined>}
            info={{ page, perPage, total: list.total }}
            labels={{ previous: t("common.previous"), next: t("common.next"), showing: t("common.showing"), of: t("common.of") }}
          />
          <p className="mt-2 text-xs text-brand-graphite/60">{t("cash.listNote")}</p>
        </Card>
      </div>
    </>
  );
}
