import { createReadStream } from "node:fs";
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

  const stream = createReadStream(resolveStored(file.filePath));
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": file.mimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(file.originalName ?? "file").replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
