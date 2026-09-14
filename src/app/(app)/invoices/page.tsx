import Link from "next/link";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { EXPENSE_CATEGORIES, expenseStatusTone, expensesByCategory, listExpenses } from "@/lib/expenses";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";

const PER_PAGE = 20;

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const category = params.category ?? "";
  const status = params.status ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const [{ rows, total, billedCents, paidCents, owedCents }, byCategory] = await Promise.all([
    listExpenses({ query, category, status, limit: perPage, offset }),
    expensesByCategory(),
  ]);

  const today = new Date();

  return (
    <>
      <PageHeader
        title={t("invoices.title")}
        subtitle={t("invoices.subtitle")}
        action={
          <Link href="/invoices/new" target="_blank" rel="noreferrer" className="btn btn-primary">
            {t("invoices.new")}
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t("invoices.billed")} value={formatAmount(billedCents, locale)} />
        <Stat label={t("invoices.paid")} value={formatAmount(paidCents, locale)} />
        <Stat label={t("invoices.owed")} value={formatAmount(owedCents, locale)} />
      </div>

      <div className="space-y-4">
        <Card title={t("invoices.byCategory")}>
          {byCategory.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("invoices.category")}</th>
                    <th className="ctr">{t("invoices.count")}</th>
                    <th className="ctr">{t("invoices.billed")}</th>
                    <th className="ctr">{t("invoices.owed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((row) => (
                    <tr key={row.category}>
                      <td>
                        <Link
                          href={`/invoices?category=${row.category}`}
                          className="hover:underline"
                        >
                          {t(`invoices.category.${row.category}` as MessageKey)}
                        </Link>
                      </td>
                      <td className="ctr">{row.count}</td>
                      <td className="ctr">{formatAmount(toCents(row.billed), locale)}</td>
                      <td className="ctr">{formatAmount(toCents(row.owed), locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <SearchBox
            action="/invoices"
            query={query}
            placeholder={t("invoices.searchPlaceholder")}
            searchLabel={t("common.search")}
            clearLabel={t("common.clear")}
          >
            <div className="w-48">
              <label className="label" htmlFor="category">
                {t("invoices.category")}
              </label>
              <select id="category" name="category" defaultValue={category} className="select">
                <option value="">{t("common.all")}</option>
                {EXPENSE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`invoices.category.${value}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-48">
              <label className="label" htmlFor="status">
                {t("common.status")}
              </label>
              <select id="status" name="status" defaultValue={status} className="select">
                <option value="">{t("common.all")}</option>
                <option value="UNPAID">{t("invoices.status.UNPAID")}</option>
                <option value="PARTIALLY_PAID">{t("invoices.status.PARTIALLY_PAID")}</option>
                <option value="PAID">{t("invoices.status.PAID")}</option>
              </select>
            </div>
          </SearchBox>

          <div className="mt-4 overflow-x-auto">
            {rows.length === 0 ? (
              <Empty
                message={
                  query || category || status ? t("invoices.noneFound") : t("invoices.noneYet")
                }
              />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("invoices.supplier")}</th>
                    <th>{t("invoices.category")}</th>
                    <th>{t("invoices.reference")}</th>
                    <th className="ctr">{t("invoices.issued")}</th>
                    <th className="ctr">{t("invoices.due")}</th>
                    <th className="ctr">{t("contracts.amount")}</th>
                    <th className="ctr">{t("invoices.paid")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("projects.title")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const overdue =
                      r.expense.status !== "PAID" &&
                      r.expense.dueDate !== null &&
                      new Date(r.expense.dueDate) < today;
                    return (
                      <tr key={r.expense.id}>
                        <td>
                          <Link
                            href={`/invoices/${r.expense.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold hover:underline"
                          >
                            {r.expense.supplier}
                          </Link>
                          {r.expense.description ? (
                            <div className="text-xs text-brand-graphite/60">
                              {r.expense.description}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-xs">
                          {t(`invoices.category.${r.expense.category}` as MessageKey)}
                        </td>
                        <td className="text-xs">{r.expense.reference ?? ""}</td>
                        <td className="ctr text-xs">{day(r.expense.issueDate)}</td>
                        <td className="ctr text-xs">
                          {day(r.expense.dueDate)}
                          {overdue ? (
                            <div className="text-[color:var(--color-negative)]">
                              {t("invoices.overdue")}
                            </div>
                          ) : null}
                        </td>
                        <td className="ctr font-semibold">
                          {formatAmount(toCents(r.expense.totalAmount), locale)}
                        </td>
                        <td className="ctr">
                          {formatAmount(toCents(r.expense.paidAmount), locale)}
                        </td>
                        <td>
                          <Pill
                            tone={
                              expenseStatusTone(r.expense.status) as "good" | "warn" | "neutral"
                            }
                          >
                            {t(`invoices.status.${r.expense.status}` as MessageKey)}
                          </Pill>
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
                            ""
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <Pagination
            basePath="/invoices"
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
      </div>
    </>
  );
}
