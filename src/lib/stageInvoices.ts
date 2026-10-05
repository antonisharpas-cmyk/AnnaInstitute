import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { contracts, documents, installments, issuedDocuments, messages, payments, signingPapers } from "@/db/schema";
import { stageFrom, stageNames } from "@/lib/choices/stages";
import { formatAmount, toCents } from "@/lib/money";
import { advanceInvoiceFor, issueStageInvoice, paperAttachment } from "@/lib/issued";
import { defaultStage, PAPER_KINDS, PAPER_NAME, paperRow, writeToBuyer, type LetterResult, type PaperKind } from "@/lib/signingPapers";
import { resolveStored } from "@/lib/storage";
import { readFile } from "node:fs/promises";
import type { EmailAttachment } from "@/lib/messaging/email";

/*
 * The invoice of each stage, sent to the buyer before the money.
 *
 * Three kinds of stage, three ways, as the office does it:
 *
 *  PAPER  The reservation and the signing. The invoice goes with the signed
 *         Reservation Agreement or Contract of Sale, from that paper's box.
 *  WORKS  The structure, the brickwork, the tiling and the aluminium. The
 *         invoice goes with the architect's certificate and photographs of the
 *         work, which prove the stage was reached; it cannot go without them.
 *  PLAIN  Any other stage, the completion of the property say: the invoice alone.
 *
 * The money comes in afterwards and is recorded as always. The letter for it
 * then carries the receipt only, because the buyer has the invoice already.
 */

export type StageKind = "PAPER" | "WORKS" | "PLAIN";
const WORKS = ["STRUCTURE", "BRICKWORK", "TILING", "ALUMINIUM"];

type Line = typeof installments.$inferSelect;
type Doc = typeof documents.$inferSelect;

export type StageView = {
  line: Line;
  kind: StageKind;
  /** For a PAPER stage, which paper, and whether its signed copy is in. */
  paperKind: PaperKind | null;
  signed: Doc | null;
  certificates: Doc[];
  photos: Doc[];
  invoice: typeof issuedDocuments.$inferSelect | null;
  totalCents: number;
  paidCents: number;
  /** Why the invoice cannot go yet, or null when it can. */
  blocked: string | null;
  /** The last try to email it, when it did not go. */
  failed: { at: Date; error: string } | null;
};

/**
 * What the message log says about one invoice's email: the newest message to
 * the buyer that names it. The log is the truth of what left, whatever
 * happened to the page that sent it.
 */
async function invoiceMail(clientId: string | null, number: string) {
  if (!clientId || !number) return null;
  const [found] = await db
    .select({ status: messages.status, error: messages.error, at: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.clientId, clientId),
        eq(messages.channel, "EMAIL"),
        sql`lower(coalesce(${messages.subject}, '')) like ${`%invoice ${number.toLowerCase()}%`}`,
      ),
    )
    .orderBy(desc(sql`case when ${messages.status} = 'SENT' then 1 else 0 end`), desc(messages.createdAt))
    .limit(1);
  return found ?? null;
}

/** Which stage is paid with which paper: the one the office chose, or the reservation and the signing. */
async function paperStages(contractId: string, lines: Line[]): Promise<Map<string, PaperKind>> {
  const rows = await db.select().from(signingPapers).where(eq(signingPapers.contractId, contractId));
  const out = new Map<string, PaperKind>();
  for (const kind of PAPER_KINDS) {
    const row = rows.find((one) => one.kind === kind);
    const stage = (row?.installmentId ? lines.find((line) => line.id === row.installmentId) : null) ?? (await defaultStage(kind, lines));
    if (stage && !out.has(stage.id)) out.set(stage.id, kind);
  }
  return out;
}

