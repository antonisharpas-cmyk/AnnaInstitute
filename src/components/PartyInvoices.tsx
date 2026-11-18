import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { Card, Empty, Pill } from "@/components/ui";
import { formatAmount, toCents } from "@/lib/money";
import { expenseStatusTone } from "@/lib/expenses";
import type { getTranslator, MessageKey } from "@/i18n";

type T = Awaited<ReturnType<typeof getTranslator>>["t"];

const SHOWN = 10;

type Kind = "PARTNER" | "CONSTRUCTOR" | "AGENT" | "CLIENT" | "COMPANY";

/**
 * The invoices under Invoices with this person on the other side, newest
 * first: the ones they sent us and the ones we sent them. Each opens on its
 * own page, where the payment and the receipt are kept. The same invoices are
 * in the accountant's pack already, as every invoice is.
 */
export default async function PartyInvoices({ kind, id, t, locale }: { kind: Kind; id: string; t: T; locale: string }) {
  const theirs =
    kind === "COMPANY"
      ? /* A company of ours is on either side: it issued or received it, or it is the other party. The same rule as the Company filter under Invoices. */
        (sql`(${expenses.ourCompanyId} = ${id} or (${expenses.partyKind} = 'COMPANY' and ${expenses.partyId} = ${id}) or ${expenses.subownerId} = ${id})` as SQL)
      : and(eq(expenses.partyKind, kind), eq(expenses.partyId, id));
  /* The latest ten; the rest are one click away under Invoices, with every filter. */
  const [rows, [{ n: total }]] = await Promise.all([
    db.select().from(expenses).where(theirs).orderBy(desc(expenses.issueDate), desc(expenses.createdAt)).limit(SHOWN),
    db.select({ n: sql<number>`count(*)::int` }).from(expenses).where(theirs),
  ]);
  const allHref = kind === "COMPANY" ? `/invoices?company=${encodeURIComponent(id)}` : `/invoices?party=${encodeURIComponent(`${kind}:${id}`)}`;
  /* A client's and an agent's own papers live with their sale; this card shows only when there is something else. */
  if (rows.length === 0 && (kind === "CLIENT" || kind === "AGENT")) return null;
  const day = (value: Date | null) => (value ? new Date(value).toLocaleDateString("en-GB") : "");
  const money = (value: string) => formatAmount(toCents(value), locale);

  return (
    <Card title={t(kind === "PARTNER" || kind === "COMPANY" ? "partners.invoices" : "invoices.partyOtherInvoices")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-graphite/60">{t(`invoices.partyHint.${kind}` as MessageKey)}</p>
        <Link href={`/invoices/new?from=${encodeURIComponent(`${kind}:${id}`)}`} className="btn btn-secondary !py-1 !text-xs">
          {t(`invoices.partyNew.${kind}` as MessageKey)}
        </Link>
      </div>
      {rows.length === 0 ? (
        <Empty message={t("common.none")} />
      ) : (
        <table className="data" data-party-invoices={kind}>
          <thead>
            <tr>
              <th>{t("invoices.number")}</th>
              <th className="ctr">{t("common.date")}</th>
              <th className="ctr">{t("invoices.total")}</th>
              <th className="ctr">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((one) => (
              <tr key={one.id}>
                <td>
                  <Link href={`/invoices/${one.id}`} className="font-semibold text-brand-teal-dark hover:underline">
                    {one.reference || t("invoices.noNumber")}
                  </Link>
                  {kind === "COMPANY" && one.ourCompanyId === id ? (
                    /* Issued or received by this company itself: say with whom. */
                    <div className="text-xs text-brand-graphite/60">
                      {t(one.direction === "OUT" ? "invoices.companyIssuedTo" : "invoices.companyReceivedFrom")} {one.supplier}
                    </div>
                  ) : kind === "COMPANY" ? (
                    <div className="text-xs text-brand-graphite/60">{t(one.direction === "OUT" ? "invoices.companyWeCharged" : "invoices.companyChargedUs")}</div>
                  ) : one.direction === "OUT" ? (
                    <div className="text-xs text-brand-graphite/60">{t("invoices.direction.OUT")}</div>
                  ) : null}
                </td>
                <td className="ctr nowrap text-xs">{day(one.issueDate ?? one.createdAt)}</td>
                <td className="ctr">{money(one.totalAmount)}</td>
                <td className="ctr">
                  <Pill tone={expenseStatusTone(one.status) as "good" | "warn" | "neutral"}>
                    {t(`invoices.status.${one.status}` as MessageKey)}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total > 0 ? (
        <Link href={allHref} className="mt-2 inline-block text-xs text-brand-teal-dark hover:underline" data-party-invoices-all>
          {total > SHOWN ? t("invoices.seeAllCount").replace("{n}", String(total)) : t("invoices.seeAllInInvoices")}
        </Link>
      ) : null}
    </Card>
  );
}
