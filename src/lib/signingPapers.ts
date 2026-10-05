import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automaticEmails,
  clients,
  contracts,
  documents,
  installments,
  issuedDocuments,
  payments,
  projects,
  signingPapers,
  units,
} from "@/db/schema";
import { stageFrom, stageNames } from "@/lib/choices/stages";
import { formatAmount, toCents } from "@/lib/money";
import { resolveStored } from "@/lib/storage";
import { sendAndRecord } from "@/lib/messaging";
import type { EmailAttachment } from "@/lib/messaging/email";
import { templateByKey } from "@/lib/templates";
import { buyersFirstNames, buyersName, emailList, hasSecondBuyer } from "@/lib/buyers";
import { issuedAttachments, issueForPayment, issueStageInvoice, paperAttachment } from "@/lib/issued";

/**
 * The Reservation and the Contract of Sale, from draft to signed.
 *
 * The buyer comes to the office to sign, and the office wants them to arrive
 * with everything settled: the paper read and agreed, and the invoice in hand
 * so they can pay it on the day. So each paper goes through the same steps:
 *
 *   1. The draft is uploaded and sent to the buyer to check. If they want a
 *      change, the draft is replaced and sent again, as often as it takes.
 *   2. The buyer says it is fine and they want to go ahead. The office marks
 *      it, and the invoice for the stage the paper is paid with is issued and
 *      sent to them, so they come to sign with it.
 *   3. They sign and pay. The signed copy is uploaded and takes the draft's
 *      place, and the letter for the money goes with the receipt and the
 *      signed copy attached. Whichever comes first, the money or the signed
 *      copy, the letter waits for the other, so the buyer gets one letter.
 */

export const PAPER_KINDS = ["RESERVATION", "SALE"] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

/** The name the buyer reads in their letters. */
export const PAPER_NAME: Record<PaperKind, string> = {
  RESERVATION: "Reservation Agreement",
  SALE: "Contract of Sale",
};

type Line = typeof installments.$inferSelect;

/** The stage a paper is paid with, when the office has not chosen one: the reservation, or the signing. */
export async function defaultStage(kind: PaperKind, lines: Line[]): Promise<Line | null> {
  if (lines.length === 0) return null;
  const names = await stageNames();
  const wanted = kind === "RESERVATION" ? "RESERVATION" : "SIGNING";
  const found = lines.find((line) => stageFrom(names, line.label, line.labelEl) === wanted);
  if (found) return found;
  const sorted = [...lines].sort((a, b) => a.seq - b.seq);
  return kind === "RESERVATION" ? sorted[0] : (sorted[1] ?? null);
}

export type PaperView = {
  kind: PaperKind;
  paper: typeof signingPapers.$inferSelect | null;
  draft: typeof documents.$inferSelect | null;
  signed: typeof documents.$inferSelect | null;
  invoice: typeof issuedDocuments.$inferSelect | null;
  stage: Line | null;
  paidCents: number;
  stageCents: number;
  /** Where it stands, for the screen. */
  step: "NONE" | "DRAFT" | "SENT" | "INVOICED" | "SIGNED";
};

/** Both papers of a contract, as they stand. */
export async function papersOf(contractId: string): Promise<PaperView[]> {
  const [rows, lines] = await Promise.all([
    db.select().from(signingPapers).where(eq(signingPapers.contractId, contractId)),
    db.select().from(installments).where(eq(installments.contractId, contractId)).orderBy(asc(installments.seq)),
  ]);
  const docIds = rows.flatMap((one) => [one.draftDocumentId, one.signedDocumentId]).filter(Boolean) as string[];
  const invoiceIds = rows.map((one) => one.invoiceId).filter(Boolean) as string[];
  const [docs, invoices] = await Promise.all([
    docIds.length ? db.select().from(documents).where(inArray(documents.id, docIds)) : [],
    invoiceIds.length ? db.select().from(issuedDocuments).where(inArray(issuedDocuments.id, invoiceIds)) : [],
  ]);
  const out: PaperView[] = [];
  for (const kind of PAPER_KINDS) {
    const paper = rows.find((one) => one.kind === kind) ?? null;
    const stage = (paper?.installmentId ? lines.find((line) => line.id === paper.installmentId) : null) ?? (await defaultStage(kind, lines));
    const [paid] = stage
      ? await db
          .select({ sum: sql<string>`coalesce(sum(${payments.amount}), 0)` })
          .from(payments)
          .where(eq(payments.installmentId, stage.id))
      : [{ sum: "0" }];
    const draft = docs.find((doc) => doc.id === paper?.draftDocumentId) ?? null;
    const signed = docs.find((doc) => doc.id === paper?.signedDocumentId) ?? null;
    const invoice = invoices.find((one) => one.id === paper?.invoiceId && !one.voidedAt && !one.creditedById) ?? null;
    const step: PaperView["step"] = signed
      ? "SIGNED"
      : invoice
        ? "INVOICED"
        : draft && paper?.sentForReviewAt
          ? "SENT"
          : draft
            ? "DRAFT"
            : "NONE";
    out.push({
      kind,
      paper,
      draft,
      signed,
      invoice,
      stage,
      paidCents: toCents(paid?.sum ?? "0"),
      stageCents: stage ? toCents(stage.totalAmount) : 0,
      step,
    });
  }
  return out;
}