export async function stagesOf(contractId: string): Promise<StageView[]> {
  const lines = await db.select().from(installments).where(eq(installments.contractId, contractId)).orderBy(asc(installments.seq));
  if (lines.length === 0) return [];
  const names = await stageNames();
  const papers = await paperStages(contractId, lines);
  const ids = lines.map((line) => line.id);
  const [docs, paid, paperRows] = await Promise.all([
    db.select().from(documents).where(inArray(documents.installmentId, ids)).orderBy(asc(documents.createdAt)),
    db
      .select({ installmentId: payments.installmentId, sum: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(inArray(payments.installmentId, ids))
      .groupBy(payments.installmentId),
    db.select().from(signingPapers).where(eq(signingPapers.contractId, contractId)),
  ]);
  const signedIds = paperRows.map((one) => one.signedDocumentId).filter(Boolean) as string[];
  const signedDocs = signedIds.length ? await db.select().from(documents).where(inArray(documents.id, signedIds)) : [];

  const out: StageView[] = [];
  for (const line of lines) {
    const base = stageFrom(names, line.label, line.labelEl);
    const paperKind = papers.get(line.id) ?? null;
    const kind: StageKind = paperKind ? "PAPER" : base && WORKS.includes(base) ? "WORKS" : "PLAIN";
    const paperRowOf = paperKind ? paperRows.find((one) => one.kind === paperKind) : null;
    const signed = paperRowOf?.signedDocumentId ? (signedDocs.find((doc) => doc.id === paperRowOf.signedDocumentId) ?? null) : null;
    const certificates = docs.filter((doc) => doc.installmentId === line.id && doc.category === "STAGE_CERTIFICATE");
    const photos = docs.filter((doc) => doc.installmentId === line.id && doc.category === "STAGE_PHOTO");
    const totalCents = toCents(line.totalAmount);
    const paidCents = toCents(paid.find((one) => one.installmentId === line.id)?.sum ?? "0");
    const blocked =
      totalCents > 0 && paidCents >= totalCents
        ? "This stage is paid already."
        : kind === "PAPER" && !signed
          ? `Upload the signed ${PAPER_NAME[paperKind as PaperKind]} first.`
          : kind === "WORKS" && (certificates.length === 0 || photos.length === 0)
            ? "Upload the architect's certificate and at least one photograph first."
            : null;
    const invoice = await advanceInvoiceFor(line.id);
    /* Sent, by the record on the stage, or by the message log when the page that
       sent it never got to write it down; then it is written down now. */
    let failed: StageView["failed"] = null;
    if (invoice && !line.invoiceSentAt) {
      const mail = await invoiceMail(invoice.clientId, invoice.number);
      if (mail?.status === "SENT") {
        line.invoiceSentAt = mail.at;
        await db.update(installments).set({ invoiceSentAt: mail.at }).where(eq(installments.id, line.id));
      } else if (mail) {
        failed = { at: mail.at, error: mail.error ?? String(mail.status) };
      }
    }
    out.push({ line, kind, paperKind, signed, certificates, photos, invoice, totalCents, paidCents, blocked, failed });
  }
  return out;
}

/** A photograph made small enough to travel: a phone picture of 6 MB becomes a few hundred KB. */
async function photoFile(doc: Doc): Promise<EmailAttachment> {
  const path = resolveStored(doc.filePath);
  const name = (doc.originalName || doc.title).replace(/\.[^.]+$/, "");
  try {
    const content = await sharp(await readFile(path)).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    return { filename: `${name}.jpg`, content, contentType: "image/jpeg" };
  } catch {
    /* Not a picture sharp can read: it goes as it is. */
    return { filename: doc.originalName || doc.title, path, contentType: doc.mimeType ?? undefined };
  }
}

const fileOfDoc = (doc: Doc): EmailAttachment => ({
  filename: doc.originalName || doc.title,
  path: resolveStored(doc.filePath),
  contentType: doc.mimeType ?? undefined,
});

/**
 * Issue the invoice of a stage and send it, with what goes with it.
 *
 * Pressed again, the same invoice goes again: a stage has one invoice.
 */
export async function sendStageInvoice(
  contractId: string,
  installmentId: string,
  who: { id: string; name?: string | null },
): Promise<LetterResult & { number?: string }> {
  const stages = await stagesOf(contractId);
  const stage = stages.find((one) => one.line.id === installmentId);
  if (!stage) return { ok: false, said: "That stage is not on this contract." };
  if (stage.blocked) return { ok: false, said: stage.blocked };

  const invoice = await issueStageInvoice(installmentId, who, { dueWords: "PAYMENT DUE ON RECEIPT" });
  if (!invoice) return { ok: false, said: "No invoice can be issued for this contract." };
  const files: EmailAttachment[] = [];
  const own = await paperAttachment(invoice);
  if (own) files.push({ filename: own.filename, content: own.content, contentType: own.contentType });

  let key = "stage_invoice";
  if (stage.kind === "PAPER" && stage.signed) {
    key = "stage_invoice_signed";
    files.push(fileOfDoc(stage.signed));
  }
  if (stage.kind === "WORKS") {
    key = "stage_invoice_works";
    for (const doc of stage.certificates) files.push(fileOfDoc(doc));
    for (const doc of stage.photos) files.push(await photoFile(doc));
  }

  const result = await writeToBuyer(key, contractId, stage.paperKind, {
    invoice_number: invoice.number,
    stage: stage.line.label ?? "",
    amount: formatAmount(toCents(invoice.totalAmount), "en"),
  }, files);

  if (result.ok) {
    await db.update(installments).set({ invoiceSentAt: new Date(), updatedAt: new Date() }).where(eq(installments.id, installmentId));
    if (stage.kind === "PAPER" && stage.paperKind) {
      /* The paper's own steps say so too: its invoice went, and its signed copy with it. */
      const paper = await paperRow(contractId, stage.paperKind);
      await db
        .update(signingPapers)
        .set({
          installmentId,
          invoiceId: invoice.id,
          invoiceSentAt: new Date(),
          signedSentAt: new Date(),
          approvedAt: paper.approvedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(signingPapers.id, paper.id));
    }
  }
  return { ...result, number: invoice.number };
}

/** Whether a stage's invoice went to the buyer already, so the letter for its money carries the receipt alone. */
export async function invoiceWentFor(installmentId: string | null | undefined): Promise<boolean> {
  if (!installmentId) return false;
  const [line] = await db
    .select({ sent: installments.invoiceSentAt, clientId: contracts.clientId })
    .from(installments)
    .innerJoin(contracts, eq(contracts.id, installments.contractId))
    .where(eq(installments.id, installmentId))
    .limit(1);
  if (!line) return false;
  if (line.sent) return true;
  const invoice = await advanceInvoiceFor(installmentId);
  if (!invoice) return false;
  const mail = await invoiceMail(line.clientId, invoice.number);
  if (mail?.status !== "SENT") return false;
  await db.update(installments).set({ invoiceSentAt: mail.at }).where(eq(installments.id, installmentId));
  return true;
}
