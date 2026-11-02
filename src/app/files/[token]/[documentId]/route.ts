import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { campaignAttachments, resolveFilesToken } from "@/lib/campaignFiles";
import { resolveStored, storageRoot } from "@/lib/storage";

/**
 * A small copy of a render, for the previews on the files page. A render is
 * often several megabytes, and the page showed every one at full size, so it
 * was slow to open on a phone. The small copy is made once and kept beside the
 * files; the full picture opens when it is tapped. Without the picture tool the
 * full one is sent, as before.
 *
 * Making one means opening the whole render, and a 15 MB render is a hundred
 * megabytes or more once opened. A page of renders asks for a dozen at once,
 * which on a 512 MB server ran the memory to its limit. So they are made one
 * at a time, read from the top down rather than whole, with the picture tool's
 * own cache off; the next one waits its turn. Each is made once only, and
 * then read from the disk.
 */
let turn: Promise<unknown> = Promise.resolve();
const making = new Map<string, Promise<Buffer | null>>();

function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = turn.then(work, work);
  turn = next.catch(() => undefined);
  return next;
}

async function makeThumbnail(full: string, kept: string): Promise<Buffer | null> {
  const ready = await readFile(kept).catch(() => null);
  if (ready) return ready;
  try {
    const sharp = (await import("sharp")).default;
    sharp.cache(false);
    sharp.concurrency(1);
    const small = await sharp(full, { sequentialRead: true, limitInputPixels: 120_000_000 })
      .rotate()
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    await mkdir(path.dirname(kept), { recursive: true });
    await writeFile(kept, small).catch(() => undefined);
    return small;
  } catch {
    return null;
  }
}

async function thumbnail(documentId: string, full: string): Promise<Buffer | null> {
  const kept = path.join(storageRoot(), "thumbs", `${documentId}.jpg`);
  const ready = await readFile(kept).catch(() => null);
  if (ready) return ready;
  /* The same render asked for twice while it is being made waits for the one copy. */
  const already = making.get(documentId);
  if (already) return already;
  const job = oneAtATime(() => makeThumbnail(full, kept)).finally(() => making.delete(documentId));
  making.set(documentId, job);
  return job;
}

/**
 * One file from a campaign link. The token has to be valid and the document has
 * to belong to that campaign, so a token can never be used to read anything
 * else in the system.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await context.params;

  const link = await resolveFilesToken(token);
  if (!link?.campaignId) return new Response("Not found", { status: 404 });

  /* Only what the campaign's page lists: its own files and its developments' papers. */
  const file = (await campaignAttachments(link.campaignId)).find((d) => d.id === documentId);
  if (!file) return new Response("Not found", { status: 404 });

  /* A file whose copy on disk has gone answers plainly rather than breaking half way. */
  const full = resolveStored(file.filePath);
  const info = await stat(full).catch(() => null);
  if (!info) return new Response("This file is no longer available.", { status: 404 });

  if (new URL(request.url).searchParams.get("size") === "small" && (file.mimeType ?? "").startsWith("image/")) {
    const small = await thumbnail(file.id, full);
    if (small) {
      return new Response(new Uint8Array(small), {
        headers: { "Content-Type": "image/jpeg", "Content-Length": String(small.length), "Cache-Control": "private, max-age=86400" },
      });
    }
  }

  /* A header can only carry plain letters, so a Greek name such as "Κάτοψη.png"
     goes in the encoded form browsers read, with a plain copy beside it.
     Without this the page answered with an error for any Greek file name. */
  const name = file.originalName ?? "file";
  const stream = createReadStream(full);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": file.mimeType ?? "application/octet-stream",
      "Content-Length": String(info.size),
      "Content-Disposition": `inline; filename="${name.replace(/[^\x20-\x7E]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
