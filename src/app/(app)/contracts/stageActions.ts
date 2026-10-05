"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contracts, documents, installments, signingPapers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { removeDocument, storeDocument } from "@/lib/uploads";
import { sendStageInvoice } from "@/lib/stageInvoices";
import { PAPER_KINDS, PAPER_NAME, paperRow, type PaperKind } from "@/lib/signingPapers";

/*
 * The invoice of each stage, and the proof that goes with a stage of the
 * building. See lib/stageInvoices.ts.
 */

async function lineOf(contractId: string, installmentId: string) {
  const [row] = await db
    .select({ line: installments, contract: contracts })
    .from(installments)
    .innerJoin(contracts, eq(contracts.id, installments.contractId))
    .where(and(eq(installments.id, installmentId), eq(installments.contractId, contractId)))
    .limit(1);
  return row ?? null;
}

function refresh(contractId: string, clientId: string | null) {
  revalidatePath(`/contracts/${contractId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/invoices/clients");
}

/** The architect's certificate, or the photographs, of one stage. */
export async function uploadStageProof(contractId: string, installmentId: string, which: "certificate" | "photos", formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const row = await lineOf(contractId, installmentId);
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!row || files.length === 0) {
    await flash("said.chooseAFile", "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }
  const problems: string[] = [];
  for (const [index, file] of files.entries()) {
    try {
      await storeDocument({
        file,
        title: `${which === "certificate" ? "Architect's certificate" : "Photograph"}, ${row.line.label ?? "stage"}${files.length > 1 ? ` ${index + 1}` : ""}`,
        category: which === "certificate" ? "STAGE_CERTIFICATE" : "STAGE_PHOTO",
        attachTo: { contractId, clientId: row.contract.clientId ?? undefined, installmentId },
        user,
      });
    } catch (error) {
      problems.push(error instanceof Error ? error.message : `${file.name} could not be kept.`);
    }
  }
  await recordAudit({
    action: `stage.${which}`,
    entity: "contract",
    entityId: contractId,
    detail: `${row.line.label ?? ""}: ${files.length - problems.length} file(s)`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(problems.length ? `said.papersNotKept|${problems.join(" ")}` : "said.saved", problems.length ? "bad" : "good");
  refresh(contractId, row.contract.clientId);
}

export async function removeStageProof(contractId: string, documentId: string) {
  const user = await requireUser(["ADMIN"]);
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.contractId, contractId))).limit(1);
  if (doc && (doc.category === "STAGE_CERTIFICATE" || doc.category === "STAGE_PHOTO")) await removeDocument(doc.id, user);
  await flash("said.deleted");
  revalidatePath(`/contracts/${contractId}`);
}

/** Send the invoice of one stage, with its papers. */
export async function sendStageInvoiceAction(contractId: string, installmentId: string) {
  const user = await requireUser(["ADMIN"]);
  const row = await lineOf(contractId, installmentId);
  if (!row) return;
  const result = await sendStageInvoice(contractId, installmentId, { id: user.id, name: user.name });
  await recordAudit({
    action: "stage.invoice.sent",
    entity: "contract",
    entityId: contractId,
    detail: `${row.line.label ?? ""}: invoice ${result.number ?? "none"}, ${result.said}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(
    `${result.ok ? "said.stageInvoiceSent" : "said.paperNotSent"}|${result.number ? `${result.number}. ` : ""}${result.said}`,
    result.ok ? "good" : "bad",
  );
  refresh(contractId, row.contract.clientId);
}

/**
 * From the Reservation or the Contract of Sale: the stage it is paid with, as
 * chosen there, then its invoice with the signed copy.
 */
export async function sendPaperInvoice(contractId: string, rawKind: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const kind: PaperKind = (PAPER_KINDS as readonly string[]).includes(rawKind) ? (rawKind as PaperKind) : "RESERVATION";
  const installmentId = String(formData.get("stageId") ?? "");
  const row = await lineOf(contractId, installmentId);
  if (!row) {
    await flash(`said.paperNotSent|Choose the stage the ${PAPER_NAME[kind]} is paid with.`, "bad");
    revalidatePath(`/contracts/${contractId}`);
    return;
  }
  const paper = await paperRow(contractId, kind);
  if (paper.installmentId !== installmentId) {
    await db.update(signingPapers).set({ installmentId, updatedAt: new Date() }).where(eq(signingPapers.id, paper.id));
  }
  await sendStageInvoiceAction(contractId, installmentId);
}
