import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { db } from "@/db";
import { installments, payments } from "@/db/schema";
import { buyerReceipt } from "@/lib/receipts";
import { formatAmount, toCents } from "@/lib/money";

/**
 * The receipt the CRM draws up for a payment, as a PDF.
 *
 * Every payment letter carries one, so a buyer always has a paper for their
 * money whether or not somebody in the office remembered to scan one. It says
 * what a receipt has to say and nothing it cannot stand behind: the number, the
 * day, who paid, for which apartment, for which stage, what the stage came to
 * before VAT, the VAT on it, the total, what was received, and where that
 * leaves the contract.
 *
 * The typeface carries Greek as well as Latin, because half the office's
 * buyers have names in Greek and a receipt with empty boxes where the name
 * should be is worse than none. The colours are the brand's own.
 */

const TEAL = rgb(0x4d / 255, 0xa1 / 255, 0xb9 / 255);
const GRAPHITE = rgb(0x4d / 255, 0x4d / 255, 0x4f / 255);
const QUIET = rgb(0x8a / 255, 0x8a / 255, 0x8c / 255);
const LINE = rgb(0xdd / 255, 0xe3 / 255, 0xe6 / 255);

/** Files that ship with the app, found the same way in development and on the server. */
const shipped = (...parts: string[]) => path.join(process.cwd(), ...parts);

async function fonts(pdf: PDFDocument): Promise<{ plain: PDFFont; bold: PDFFont }> {
  pdf.registerFontkit(fontkit);
  const [plainBytes, boldBytes] = await Promise.all([
    readFile(shipped("assets", "fonts", "DejaVuSans.ttf")),
    readFile(shipped("assets", "fonts", "DejaVuSans-Bold.ttf")),
  ]);
  const [plain, bold] = await Promise.all([
    pdf.embedFont(plainBytes, { subset: true }),
    pdf.embedFont(boldBytes, { subset: true }),
  ]);
  return { plain, bold };
}

export type ReceiptPdf = { filename: string; content: Buffer };

/**
 * Draw up the receipt for one payment.
 *
 * Returns null only when the payment does not exist. Anything else that is
 * missing, a stage, a VAT figure, an address, is simply left off the page
 * rather than invented.
 */
