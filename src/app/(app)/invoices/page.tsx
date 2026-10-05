import Link from "next/link";
import { ownCategoryWords, whatFor } from "@/lib/partnerInvoices";
import { optionsFor } from "@/lib/choices";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import {
  expenseStatusTone,
  expensesByCategory,
  listExpenses,
} from "@/lib/expenses";
import { Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { ourCompanies } from "@/lib/parties";
import SearchBox from "@/components/SearchBox";
import Pagination, { paginate } from "@/components/Pagination";

const PER_PAGE = 20;

const day = (value: Date | null | undefined) =>
  value ? new Date(value).toISOString().slice(0, 10) : "";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; direction?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const query = (params.q ?? "").trim();
  const category = params.category ?? "";
  const status = params.status ?? "";
  const direction = params.direction ?? "";
  const { page, perPage, offset } = paginate(params, PER_PAGE);

  const [{ rows, total, income, costs }, byCategory, companies] = await Promise.all([
    listExpenses({ query, category, status, direction, limit: perPage, offset }),
    expensesByCategory(),
    ourCompanies(),
  ]);
  const ourName = new Map(companies.map((one) => [one.id, one.name]));
  const oneEleven = companies[0]?.name ?? "One Eleven";
  const money = (cents: number) => formatAmount(cents, locale);

  const today = new Date();
  /* The categories as the office has them in the Builder. */
  const ownWords = await ownCategoryWords();
  const everyCategory = await optionsFor("expenseCategory", t, { everything: true });

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

      {/* Money coming in and money going out, side by side, never added together. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-invoice-totals>
        <Stat label={t("invoices.incomeBilled")} value={money(income.billedCents)} hint={`${money(income.paidCents)} ${t("invoices.received").toLowerCase()}`} />
        <Stat label={t("invoices.toReceive")} value={money(income.owedCents)} />
        <Stat label={t("invoices.costsBilled")} value={money(costs.billedCents)} hint={`${money(costs.paidCents)} ${t("invoices.paid").toLowerCase()}`} />
        <Stat label={t("invoices.toPay")} value={money(costs.owedCents)} />
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
                    <th className="ctr">{t("invoices.income")}</th>
                    <th className="ctr">{t("invoices.toReceive")}</th>
                    <th className="ctr">{t("invoices.expenses")}</th>
                    <th className="ctr">{t("invoices.toPay")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((row) => (
                    <tr key={row.category}>
                      <td>
                        <Link href={`/invoices?category=${row.category}`} className="hover:underline">
                          {t(`invoices.category.${row.category}` as MessageKey)}
                        </Link>
                      </td>
                      <td className="ctr">{row.count}</td>
                      <td className="ctr">{row.incomeCents ? money(row.incomeCents) : ""}</td>
                      <td className="ctr">{row.incomeOwedCents ? money(row.incomeOwedCents) : ""}</td>
                      <td className="ctr">{row.costCents ? money(row.costCents) : ""}</td>
                      <td className="ctr">{row.costOwedCents ? money(row.costOwedCents) : ""}</td>
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
                {everyCategory.map((one) => (
                  <option key={one.value} value={one.value}>
                    {one.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-48">
              <label className="label" htmlFor="direction">
                {t("invoices.which")}
              </label>
              <select id="direction" name="direction" defaultValue={direction} className="select">
                <option value="">{t("common.all")}</option>
                <option value="OUT">{t("invoices.direction.OUT")}</option>
                <option value="IN">{t("invoices.direction.IN")}</option>
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
                <option value="RECEIPT_MISSING">{t("invoices.status.RECEIPT_MISSING")}</option>
              </select>
            </div>
          </SearchBox>

          <div className="mt-4 overflow-x-auto">
            {rows.length === 0 ? (
              <Empty
                message={
                  query || category || status || direction ? t("invoices.noneFound") : t("invoices.noneYet")
                }
              />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("invoices.from")}</th>
                    <th>{t("invoices.to")}</th>
                    <th>{t("invoices.category")}</th>
                    <th>{t("invoices.number")}</th>
                    <th className="ctr">{t("invoices.issued")}</th>
                    <th className="ctr">{t("invoices.due")}</th>
                    <th className="ctr">{t("contracts.amount")}</th>
                    <th className="ctr">{t("invoices.paidOrReceived")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("projects.title")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const out = r.expense.direction === "OUT";
                    const overdue = r.expense.status !== "PAID" && r.expense.dueDate !== null && new Date(r.expense.dueDate) < today;
                    const ours = ourName.get(r.expense.ourCompanyId ?? "") ?? oneEleven;
                    const them = (
                      <Link href={`/invoices/${r.expense.id}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                        {r.expense.supplier}
                      </Link>
                    );
                    return (
                      <tr key={r.expense.id} data-invoice-row={r.expense.direction}>
                        <td>
                          {out ? <span className="text-xs">{ours}</span> : them}
                          {!out && r.expense.description ? <div className="text-xs text-brand-graphite/60">{r.expense.description}</div> : null}
                        </td>
                        <td>
                          {out ? them : <span className="text-xs">{ours}</span>}
                          {out && r.expense.description ? <div className="text-xs text-brand-graphite/60">{r.expense.description}</div> : null}
                        </td>
                        <td className="text-xs">
                          <Pill tone={out ? "teal" : "neutral"}>{t(`invoices.direction.${out ? "OUT" : "IN"}` as MessageKey)}</Pill>
                          <div className="mt-0.5">{whatFor(r.expense, ownWords)}</div>
                        </td>
                        <td className="text-xs">{r.expense.reference ?? ""}</td>
                        <td className="ctr text-xs">{day(r.expense.issueDate)}</td>
                        <td className="ctr text-xs">
                          {day(r.expense.dueDate)}
                          {overdue ? <div className="text-[color:var(--color-negative)]">{t("invoices.overdue")}</div> : null}
                        </td>
                        <td className="ctr font-semibold">{money(toCents(r.expense.totalAmount))}</td>
                        <td className="ctr">{money(toCents(r.expense.paidAmount))}</td>
                        <td>
                          <Pill tone={r.receiptMissing ? "warn" : (expenseStatusTone(r.expense.status) as "good" | "warn" | "neutral")}>
                            {r.receiptMissing ? t("invoices.status.RECEIPT_MISSING") : t(`invoices.status.${r.expense.status}` as MessageKey)}
                          </Pill>
                        </td>
                        <td className="text-xs">
                          {r.developments ? (
                            <span data-developments>{r.developments}</span>
                          ) : r.project ? (
                            <Link href={`/projects/${r.project.id}`} target="_blank" rel="noreferrer" className="hover:underline">
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
