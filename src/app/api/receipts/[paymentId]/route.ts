import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { canReadDocument } from "@/lib/documents";
import { issueForPayment } from "@/lib/issued";
import { resolveStored } from "@/lib/storage";

/**
 * The receipt, or with ?kind=invoice the invoice, issued for a payment.
 *
 * The very file that was kept on the day and went with the buyer's letter. A
 * payment recorded before the CRM issued papers gets them issued now, once.
 */
export async function GET(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!(await canReadDocument(user))) return new NextResponse("Not allowed", { status: 403 });

  const { paymentId } = await params;
  const url = new URL(request.url);
  const wantInvoice = url.searchParams.get("kind") === "invoice";

  const pair = await issueForPayment(paymentId, { id: user.id, name: user.name });
  const paper = wantInvoice ? pair.invoice : pair.receipt;
  if (!paper?.documentId) return new NextResponse("Not found", { status: 404 });

  const [doc] = await db.select().from(documents).where(eq(documents.id, paper.documentId)).limit(1);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  let content: Buffer;
  try {
    content = await readFile(resolveStored(doc.filePath));
  } catch {
    return new NextResponse("The file is missing from storage", { status: 410 });
  }

  /* The name it was filed under, "Invoice 0001 Reservation, 101 MAGNUM OPUS DUE.pdf". */
  const filename = doc.originalName || `${paper.kind === "INVOICE" ? "Invoice" : "Receipt"} ${paper.number}.pdf`;
  const download = url.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(content.length),
      /* A plain name for every browser, and the exact one for those that read it. */
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\x20-\x7E]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
