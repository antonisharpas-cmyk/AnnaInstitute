import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { canReadDocument } from "@/lib/documents";
import { storedFileStream } from "@/lib/storage";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  const doc = rows[0];
  if (!doc) return new NextResponse("Not found", { status: 404 });

  if (!(await canReadDocument(user))) {
    return new NextResponse("Not allowed", { status: 403 });
  }

  try {
    const { stream, sizeBytes } = await storedFileStream(doc.filePath);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const name = doc.originalName ?? doc.title;

    return new NextResponse(Readable.toWeb(stream) as WebReadableStream as ReadableStream, {
      headers: {
        "Content-Type": doc.mimeType ?? "application/octet-stream",
        "Content-Length": String(sizeBytes),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("The file is missing from storage", { status: 410 });
  }
}
