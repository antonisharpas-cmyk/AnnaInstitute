import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { Card, Empty, Pill } from "@/components/ui";
import { formatAmount, toCents } from "@/lib/money";
import { expenseStatusTone } from "@/lib/expenses";
import type { getTranslator, MessageKey } from "@/i18n";

type T = Awaited<ReturnType<typeof getTranslator>>["t"];

/**
 * The invoices this partner sent us, and any we sent them, newest first.
 * Each opens on its own page, where the payment and their receipt are kept.
 */
export default async function PartnerInvoices({ partnerId, t, locale }: { partnerId: string; t: T; locale: string }) {
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.partyKind, "PARTNER"), eq(expenses.partyId, partnerId)))
    .orderBy(desc(expenses.issueDate), desc(expenses.createdAt));
  const day = (value: Date | null) => (value ? new Date(value).toLocaleDateString("en-GB") : "");
  const money = (value: string) => formatAmount(toCents(value), locale);

  return (
    <Card title={t("partners.invoices")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-graphite/60">{t("partners.invoicesHint")}</p>
        <Link href={`/invoices/new?from=${encodeURIComponent(`PARTNER:${partnerId}`)}`} className="btn btn-secondary !py-1 !text-xs">
          {t("partners.newInvoice")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <Empty message={t("common.none")} />
      ) : (
        <table className="data" data-partner-invoices>
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
                  {one.direction === "OUT" ? <div className="text-xs text-brand-graphite/60">{t("invoices.direction.OUT")}</div> : null}
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
    </Card>
  );
}