/** The paper row, made the first time it is needed. */
export async function paperRow(contractId: string, kind: PaperKind) {
  const [found] = await db
    .select()
    .from(signingPapers)
    .where(and(eq(signingPapers.contractId, contractId), eq(signingPapers.kind, kind)))
    .limit(1);
  if (found) return found;
  const [made] = await db.insert(signingPapers).values({ contractId, kind }).onConflictDoNothing().returning();
  if (made) return made;
  const [again] = await db
    .select()
    .from(signingPapers)
    .where(and(eq(signingPapers.contractId, contractId), eq(signingPapers.kind, kind)))
    .limit(1);
  return again;
}

/** The buyer, the apartment and the development, for a letter. */
async function buyerOf(contractId: string) {
  const [row] = await db
    .select({ contract: contracts, client: clients, unit: units, project: projects })
    .from(contracts)
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .where(eq(contracts.id, contractId))
    .limit(1);
  return row ?? null;
}

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole);

const fileOf = (doc: typeof documents.$inferSelect): EmailAttachment => ({
  filename: doc.originalName || doc.title,
  path: resolveStored(doc.filePath),
  contentType: doc.mimeType ?? undefined,
});

export type LetterResult = { ok: boolean; said: string };

/** One of the paper letters, to the buyer, copied to the second buyer. */
export async function writeToBuyer(
  key: string,
  contractId: string,
  kind: PaperKind | null,
  extra: Record<string, string>,
  attachments: EmailAttachment[],
): Promise<LetterResult> {
  const row = await buyerOf(contractId);
  if (!row?.client) return { ok: false, said: "This contract has no buyer." };
  if (!row.client.email) return { ok: false, said: "The buyer has no email address on their record." };
  const template = await templateByKey(key);
  if (!template) return { ok: false, said: "The letter is missing." };
  if (!template.isActive) return { ok: false, said: "This letter is switched off in Automatic emails." };
  const values: Record<string, string> = {
    first_name: buyersFirstNames(row.client),
    last_name: row.client.lastName ?? "",
    name: buyersName(row.client),
    unit: row.unit?.code ?? row.contract.reference ?? "",
    project: row.project?.name ?? "",
    reference: row.contract.reference ?? "",
    paper: kind ? PAPER_NAME[kind] : "",
    ...extra,
  };
  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: { name: values.name, email: row.client.email, clientId: row.client.id },
    subject: fill(template.subject ?? "", values),
    body: fill(template.body, values),
    withOptOut: false,
    attachments,
    cc: emailList(hasSecondBuyer(row.client) ? row.client.secondEmail : null, null),
  });
  await db.insert(automaticEmails).values({
    templateKey: key,
    contractId,
    clientId: row.client.id,
    status: result.status === "SENT" ? "SENT" : result.status === "SIMULATED" ? "SKIPPED" : "FAILED",
    reason: result.status === "SENT" ? "Sent." : (result.error ?? "It did not go."),
    sentAt: result.status === "SENT" ? new Date() : null,
  });
  if (result.status === "SENT") return { ok: true, said: `Sent to ${row.client.email}.` };
  if (result.status === "SIMULATED") return { ok: true, said: "Email is not set up yet, so nothing left the building." };
  return { ok: false, said: result.error ?? "It did not go." };
}

/** Step 1: the draft to the buyer, to check. */
export async function sendDraftForReview(contractId: string, kind: PaperKind): Promise<LetterResult> {
  const paper = await paperRow(contractId, kind);
  const [draft] = paper.draftDocumentId
    ? await db.select().from(documents).where(eq(documents.id, paper.draftDocumentId)).limit(1)
    : [];
  if (!draft) return { ok: false, said: "Upload the draft first." };
  const result = await writeToBuyer("paper_review", contractId, kind, {}, [fileOf(draft)]);
  if (result.ok) {
    await db.update(signingPapers).set({ sentForReviewAt: new Date(), updatedAt: new Date() }).where(eq(signingPapers.id, paper.id));
  }
  return result;
}

