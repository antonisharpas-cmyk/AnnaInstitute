import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "./id";

/**
 * Uploaded files live on disk, not in the database.
 *
 * Locally that is ./storage. On Render it must be a mounted disk, otherwise the
 * files disappear on every deploy: set STORAGE_DIR to a path on the disk, which
 * render.yaml does for you.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const ALLOWED = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/gif", "gif"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["text/csv", "csv"],
  ["text/plain", "txt"],
]);

export function storageRoot(): string {
  return process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");
}

export function isAllowedType(mimeType: string): boolean {
  return ALLOWED.has(mimeType);
}

export type SavedUpload = {
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
};

export async function saveUpload(file: File): Promise<SavedUpload> {
  if (file.size <= 0) throw new Error("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`The file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }

  const mimeType = file.type || "application/octet-stream";
  const extension = ALLOWED.get(mimeType);
  if (!extension) {
    throw new Error(
      "That file type is not accepted. Use PDF, an image, a Word or Excel file, CSV or plain text.",
    );
  }

  const now = new Date();
  const folder = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
  const name = `${createId()}.${extension}`;
  const absoluteFolder = path.join(storageRoot(), folder);

  await mkdir(absoluteFolder, { recursive: true });
  await writeFile(path.join(absoluteFolder, name), Buffer.from(await file.arrayBuffer()));

  return {
    relativePath: path.posix.join(folder.split(path.sep).join("/"), name),
    mimeType,
    sizeBytes: file.size,
    originalName: safeName(file.name),
  };
}

/** Resolve a stored path safely. Anything trying to climb out is refused. */
export function resolveStored(relativePath: string): string {
  const root = path.resolve(storageRoot());
  const full = path.resolve(root, relativePath);
  if (!full.startsWith(root + path.sep)) throw new Error("Refused path");
  return full;
}

export async function storedFileStream(relativePath: string) {
  const full = resolveStored(relativePath);
  const info = await stat(full);
  return { stream: createReadStream(full), sizeBytes: info.size };
}

export async function deleteStored(relativePath: string): Promise<void> {
  try {
    await unlink(resolveStored(relativePath));
  } catch {
    // Already gone. Nothing to do.
  }
}

export function safeName(name: string): string {
  return (
    name
      .replace(/[\r\n"]/g, "")
      .replace(/[^\w. ()\-Ͱ-Ͽ]/g, "_")
      .slice(0, 120) || "file"
  );
}
