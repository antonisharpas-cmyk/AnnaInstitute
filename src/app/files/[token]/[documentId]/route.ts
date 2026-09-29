import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDocuments, documents } from "@/db/schema";
import { resolveFilesToken } from "@/lib/campaignFiles";
import { resolveStored } from "@/lib/storage";

/**
 * One file from a campaign link. The token has to be valid and the document has
 * to belong to that campaign, so a token can never be used to read anything
 * else in the system.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await context.params;

  const link = await resolveFilesToken(token);
  if (!link?.campaignId) return new Response("Not found", { status: 404 });

  const rows = await db
    .select({ document: documents })
    .from(campaignDocuments)
    .innerJoin(documents, eq(documents.id, campaignDocuments.documentId))
    .where(eq(campaignDocuments.campaignId, link.campaignId));

  const file = rows.map((r) => r.document).find((d) => d.id === documentId);
  if (!file) return new Response("Not found", { status: 404 });

  /* A file whose copy on disk has gone answers plainly rather than breaking half way. */
  const full = resolveStored(file.filePath);
  const info = await stat(full).catch(() => null);
  if (!info) return new Response("This file is no longer available.", { status: 404 });

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
