import { priceListRows, resolvePriceListToken } from "@/lib/priceList";
import { priceListPdf } from "@/lib/priceListPdf";

/** The price list of a link, as a PDF, while the link is still valid. */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const link = await resolvePriceListToken(token);
  if (!link) return new Response("This price list is no longer valid.", { status: 404 });

  const { rows, focus, gone } = await priceListRows({ projectId: link.projectId, unitId: link.unitId, projectIds: link.projectIds });
  const title =
    focus && !gone
      ? `Apartment ${focus.unit.code}, ${focus.project.name}`
      : link.projectId && rows[0]
        ? `Available apartments, ${rows[0].project.name}`
        : "Available apartments";
  const note = link.note && !link.campaignId && !/^For the campaign\b/.test(link.note) ? link.note : null;
  const pdf = await priceListPdf({ title, rows, expiresAt: link.expiresAt, note });
  const name = `Price list ${new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