/** Step 2: the buyer wants to go ahead. The invoice for the stage is issued and sent. */
export async function invoiceBeforeSigning(
  contractId: string,
  kind: PaperKind,
  installmentId: string,
  who: { id: string; name?: string | null },
): Promise<LetterResult & { number?: string }> {
  const [line] = await db
    .select()
    .from(installments)
    .where(and(eq(installments.id, installmentId), eq(installments.contractId, contractId)))
    .limit(1);
  if (!line) return { ok: false, said: "Choose the stage this paper is paid with." };
  const invoice = await issueStageInvoice(line.id, who);
  if (!invoice) return { ok: false, said: "No invoice can be issued for this contract." };
  const paper = await paperRow(contractId, kind);
  await db
    .update(signingPapers)
    .set({ installmentId: line.id, invoiceId: invoice.id, approvedAt: paper.approvedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(signingPapers.id, paper.id));
  const file = await paperAttachment(invoice);
  const result = await writeToBuyer(
    "paper_invoice",
    contractId,
    kind,
    { invoice_number: invoice.number, stage: line.label ?? "", amount: formatAmount(toCents(invoice.totalAmount), "en") },
    file ? [file] : [],
  );
  if (result.ok) {
    await db.update(signingPapers).set({ invoiceSentAt: new Date(), updatedAt: new Date() }).where(eq(signingPapers.id, paper.id));
  }
  return { ...result, number: invoice.number };
}

/**
 * Step 3, the paper side: the signed copy is in.
 *
 * If the money for its stage was already written about without it, the signed
 * copy goes to the buyer now with the receipt. If the letter for the money is
 * waiting for it, the caller sends that letter, which carries it.
 */
export async function afterSigned(contractId: string, kind: PaperKind): Promise<LetterResult | null> {
  const paper = await paperRow(contractId, kind);
  if (!paper.signedDocumentId || paper.signedSentAt) return null;
  const lines = await db.select().from(installments).where(eq(installments.contractId, contractId));
  const stage = (paper.installmentId ? lines.find((one) => one.id === paper.installmentId) : null) ?? (await defaultStage(kind, lines));
  if (!stage) return null;
  const paid = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.installmentId, stage.id), eq(payments.kind, "PAYMENT")))
    .orderBy(asc(payments.createdAt));
  if (paid.length === 0) return null;
  const letters = await db
    .select({ status: automaticEmails.status })
    .from(automaticEmails)
    .where(inArray(automaticEmails.paymentId, paid.map((one) => one.id)));
  /* The letter for the money is still to go: it will carry the signed copy. */
  if (letters.length === 0 || letters.some((one) => one.status === "WAITING")) return null;
  const [signed] = await db.select().from(documents).where(eq(documents.id, paper.signedDocumentId)).limit(1);
  if (!signed) return null;
  const files: EmailAttachment[] = [fileOf(signed)];
  for (const one of paid) {
    try {
      await issueForPayment(one.id);
      for (const file of await issuedAttachments(one.id)) {
        if (/receipt/i.test(file.filename)) files.push({ filename: file.filename, content: file.content, contentType: file.contentType });
      }
    } catch {
      /* The signed copy goes without the receipt rather than not at all. */
    }
  }
  const result = await writeToBuyer("paper_signed", contractId, kind, {}, files);
  if (result.ok) {
    await db.update(signingPapers).set({ signedSentAt: new Date(), updatedAt: new Date() }).where(eq(signingPapers.id, paper.id));
  }
  return result;
}

/**
 * For the letter about one payment: the paper paid with that stage, if one is
 * on its way to being signed. The letter waits for the signed copy, and goes
 * with it once it is there.
 */
export async function paperForPayment(
  contractId: string,
  installmentId: string | null,
  counted: string | null,
): Promise<{ kind: PaperKind; signed: EmailAttachment | null; paperId: string } | null> {
  if (!installmentId) return null;
  const rows = await db.select().from(signingPapers).where(eq(signingPapers.contractId, contractId));
  const match =
    rows.find((one) => one.installmentId === installmentId) ??
    rows.find(
      (one) =>
        !one.installmentId &&
        ((one.kind === "RESERVATION" && counted === "RESERVATION") || (one.kind === "SALE" && counted === "SIGNING")),
    );
  if (!match) return null;
  /* A paper that never left the office is not something to wait for. */
  if (!match.signedDocumentId && !match.draftDocumentId && !match.invoiceId) return null;
  const [signed] = match.signedDocumentId
    ? await db.select().from(documents).where(eq(documents.id, match.signedDocumentId)).limit(1)
    : [];
  return { kind: match.kind as PaperKind, signed: signed ? fileOf(signed) : null, paperId: match.id };
}

export async function markSignedSent(paperId: string) {
  await db.update(signingPapers).set({ signedSentAt: new Date(), updatedAt: new Date() }).where(eq(signingPapers.id, paperId));
}
