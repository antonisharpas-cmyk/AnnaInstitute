import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { canReadDocument } from "@/lib/documents";
import { receiptPdf } from "@/lib/paymentPdf";

/**
 * The receipt the CRM draws up for a payment, as a PDF.
 *
 * The same document that goes with the automatic letter, so the office can
 * open exactly what the buyer received, print it, or send it on by hand.
 */
export async function GET(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!(await canReadDocument(user))) return new NextResponse("Not allowed", { status: 403 });

  const { paymentId } = await params;
  const drawn = await receiptPdf(paymentId);
  if (!drawn) return new NextResponse("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(drawn.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(drawn.content.length),
      /* A plain name for every browser, and the exact one for those that read it. */
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${drawn.filename.replace(/[^\x20-\x7E]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(drawn.filename)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
