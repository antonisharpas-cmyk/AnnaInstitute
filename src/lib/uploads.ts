import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, units } from "@/db/schema";
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
  | "OTHER";

export type AttachTo = {
  clientId?: string | null;
  contractId?: string | null;
  unitId?: string | null;
  projectId?: string | null;
  changeRequestId?: string | null;
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
