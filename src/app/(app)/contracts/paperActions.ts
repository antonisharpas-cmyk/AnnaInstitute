"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contracts, projects, signingPapers, units } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { removeDocument, storeDocument } from "@/lib/uploads";
import { sendWaitingFor } from "@/lib/automaticEmails";
import { followTheMoney } from "@/lib/statuses";
import {
  afterSigned,
  invoiceBeforeSigning,
  PAPER_KINDS,
  PAPER_NAME,
  paperRow,
  sendDraftForReview,
  type PaperKind,
} from "@/lib/signingPapers";

/*
 * The steps of the Reservation and the Contract of Sale on a contract.
 * See lib/signingPapers.ts for the whole of it.
 */

const kindOf = (raw: string): PaperKind => ((PAPER_KINDS as readonly string[]).includes(raw) ? (raw as PaperKind) : "RESERVATION");

async function contractOf(contractId: string) {
  const [row] = await db
    .select({ contract: contracts, unit: units, project: projects })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .where(eq(contracts.id, contractId))
    .limit(1);
  return row ?? null;
}

const fileFrom = (formData: FormData) => {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
};

function refresh(contractId: string, clientId: string | null) {
  revalidatePath(`/contracts/${contractId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/** The draft, new or in place of the one before. A changed draft has to be sent again. */
export async function uploadPaperDraft(contractId: string, rawKind: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const kind = kindOf(rawKind);
  const row = await contractOf(contractId);
  const file = fileFrom(formData);
  if (!row || !file) {
    await flash("said.noFile", "bad");
    return;
  }
  const paper = await paperRow(contractId, kind);
  if (paper.signedDocumentId) {
    await flash("said.paperAlreadySigned", "bad");
    return;
  }
  const place = [row.unit?.code, row.project?.name].filter(Boolean).join(" ");
  const documentId = await storeDocument({
    file,
    title: `${PAPER_NAME[kind]} draft${place ? `, ${place}` : ""}`,
    category: "DRAFT",
    attachTo: { contractId, clientId: row.contract.clientId ?? undefined, unitId: row.contract.unitId ?? undefined },
    user,
  });
  const before = paper.draftDocumentId;
  await db
    .update(signingPapers)
    .set({ draftDocumentId: documentId, sentForReviewAt: null, updatedAt: new Date() })
    .where(eq(signingPapers.id, paper.id));
  if (before) await removeDocument(before, user);
  await recordAudit({
    action: before ? "paper.draft.replaced" : "paper.draft.added",
    entity: "contract",
    entityId: contractId,
    detail: PAPER_NAME[kind],
    userId: user.id,
    userEmail: user.email,
  });
  await flash(before ? "said.paperDraftReplaced" : "said.paperDraftSaved");
  refresh(contractId, row.contract.clientId);
}

/** Take the draft off, to start that paper again. */
export async function removePaperDraft(contractId: string, rawKind: string) {
  const user = await requireUser(["ADMIN"]);
  const kind = kindOf(rawKind);
  const paper = await paperRow(contractId, kind);
  if (paper.draftDocumentId) {
    const id = paper.draftDocumentId;
    await db.update(signingPapers).set({ draftDocumentId: null, sentForReviewAt: null, updatedAt: new Date() }).where(eq(signingPapers.id, paper.id));
    await removeDocument(id, user);
  }
  const row = await contractOf(contractId);
  await flash("said.deleted");
  refresh(contractId, row?.contract.clientId ?? null);
}

/** Step 1: to the buyer, to check. */
export async function sendPaperForReview(contractId: string, rawKind: string) {
  const user = await requireUser(["ADMIN"]);
  const kind = kindOf(rawKind);
  const result = await sendDraftForReview(contractId, kind);
  await recordAudit({
    action: "paper.review.sent",
    entity: "contract",
    entityId: contractId,
    detail: `${PAPER_NAME[kind]}: ${result.said}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(`${result.ok ? "said.paperSent" : "said.paperNotSent"}|${result.said}`, result.ok ? "good" : "bad");
  const row = await contractOf(contractId);
  refresh(contractId, row?.contract.clientId ?? null);
}

/** Step 2: the buyer is happy and wants to go ahead. The invoice is issued and sent. */
export async function invoicePaper(contractId: string, rawKind: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const kind = kindOf(rawKind);
  const installmentId = String(formData.get("stageId") ?? "");
  const result = await invoiceBeforeSigning(contractId, kind, installmentId, { id: user.id, name: user.name });
  await recordAudit({
    action: "paper.invoice.sent",
    entity: "contract",
    entityId: contractId,
    detail: `${PAPER_NAME[kind]}: invoice ${result.number ?? "none"}, ${result.said}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(
    `${result.ok ? "said.paperInvoiced" : "said.paperNotSent"}|${result.number ? `${result.number}. ` : ""}${result.said}`,
    result.ok ? "good" : "bad",
  );
  const row = await contractOf(contractId);
  refresh(contractId, row?.contract.clientId ?? null);
  revalidatePath("/invoices");
}

/** Step 3: the signed copy, in the draft's place. */
export async function uploadPaperSigned(contractId: string, rawKind: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const kind = kindOf(rawKind);
  const row = await contractOf(contractId);
  const file = fileFrom(formData);
  if (!row || !file) {
    await flash("said.noFile", "bad");
    return;
  }
  const paper = await paperRow(contractId, kind);
  /* Signed is final: once the signed copy is in, it is never changed. */
  if (paper.signedDocumentId) {
    await flash("said.paperAlreadySigned", "bad");
    refresh(contractId, row.contract.clientId);
    return;
  }
  const place = [row.unit?.code, row.project?.name].filter(Boolean).join(" ");
  const documentId = await storeDocument({
    file,
    title: `${PAPER_NAME[kind]} signed${place ? `, ${place}` : ""}`,
    /* The signed Contract of Sale is the contract itself, which the signing letter carries. */
    category: kind === "SALE" ? "CONTRACT" : "RESERVATION",
    attachTo: { contractId, clientId: row.contract.clientId ?? undefined, unitId: row.contract.unitId ?? undefined },
    user,
  });
  const draft = paper.draftDocumentId;
  await db
    .update(signingPapers)
    .set({ signedDocumentId: documentId, draftDocumentId: null, signedAt: new Date(), updatedAt: new Date() })
    .where(eq(signingPapers.id, paper.id));
  /* The signed copy takes the draft's place. */
  if (draft) await removeDocument(draft, user);
  await recordAudit({
    action: "paper.signed",
    entity: "contract",
    entityId: contractId,
    detail: PAPER_NAME[kind],
    userId: user.id,
    userEmail: user.email,
  });

  /* Signed means reserved: an apartment in Negotiation moves on now. */
  await followTheMoney(contractId, user);

  /* The letter for the money that was waiting for it goes now, with it. */
  await sendWaitingFor(contractId);
  const alone = await afterSigned(contractId, kind);
  await flash(alone ? `${alone.ok ? "said.paperSignedSent" : "said.paperNotSent"}|${alone.said}` : "said.paperSigned", alone && !alone.ok ? "bad" : "good");
  refresh(contractId, row.contract.clientId);
}

/** A signed copy is final: it is never deleted. Kept for any old page still open, it only says so. */
export async function removePaperSigned(contractId: string, rawKind: string) {
  await requireUser(["ADMIN"]);
  void rawKind;
  const row = await contractOf(contractId);
  await flash("said.paperAlreadySigned", "bad");
  refresh(contractId, row?.contract.clientId ?? null);
}
