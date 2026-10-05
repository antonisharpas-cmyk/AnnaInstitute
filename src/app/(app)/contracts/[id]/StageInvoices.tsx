import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount } from "@/lib/money";
import { PAPER_NAME } from "@/lib/signingPapers";
import { stagesOf } from "@/lib/stageInvoices";
import { Card, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { removeStageProof, sendStageInvoiceAction, uploadStageProof } from "../stageActions";

/**
 * The invoice of each stage, one line each, in the order of the schedule.
 *
 * The reservation and the signing go from the Reservation and Contract of Sale
 * box above, with the signed paper. A stage of the building needs the
 * architect's certificate and photographs before its invoice can go. Any other
 * stage goes with the invoice alone. When the money is recorded, the receipt
 * goes to the buyer by itself.
 */
export default async function StageInvoices({ contractId, hasEmail }: { contractId: string; hasEmail: boolean }) {
  const { locale, t } = await getTranslator();
  const stages = await stagesOf(contractId);
  if (stages.length === 0) return null;
  const money = (cents: number) => formatAmount(cents, locale);
  const when = (value: Date | null | undefined) => (value ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB") : "");
  const link = (id: string, title: string, extra = "") => (
    <a href={`/api/files/${id}`} target="_blank" rel="noreferrer" className={`text-brand-teal-dark hover:underline ${extra}`}>
      {title}
    </a>
  );

  return (
    <Card title={t("stages.title")}>
      <p className="mb-3 max-w-prose text-xs text-brand-graphite/70">{t("stages.intro")}</p>
      {!hasEmail ? <p className="mb-3 text-xs text-[color:var(--color-negative)]">{t("papers.noEmail")}</p> : null}
      <div className="space-y-3">
        {stages.map((stage) => {
          const paid = stage.totalCents > 0 && stage.paidCents >= stage.totalCents;
          const sentAt = stage.line.invoiceSentAt;
          return (
            <section key={stage.line.id} className="rounded border border-brand-line p-3" data-stage={stage.line.label} data-stage-kind={stage.kind}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {stage.line.label} <span className="font-normal text-brand-graphite/70">{money(stage.totalCents)}</span>
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {paid ? (
                    <Pill tone="good">{t("stages.paid")}</Pill>
                  ) : sentAt ? (
                    <Pill tone="teal">{t("stages.invoiceSent")}</Pill>
                  ) : (
                    <Pill tone="neutral">{t("stages.notSent")}</Pill>
                  )}
                  {stage.paidCents > 0 && !paid ? (
                    <span className="text-brand-graphite/70">
                      {t("papers.paid")} {money(stage.paidCents)}
                    </span>
                  ) : null}
                </div>
              </div>

              {stage.invoice ? (
                <p className="mt-1 text-xs" data-stage-invoice>
                  {stage.invoice.documentId ? link(stage.invoice.documentId, `${t("papers.invoice")} ${stage.invoice.number}`) : `${t("papers.invoice")} ${stage.invoice.number}`}
                  {sentAt ? <span className="text-brand-graphite/60">, {t("papers.sentOn")} {when(sentAt)}</span> : null}
                </p>
              ) : null}

              {/* What goes with the invoice. */}
              {stage.kind === "PAPER" ? (
                <p className="mt-2 text-xs text-brand-graphite/70" data-stage-paper>
                  {stage.signed ? (
                    <>
                      {t("stages.withSigned").replace("{paper}", PAPER_NAME[stage.paperKind ?? "RESERVATION"])}: {link(stage.signed.id, stage.signed.title)}.{" "}
                    </>
                  ) : null}
                  {t("stages.fromPaperBox")}
                </p>
              ) : null}

              {stage.kind === "WORKS" ? (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="label !mb-1">{t("stages.certificate")}</p>
                    <ul className="space-y-1 text-xs" data-stage-certificates>
                      {stage.certificates.map((doc) => (
                        <li key={doc.id} className="flex items-center gap-2">
                          {link(doc.id, doc.originalName || doc.title)}
                          <form action={removeStageProof.bind(null, contractId, doc.id)}>
                            <button type="submit" className="text-brand-graphite/50 hover:text-[color:var(--color-negative)]" title={t("common.delete")}>
                              ×
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                    {paid ? null : (
                      <form action={uploadStageProof.bind(null, contractId, stage.line.id, "certificate")} className="mt-1 flex flex-wrap items-center gap-2" data-stage-certificate-form>
                        <input name="files" type="file" required accept=".pdf,image/*" className="text-xs" />
                        <SubmitButton className="btn btn-secondary !px-2 !py-0.5 !text-xs">{t("stages.upload")}</SubmitButton>
                      </form>
                    )}
                  </div>
                  <div>
                    <p className="label !mb-1">
                      {t("stages.photos")} {stage.photos.length ? `(${stage.photos.length})` : ""}
                    </p>
                    <ul className="flex flex-wrap gap-2 text-xs" data-stage-photos>
                      {stage.photos.map((doc) => (
                        <li key={doc.id} className="flex items-center gap-1">
                          {link(doc.id, doc.originalName || doc.title)}
                          <form action={removeStageProof.bind(null, contractId, doc.id)}>
                            <button type="submit" className="text-brand-graphite/50 hover:text-[color:var(--color-negative)]" title={t("common.delete")}>
                              ×
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                    {paid ? null : (
                      <form action={uploadStageProof.bind(null, contractId, stage.line.id, "photos")} className="mt-1 flex flex-wrap items-center gap-2" data-stage-photos-form>
                        <input name="files" type="file" required multiple accept="image/*" className="text-xs" />
                        <SubmitButton className="btn btn-secondary !px-2 !py-0.5 !text-xs">{t("stages.upload")}</SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              ) : null}

              {/* The button, for every stage but the two the paper box sends. */}
              {stage.kind !== "PAPER" && !paid ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {stage.blocked ? (
                    <span className="text-xs text-brand-graphite/60" data-stage-blocked>
                      {stage.blocked}
                    </span>
                  ) : (
                    <form action={sendStageInvoiceAction.bind(null, contractId, stage.line.id)} data-stage-send>
                      <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">
                        {t((sentAt ? "stages.sendAgain" : stage.kind === "WORKS" ? "stages.sendWithProof" : "stages.send") as MessageKey)}
                      </SubmitButton>
                    </form>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-brand-graphite/60">{t("stages.receiptNote")}</p>
    </Card>
  );
}
