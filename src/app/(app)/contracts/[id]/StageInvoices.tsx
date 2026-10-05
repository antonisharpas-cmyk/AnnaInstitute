import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount } from "@/lib/money";
import { dayAndTime } from "@/lib/when";
import { PAPER_NAME, papersOf } from "@/lib/signingPapers";
import { stagesOf } from "@/lib/stageInvoices";
import { Card, Pill } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { removeStageProof, sendStageInvoiceAction, uploadStageProof } from "../stageActions";
import { removePaperDraft, sendPaperForReview, uploadPaperDraft, uploadPaperSigned } from "../paperActions";

/**
 * The invoice of each stage, one box each, in the order of the schedule.
 *
 * The reservation and the signing carry their paper in their own box: the
 * draft for the client to check, the signed copy, then the invoice with the
 * signed copy. A stage of the building needs the architect's certificate and
 * photographs before its invoice can go. Any other stage goes with the invoice
 * alone. When the money is recorded, the receipt goes to the buyer by itself.
 */
export default async function StageInvoices({ contractId, hasEmail }: { contractId: string; hasEmail: boolean }) {
  const { locale, t } = await getTranslator();
  const [stages, papers] = await Promise.all([stagesOf(contractId), papersOf(contractId)]);
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
      <p className="mb-3 text-xs text-brand-graphite/70">{t("stages.intro")}</p>
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

              {stage.failed ? (
                <p className="mt-1 text-xs text-[color:var(--color-negative)]" data-stage-failed>
                  {t("stages.lastTryFailed").replace("{when}", dayAndTime(stage.failed.at, locale))}: {stage.failed.error}
                </p>
              ) : null}
              {stage.invoice ? (
                <p className="mt-1 text-xs" data-stage-invoice>
                  {stage.invoice.documentId ? link(stage.invoice.documentId, `${t("papers.invoice")} ${stage.invoice.number}`) : `${t("papers.invoice")} ${stage.invoice.number}`}
                  {sentAt ? <span className="text-brand-graphite/60">, {t("papers.sentOn")} {when(sentAt)}</span> : null}
                </p>
              ) : null}

              {/* The reservation and the signing: their paper, in three steps. */}
              {stage.kind === "PAPER" && stage.paperKind
                ? (() => {
                    const one = papers.find((paper) => paper.kind === stage.paperKind);
                    if (!one) return null;
                    const name = locale === "el" ? t(`papers.name.${one.kind}` as MessageKey) : PAPER_NAME[one.kind];
                    return (
                      <div className="mt-2 rounded border border-brand-line bg-brand-surface p-3" data-paper={one.kind} data-paper-step={one.step}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{name}</p>
                          <Pill tone={one.step === "SIGNED" ? "good" : one.step === "NONE" ? "neutral" : "warn"}>{t(`papers.step.${one.step}` as MessageKey)}</Pill>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          {/* 1. The draft, to check. */}
                          <div>
                            <p className="label !mb-1">1. {t("papers.draft")}</p>
                            {one.signed ? (
                              <p className="text-xs text-brand-graphite/60">{t("papers.draftReplaced")}</p>
                            ) : one.draft ? (
                              <div className="space-y-2 text-xs">
                                <p>
                                  <a href={`/api/files/${one.draft.id}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline" data-paper-draft>
                                    {one.draft.title}
                                  </a>{" "}
                                  <span className="text-brand-graphite/60">
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
                                <form action={uploadPaperDraft.bind(null, contractId, one.kind)} className="space-y-1" data-paper-draft-form>
                                  <input name="file" type="file" required accept="application/pdf,.doc,.docx" className="block text-xs" />
                                  <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("papers.replaceDraft")}</SubmitButton>
                                </form>
                              </div>
                            ) : (
                              <form action={uploadPaperDraft.bind(null, contractId, one.kind)} className="space-y-1" data-paper-draft-form>
                                <input name="file" type="file" required accept="application/pdf,.doc,.docx" className="block text-xs" />
                                <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("papers.uploadDraft")}</SubmitButton>
                              </form>
                            )}
                          </div>
                          {/* 2. Signed. */}
                          <div>
                            <p className="label !mb-1">2. {t("papers.signedCopy")}</p>
                            {one.signed ? (
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <a href={`/api/files/${one.signed.id}`} target="_blank" rel="noreferrer" className="text-brand-teal-dark hover:underline" data-paper-signed>
                                  {one.signed.title}
                                </a>
                                {/* Signed is final: it cannot be deleted or replaced. */}
                                <span className="w-full text-brand-graphite/60" data-paper-signed-final>
                                  {one.paper?.signedAt ? `${t("papers.signedOn")} ${when(one.paper.signedAt)}. ` : ""}
                                  {t("papers.signedFinal")}
                                </span>
                              </div>
                            ) : (
                              <form action={uploadPaperSigned.bind(null, contractId, one.kind)} className="space-y-1" data-paper-signed-form>
                                <input name="file" type="file" required className="block text-xs" />
                                <SubmitButton className="btn btn-secondary !px-3 !py-1 !text-xs">{t("papers.uploadSigned")}</SubmitButton>
                              </form>
                            )}
                          </div>
                          {/* 3. The invoice, with the signed copy. */}
                          <div>
                            <p className="label !mb-1">3. {t("papers.invoiceWithSigned")}</p>
                            {paid ? (
                              <p className="text-xs text-brand-graphite/60">{t("stages.paid")}</p>
                            ) : !one.signed ? (
                              <p className="text-xs text-brand-graphite/60">{t("papers.signedFirst")}</p>
                            ) : (
                              <form action={sendStageInvoiceAction.bind(null, contractId, stage.line.id)} data-paper-invoice-form>
                                <SubmitButton className="btn btn-primary !px-3 !py-1 !text-xs">
                                  {(sentAt ? t("papers.sendInvoiceAgain") : t("papers.sendInvoiceWithSigned")).replace("{paper}", name)}
                                </SubmitButton>
                              </form>
                            )}
                          </div>
                        </div>
                        {stage.paidCents > 0 && !one.signed && (one.draft || one.invoice) ? (
                          <p className="mt-2 text-xs text-[color:var(--color-warning)]" data-paper-money>
                            {t("papers.letterWaits")}
                          </p>
                        ) : null}
                      </div>
                    );
                  })()
                : null}

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
