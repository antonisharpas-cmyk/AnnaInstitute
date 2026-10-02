import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, documents, units } from "@/db/schema";
import { deleteStored, saveUpload } from "./storage";
import { recordAudit } from "./audit";
import type { SessionUser } from "./auth";

export type DocumentCategory =
  | "IDENTIFICATION"
  | "CONTRACT"
  | "RECEIPT"
  | "FLOOR_PLAN"
  | "CHANGE_REQUEST"
  | "PROGRESS_PHOTO"
  | "PRICE_LIST"
  | "PICTURES"
  | "ARCHITECTURAL"
  | "BROCHURE"
  | "TECHNICAL_SPEC"
  | "AGENT_INVOICE"
  | "AGENT_RECEIPT"
  | "INVOICE"
  | "CREDIT_NOTE"
  | "REFUND_ACK"
  | "RESERVATION"
  | "DRAFT"
  | "OTHER";

export type AttachTo = {
  clientId?: string | null;
  contractId?: string | null;
  unitId?: string | null;
  projectId?: string | null;
  changeRequestId?: string | null;
  paymentId?: string | null;
  expenseId?: string | null;
  commissionId?: string | null;
};

/** Save one uploaded file and create its document record. */
export async function storeDocument(options: {
  file: File;
  title?: string;
  category: DocumentCategory;
  attachTo: AttachTo;
  user: SessionUser;
}): Promise<string> {
  const saved = await saveUpload(options.file);

  const inserted = await db
    .insert(documents)
    .values({
      category: options.category,
      title: options.title?.trim() || saved.originalName,
      originalName: saved.originalName,
      filePath: saved.relativePath,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      clientId: options.attachTo.clientId ?? null,
      contractId: options.attachTo.contractId ?? null,
      unitId: options.attachTo.unitId ?? null,
      projectId: options.attachTo.projectId ?? null,
      changeRequestId: options.attachTo.changeRequestId ?? null,
      paymentId: options.attachTo.paymentId ?? null,
      expenseId: options.attachTo.expenseId ?? null,
      commissionId: options.attachTo.commissionId ?? null,
      uploadedById: options.user.id,
    })
    .returning({ id: documents.id });

  await recordAudit({
    action: "document.upload",
    entity: "document",
    entityId: inserted[0].id,
    detail: `${options.category}, ${saved.originalName}, ${saved.sizeBytes} bytes`,
    userId: options.user.id,
    userEmail: options.user.email,
  });

  return inserted[0].id;
}

/**
 * Save several files in one go, all attached to the same thing.
 *
 * A title is required. When more than one file arrives under the same title they
 * are numbered, so three floor plans called "Floor Plan 101" become
 * "Floor Plan 101 1", "Floor Plan 101 2" and "Floor Plan 101 3" rather than
 * three rows with the same name.
 */
export async function storeDocuments(options: {
  files: File[];
  title: string;
  category: DocumentCategory;
  attachTo: AttachTo;
  user: SessionUser;
}): Promise<string[]> {
  const title = options.title.trim();
  if (!title) throw new Error("Give the file a title first.");

  const ids: string[] = [];
  for (const [index, file] of options.files.entries()) {
    ids.push(
      await storeDocument({
        file,
        title: options.files.length === 1 ? title : `${title} ${index + 1}`,
        category: options.category,
        attachTo: options.attachTo,
        user: options.user,
      }),
    );
  }
  return ids;
}

/** Remove a document and the file behind it. */
export async function removeDocument(documentId: string, user: SessionUser): Promise<void> {
  const rows = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  const doc = rows[0];
  if (!doc) return;

  // If it was a unit's chosen floor plan, that unit no longer has one.
  if (doc.unitId) {
    await db.update(units).set({ floorPlanPath: null }).where(eq(units.floorPlanPath, documentId));
  }

  await db.delete(documents).where(eq(documents.id, documentId));
  await deleteStored(doc.filePath);

  await recordAudit({
    action: "document.delete",
    entity: "document",
    entityId: documentId,
    detail: `${doc.category}, ${doc.title}`,
    userId: user.id,
    userEmail: user.email,
  });
}

export function readUploadFields(formData: FormData) {
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const title = String(formData.get("title") ?? "").trim();

  if (files.length === 0) throw new Error("Choose at least one file.");
  if (!title) throw new Error("Give the file a title first.");

  return {
    files,
    title,
    category: String(formData.get("category") ?? "OTHER") as DocumentCategory,
  };
}

/* ---------------------------------------------------------------------------
   Filing a document the way the office chooses it

   The client profile and the contract both ask the same question: what kind of
   document is this, and what does that kind need. Keeping the answer here means
   the two cannot drift apart, which is the whole point of the office asking for
   the same logic in both places. The form is one shared component and this is
   the one action behind it.
   --------------------------------------------------------------------------- */

/** The three identification types the office files, and how they read. */
export const ID_LABELS: Record<string, string> = {
  ID_CARD: "Identity Card",
  PASSPORT: "Passport",
  YELLOW_SLIP: "Yellow Slip",
};

/**
 * File the documents on one form submission.
 *
 * Identification is filed as identification, carries its type in the title so a
 * list reads "Passport copy (Passport)", and writes the type and number onto the
 * client record, whether it was filed from the client's own page or from a
 * contract of theirs. Everything else is filed under the type that was chosen.
 */
export async function storeChosenDocuments(options: {
  formData: FormData;
  user: SessionUser;
  /** Where it is being filed from. A contract fills the client in itself. */
  attachTo: AttachTo;
  /** The client whose record an identification number belongs on. */
  clientId?: string | null;
  /** The second buyer's paper rather than the main buyer's. */
  secondBuyer?: boolean;
}): Promise<void> {
  const { formData, user } = options;

  const chosen = String(formData.get("category") ?? "").trim();
  if (!chosen) throw new Error("Choose the type of document first.");

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const typed = String(formData.get("title") ?? "").trim();

  if (files.length === 0) throw new Error("Choose at least one file.");
  if (!typed) throw new Error("Give the file a title first.");

  const idType = ID_LABELS[chosen] ? (chosen as "ID_CARD" | "PASSPORT" | "YELLOW_SLIP") : null;
  const category: DocumentCategory = idType ? "IDENTIFICATION" : (chosen as DocumentCategory);
  const title = idType ? `${typed} (${ID_LABELS[idType]})` : typed;

  if (idType && options.clientId) {
    const idNumber = String(formData.get("idNumber") ?? "").trim();
    await db
      .update(clients)
      .set(
        options.secondBuyer
          ? { secondIdType: idType, ...(idNumber ? { secondIdNumber: idNumber } : {}), updatedAt: new Date() }
          : { idType, ...(idNumber ? { idNumber } : {}), updatedAt: new Date() },
      )
      .where(eq(clients.id, options.clientId));
  }

  // A buyer with more than one apartment keeps different paperwork for each, so
  // the file can name the apartment it concerns.
  const chosenUnit = String(formData.get("unitId") ?? "").trim() || null;

  const ids = await storeDocuments({
    files,
    title,
    category,
    attachTo: { ...options.attachTo, unitId: chosenUnit ?? options.attachTo.unitId ?? null },
    user,
  });
  if (options.secondBuyer && ids.length > 0) {
    await db.update(documents).set({ secondBuyer: true }).where(inArray(documents.id, ids));
  }
}