export async function receiptPdf(paymentId: string): Promise<ReceiptPdf | null> {
  const receipt = await buyerReceipt(paymentId);
  if (!receipt) return null;

  /* The stage's own figures, when the payment was against one. */
  const [line] = await db
    .select({
      label: installments.label,
      net: installments.netAmount,
      vat: installments.vatAmount,
      total: installments.totalAmount,
      rate: installments.vatRateApplied,
    })
    .from(payments)
    .innerJoin(installments, eq(installments.id, payments.installmentId))
    .where(eq(payments.id, paymentId))
    .limit(1);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${receipt.number}`);
  pdf.setAuthor("One Eleven");
  pdf.setCreator("One Eleven CRM");

  const { plain, bold } = await fonts(pdf);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const left = 56;
  const right = width - 56;
  let y = height - 56;

  const money = (cents: number) => formatAmount(cents, "en");
  const day = (value: Date) =>
    new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  /* The letterhead: the logo on the left, the document's own name on the right. */
  try {
    const logo = await pdf.embedPng(await readFile(shipped("public", "brand", "oneeleven-logo.png")));
    const scale = 64 / logo.height;
    page.drawImage(logo, {
      x: left,
      y: y - 64,
      width: logo.width * scale,
      height: logo.height * scale,
    });
  } catch {
    page.drawText("One Eleven", { x: left, y: y - 28, size: 22, font: bold, color: TEAL });
  }

  const title = "RECEIPT";
  page.drawText(title, {
    x: right - bold.widthOfTextAtSize(title, 20),
    y: y - 22,
    size: 20,
    font: bold,
    color: GRAPHITE,
  });
  const numbered = `No. ${receipt.number}`;
  page.drawText(numbered, {
    x: right - plain.widthOfTextAtSize(numbered, 10),
    y: y - 40,
    size: 10,
    font: plain,
    color: GRAPHITE,
  });
  const dated = day(receipt.paidOn);
  page.drawText(dated, {
    x: right - plain.widthOfTextAtSize(dated, 10),
    y: y - 54,
    size: 10,
    font: plain,
    color: QUIET,
  });

  y -= 96;
  rule(page, left, right, y);
  y -= 26;

  /* Who paid, and for what. */
  const name = receipt.client
    ? `${receipt.client.firstName ?? ""} ${receipt.client.lastName ?? ""}`.trim()
    : "";
  y = pair(page, { plain, bold }, left, y, "Received from", name);
  if (receipt.client?.address) y = pair(page, { plain, bold }, left, y, "Address", receipt.client.address);
  const property = [receipt.project?.name, receipt.unit?.code].filter(Boolean).join(", ");
  if (property) y = pair(page, { plain, bold }, left, y, "Property", property);
  if (receipt.contract?.reference)
    y = pair(page, { plain, bold }, left, y, "Contract", receipt.contract.reference);
  if (receipt.stage) y = pair(page, { plain, bold }, left, y, "Stage", receipt.stage);
  if (receipt.methodInWords) {
    const method = receipt.methodInWords.charAt(0).toUpperCase() + receipt.methodInWords.slice(1);
    y = pair(page, { plain, bold }, left, y, "Paid by", method);
  }

  y -= 10;
  rule(page, left, right, y);
  y -= 24;

  /* The stage in figures, when there is a stage to show. */
  if (line) {
    const rate = Number(line.rate);
    y = figure(page, { plain, bold }, left, right, y, "Stage before VAT", money(toCents(line.net)));
    y = figure(
      page,
      { plain, bold },
      left,
      right,
      y,
      `VAT at ${Number.isInteger(rate) ? rate : rate.toFixed(2)}%`,
      money(toCents(line.vat)),
    );
    y = figure(page, { plain, bold }, left, right, y, "Stage total", money(toCents(line.total)));
    y -= 6;
  }

  /* What was received, said the loudest, because it is the point of the paper. */
  page.drawRectangle({
    x: left,
    y: y - 34,
    width: right - left,
    height: 40,
    color: rgb(0xe8 / 255, 0xf2 / 255, 0xf6 / 255),
  });
  page.drawText("Amount received", { x: left + 12, y: y - 20, size: 12, font: bold, color: GRAPHITE });
  const received = money(receipt.amountCents);
  page.drawText(received, {
    x: right - 12 - bold.widthOfTextAtSize(received, 14),
    y: y - 21,
    size: 14,
    font: bold,
    color: TEAL,
  });
  y -= 64;

  /* Where that leaves the contract. */
  if (receipt.owedCents > 0) {
    y = figure(page, { plain, bold }, left, right, y, "Contract total", money(receipt.owedCents));
    y = figure(page, { plain, bold }, left, right, y, "Received to date", money(receipt.paidCents));
    y = figure(page, { plain, bold }, left, right, y, "Balance", money(receipt.outstandingCents), true);
  }

  /* The foot of the page: who issued it, and that it was the CRM. */
  const foot = `Issued by One Eleven on ${day(new Date())}. Thank you.`;
  page.drawText(foot, { x: left, y: 56, size: 9, font: plain, color: QUIET });

  const bytes = await pdf.save();
  return { filename: `Receipt ${receipt.number}.pdf`, content: Buffer.from(bytes) };
}

function rule(page: PDFPage, from: number, to: number, y: number) {
  page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness: 0.8, color: LINE });
}

/** A label above, its answer beside it: the "who and what" block. */
function pair(
  page: PDFPage,
  f: { plain: PDFFont; bold: PDFFont },
  left: number,
  y: number,
  label: string,
  value: string,
): number {
  page.drawText(label, { x: left, y, size: 9, font: f.plain, color: QUIET });
  page.drawText(value || " ", { x: left + 120, y, size: 11, font: f.bold, color: GRAPHITE });
  return y - 20;
}

/** A line of figures, the label on the left and the amount on the right. */
function figure(
  page: PDFPage,
  f: { plain: PDFFont; bold: PDFFont },
  left: number,
  right: number,
  y: number,
  label: string,
  value: string,
  strong = false,
): number {
  const font = strong ? f.bold : f.plain;
  page.drawText(label, { x: left, y, size: 11, font, color: GRAPHITE });
  page.drawText(value, {
    x: right - font.widthOfTextAtSize(value, 11),
    y,
    size: 11,
    font,
    color: GRAPHITE,
  });
  return y - 20;
}
