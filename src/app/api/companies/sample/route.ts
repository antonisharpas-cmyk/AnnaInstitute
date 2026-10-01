import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { issuerDetails } from "@/lib/issuer";
import { creditNotePdf, invoicePdf, receiptPdfFrom, type IssuedSnapshot } from "@/lib/paymentPdf";

/*
 * A sample of a company's invoice, receipt or credit note, drawn with its real
 * details and a made up buyer, so the office can see the paper before the
 * first real one goes out. Nothing is numbered or kept.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const params = new URL(request.url).searchParams;
  const company = await issuerDetails(params.get("issuer") ?? "");
  const kind = params.get("kind") ?? "invoice";
  const now = new Date().toISOString();
  const s: IssuedSnapshot = {
    company,
    client: {
      name: "Sample Buyer",
      address: "1 Sample Street, Larnaca",
      country: "Cyprus",
      idNumber: "000000",
      vatNumber: "",
      email: "buyer@example.com",
      phone: "",
    },
    contractReference: "SB-MOQ-101",
    property: "SAMPLE DEVELOPMENT, 101",
    stage: "Reservation",
    description: "Reservation, SAMPLE DEVELOPMENT, 101, contract SB-MOQ-101",
    paidOn: now,
    issuedOn: now,
    method: "BANK",
    reference: "",
    netCents: 500000,
    vatCents: 95000,
    totalCents: 595000,
    rate: 19,
    contractTotalCents: 23800000,
    receivedToDateCents: 595000,
    balanceCents: 23205000,
    invoiceNumber: "0001",
    receiptNumber: "0001",
    creditNoteNumber: "0001",
    relatesToInvoice: "0001",
    relatesToInvoiceDate: now,
    reason: "Sample credit note",
    recordedBy: user.name ?? "",
  };
  const pdf = kind === "receipt" ? await receiptPdfFrom(s) : kind === "credit" ? await creditNotePdf(s) : await invoicePdf(s);
  const word = kind === "receipt" ? "Receipt" : kind === "credit" ? "Credit note" : "Invoice";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Sample ${word}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
