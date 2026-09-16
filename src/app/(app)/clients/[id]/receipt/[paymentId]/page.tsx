import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount } from "@/lib/money";
import { buyerReceipt, buyerReceiptEmail } from "@/lib/receipts";
import ReceiptSheet from "@/components/ReceiptSheet";
import SubmitButton from "@/components/SubmitButton";
import { sendBuyerReceipt } from "../../../../receipts/actions";

/**
 * The receipt for one payment, checked before it is sent.
 *
 * The order of the page is the order of the job: the receipt as the buyer will
 * see it, then the exact words of the email underneath, then the button. Nothing
 * is sent by opening this page, which is what makes it safe to open.
 */
export default async function BuyerReceiptPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const receipt = await buyerReceipt(paymentId);
  if (!receipt || receipt.client?.id !== id) notFound();

  const email = buyerReceiptEmail(receipt, locale);
  const name = `${receipt.client.firstName} ${receipt.client.lastName}`.trim();
  const day = new Date(receipt.paidOn).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/clients/${id}`} className="btn btn-secondary">
          {"←"} {t("common.backTo")} {name}
        </Link>
        <p className="text-xs text-brand-graphite/60">{t("receipts.checkFirst")}</p>
      </div>

      <ReceiptSheet
        title={t("receipts.buyerTitle")}
        subtitle={t("app.subtitle")}
        number={receipt.number}
        on={day}
        toWhom={name}
        toAddress={[receipt.client.address, receipt.client.country].filter(Boolean).join(", ")}
        amount={formatAmount(receipt.amountCents, locale)}
        lines={[
          { label: t("common.date"), value: day },
          {
            label: t("contracts.method"),
            value: receipt.method
              ? ["CASH", "BANK", "CHEQUE", "CARD", "OTHER"].includes(receipt.method)
                ? t(`contracts.method.${receipt.method}` as MessageKey)
                : receipt.method
              : "",
          },
          {
            label: t("contracts.unit"),
            value:
              receipt.project && receipt.unit ? `${receipt.project.name} ${receipt.unit.code}` : "",
          },
          { label: t("contracts.reference"), value: receipt.contract.reference },
          { label: t("contracts.stage"), value: receipt.stage ?? t("contracts.notAgainstOne") },
        ].filter((line) => line.value)}
        totals={[
          { label: t("common.total"), value: formatAmount(receipt.owedCents, locale) },
          { label: t("contracts.paid"), value: formatAmount(receipt.paidCents, locale) },
          {
            label: t("dash.outstanding"),
            value: formatAmount(receipt.outstandingCents, locale),
          },
        ]}
        note={t("receipts.buyerNote")}
      />

      <div className="no-print mt-6 max-w-3xl">
        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("receipts.theEmail")}</h2>
          <p className="mb-3 text-xs text-brand-graphite/60">
            {receipt.client.email
              ? `${t("receipts.goesTo")} ${receipt.client.email}`
              : t("receipts.noAddress")}
          </p>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {email.subject}
          </p>
          <pre className="overflow-x-auto rounded border border-brand-line bg-brand-surface p-3 font-mono text-xs whitespace-pre-wrap">
            {email.body}
          </pre>

          {receipt.client.email ? (
            <form action={sendBuyerReceipt.bind(null, paymentId)} className="mt-3">
              <SubmitButton>{t("receipts.send")}</SubmitButton>
              <p className="mt-2 text-xs text-brand-graphite/60">{t("receipts.sendNote")}</p>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
