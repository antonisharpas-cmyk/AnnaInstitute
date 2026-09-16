import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, toCents } from "@/lib/money";
import { agentReceipt, agentReceiptEmail } from "@/lib/receipts";
import ReceiptSheet from "@/components/ReceiptSheet";
import SubmitButton from "@/components/SubmitButton";
import { sendAgentReceipt } from "../../../../receipts/actions";

/**
 * The receipt for one commission payment, checked before it is sent.
 *
 * The same shape as the buyer's, for the same reason: the office reads what the
 * agent will read, and then decides. Opening this page sends nothing.
 */
export default async function AgentReceiptPage({
  params,
}: {
  params: Promise<{ id: string; paymentId: string }>;
}) {
  const { id, paymentId } = await params;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const receipt = await agentReceipt(paymentId);
  if (!receipt || receipt.agent.id !== id) notFound();

  const email = agentReceiptEmail(receipt, locale);
  const day = new Date(receipt.paidOn).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/agents/${id}`} className="btn btn-secondary">
          {"←"} {t("common.backTo")} {receipt.agent.name}
        </Link>
        <p className="text-xs text-brand-graphite/60">{t("receipts.checkFirst")}</p>
      </div>

      <ReceiptSheet
        title={t("receipts.agentTitle")}
        subtitle={t("app.subtitle")}
        number={receipt.number}
        on={day}
        toWhom={receipt.agent.name}
        toAddress={[receipt.agent.company, receipt.agent.address, receipt.agent.country]
          .filter(Boolean)
          .join(", ")}
        amount={formatAmount(receipt.amountCents, locale)}
        lines={[
          { label: t("common.date"), value: day },
          {
            label: t("contracts.unit"),
            value:
              receipt.project && receipt.unit ? `${receipt.project.name} ${receipt.unit.code}` : "",
          },
          {
            label: t("contracts.client"),
            value: receipt.client
              ? `${receipt.client.firstName} ${receipt.client.lastName}`.trim()
              : "",
          },
          {
            label: t("commissions.sale"),
            value: receipt.commission
              ? `${formatAmount(toCents(receipt.commission.amount), locale)} . ${Number(
                  receipt.commission.rate,
                )}%`
              : "",
          },
          { label: t("commissions.reference"), value: receipt.number },
        ].filter((line) => line.value)}
        totals={[
          { label: t("agents.generated"), value: formatAmount(receipt.earnedCents, locale) },
          { label: t("agents.paidOut"), value: formatAmount(receipt.paidCents, locale) },
          {
            label: t("dash.outstanding"),
            value: formatAmount(receipt.outstandingCents, locale),
          },
        ]}
        note={t("receipts.agentNote")}
      />

      <div className="no-print mt-6 max-w-3xl">
        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("receipts.theEmail")}</h2>
          <p className="mb-3 text-xs text-brand-graphite/60">
            {receipt.agent.email
              ? `${t("receipts.goesTo")} ${receipt.agent.email}`
              : t("receipts.noAddress")}
          </p>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {email.subject}
          </p>
          <pre className="overflow-x-auto rounded border border-brand-line bg-brand-surface p-3 font-mono text-xs whitespace-pre-wrap">
            {email.body}
          </pre>

          {receipt.agent.email ? (
            <form action={sendAgentReceipt.bind(null, paymentId)} className="mt-3">
              <SubmitButton>{t("receipts.send")}</SubmitButton>
              <p className="mt-2 text-xs text-brand-graphite/60">{t("receipts.sendNote")}</p>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
