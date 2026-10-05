import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { installments } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount } from "@/lib/money";
import { PAPER_NAME, papersOf } from "@/lib/signingPapers";
import { Card, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { sendPaperInvoice } from "../stageActions";
import {
  removePaperDraft,
  removePaperSigned,
  sendPaperForReview,
  uploadPaperDraft,
  uploadPaperSigned,
} from "../paperActions";

/**
 * The Reservation and the Contract of Sale, step by step.
 *
 * One box for each paper, with its three steps in the order they happen: the
 * draft to check, the signed copy, and the invoice sent with the signed copy.
 * The receipt follows by itself when the money is recorded. Each step says what was done and when, and offers only what can be
 * done next.
 */
export default async function SigningPapers({ contractId, hasEmail }: { contractId: string; hasEmail: boolean }) {
  const { locale, t } = await getTranslator();
  const papers = await papersOf(contractId);
  const lines = await db.select().from(installments).where(eq(installments.contractId, contractId)).orderBy(asc(installments.seq));
  const when = (value: Date | null | undefined) =>
    value ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB") : "";
  const money = (cents: number) => formatAmount(cents, locale);
  const tone = (step: string) => (step === "SIGNED" ? "good" : step === "NONE" ? "neutral" : "warn");

  return (
    <Card title={t("papers.title")}>
      <p className="mb-3 text-xs text-brand-graphite/70">{t("papers.intro")}</p>
      {!hasEmail ? <p className="mb-3 text-xs text-[color:var(--color-negative)]">{t("papers.noEmail")}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {papers.map((one) => {
          const name = locale === "el" ? t(`papers.name.${one.kind}` as MessageKey) : PAPER_NAME[one.kind];
          const paidAll = one.stageCents > 0 && one.paidCents >= one.stageCents;
          return (
            <section key={one.kind} className="rounded border border-brand-line p-3" data-paper={one.kind} data-paper-step={one.step}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{name}</h3>
                <Pill tone={tone(one.step) as "good" | "warn" | "neutral"}>{t(`papers.step.${one.step}` as MessageKey)}</Pill>
              </div>

              {/* 1. The draft, to check. */}
              <div className="border-t border-brand-line py-2">
                <p className="label !mb-1">1. {t("papers.draft")}</p>
                {one.signed ? (
                  <p className="text-xs text-brand-graphite/60">{t("papers.draftReplaced")}</p>
                ) : one.draft ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      <a href={`/api/files/${one.draft.id}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline" data-paper-draft>
                        {one.draft.title}
                      </a>{" "}
                      <span className="text-xs text-brand-graphite/60">
                        {one.paper?.sentForReviewAt ? `${t("papers.sentOn")} ${when(one.paper.sentForReviewAt)}` : t("papers.notSentYet")}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={sendPaperForReview.bind(null, contractId, one.kind)} data-paper-review>
                        <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">
                          {one.paper?.sentForReviewAt ? t("papers.sendAgain") : t("papers.sendToCheck")}
                        </SubmitButton>
                      </form>
                      <form action={removePaperDraft.bind(null, contractId, one.kind)}>
                        <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("common.delete")}</SubmitButton>
                      </form>
                    </div>
                    <form action={uploadPaperDraft.bind(null, contractId, one.kind)} className="flex flex-wrap items-center gap-2" data-paper-draft-form>
                      <input name="file" type="file" required accept="application/pdf,.doc,.docx" className="text-xs" />
                      <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("papers.replaceDraft")}</SubmitButton>
                    </form>
                  </div>
                ) : (
                  <form action={uploadPaperDraft.bind(null, contractId, one.kind)} className="flex flex-wrap items-center gap-2" data-paper-draft-form>
                    <input name="file" type="file" required accept="application/pdf,.doc,.docx" className="text-xs" />
                    <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("papers.uploadDraft")}</SubmitButton>
                  </form>
                )}
              </div>

              {/* 2. Signed. */}
              <div className="border-t border-brand-line py-2">
                <p className="label !mb-1">2. {t("papers.signedCopy")}</p>
                {one.signed ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <a href={`/api/files/${one.signed.id}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline" data-paper-signed>
                      {one.signed.title}
                    </a>
                    <form action={removePaperSigned.bind(null, contractId, one.kind)}>
                      <SubmitButton className="btn btn-secondary !px-2 !py-0.5 !text-xs">{t("common.delete")}</SubmitButton>
                    </form>
                  </div>
                ) : (
                  <form action={uploadPaperSigned.bind(null, contractId, one.kind)} className="flex flex-wrap items-center gap-2" data-paper-signed-form>
                    <input name="file" type="file" required className="text-xs" />
                    <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("papers.uploadSigned")}</SubmitButton>
                  </form>
                )}
              </div>

              {/* 3. The invoice, with the signed copy. The receipt follows by itself when the money is recorded. */}
              <div className="border-t border-brand-line py-2">
                <p className="label !mb-1">3. {t("papers.invoiceWithSigned")}</p>
                {one.invoice ? (
                  <p className="text-sm" data-paper-invoice>
                    {one.invoice.documentId ? (
                      <a href={`/api/files/${one.invoice.documentId}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline">
                        {t("papers.invoice")} {one.invoice.number}
                      </a>
                    ) : (
                      <span>
                        {t("papers.invoice")} {one.invoice.number}
                      </span>
                    )}{" "}
                    <span className="text-xs text-brand-graphite/60">
                      {one.stage?.label ?? ""}, {money(Math.round(Number(one.invoice.totalAmount) * 100))}.{" "}
                      {one.paper?.invoiceSentAt ? `${t("papers.sentOn")} ${when(one.paper.invoiceSentAt)}` : t("papers.issuedNotSent")}
                    </span>
                  </p>
                ) : null}
                {lines.length === 0 ? (
                  <p className="text-xs text-brand-graphite/60">{t("papers.noStages")}</p>
                ) : !one.signed ? (
                  <p className="text-xs text-brand-graphite/60">{t("papers.signedFirst")}</p>
                ) : paidAll ? null : (
                  <form action={sendPaperInvoice.bind(null, contractId, one.kind)} className="mt-1 space-y-2" data-paper-invoice-form>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs" htmlFor={`stage-${one.kind}`}>
                        {t("papers.paidWith")}
                      </label>
                      <select id={`stage-${one.kind}`} name="stageId" defaultValue={one.stage?.id ?? ""} className="select !w-auto !py-1 text-xs">
                        {lines.map((line) => (
                          <option key={line.id} value={line.id}>
                            {line.label}, {money(Math.round(Number(line.totalAmount) * 100))}
                          </option>
                        ))}
                      </select>
                    </div>
                    <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">
                      {(one.paper?.invoiceSentAt ? t("papers.sendInvoiceAgain") : t("papers.sendInvoiceWithSigned")).replace("{paper}", name)}
                    </SubmitButton>
                    <p className="text-xs text-brand-graphite/60">{t("papers.receiptFollows")}</p>
                  </form>
                )}
                {one.stage ? (
                  <p className="mt-1 text-xs text-brand-graphite/70" data-paper-money>
                    {one.stage.label}: {t("papers.paid")} {money(one.paidCents)} {t("papers.of")} {money(one.stageCents)}
                    {one.paper?.signedSentAt
                      ? `. ${t("papers.letterWent")} ${when(one.paper.signedSentAt)}`
                      : one.paidCents > 0 && !one.signed && (one.draft || one.invoice)
                        ? `. ${t("papers.letterWaits")}`
                        : ""}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}
