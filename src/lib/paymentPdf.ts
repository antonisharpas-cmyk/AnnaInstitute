import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { amountInEnglish } from "@/lib/words";

/**
 * The invoice and the receipt the CRM issues for a buyer's payment, as PDFs.
 *
 * They follow the office's own printed books, the blue invoice and the yellow
 * receipt, in English only, as the office asked, and carry what a Cyprus invoice has to: the company's name, address, registration
 * and VAT numbers, a running number, the date, the buyer and their address,
 * what was supplied, the amount before VAT, the VAT rate and the VAT, and the
 * total. The receipt says what was received, in figures and in words, how it
 * was paid, which invoice it settles and what is left on the contract.
 *
 * Both are drawn from a snapshot taken on the day of issue, so the paper reads
 * the same in ten years as it did the day it was handed over.
 */

export type IssuedSnapshot = {
  company: {
    name: string;
    registration: string;
    vat: string;
    tic: string;
    address: string;
    phone: string;
    fax: string;
    email: string;
    website: string;
    bankName: string;
    iban: string;
    swift: string;
  };
  client: {
    name: string;
    address: string;
    country: string;
    idNumber: string;
    vatNumber: string;
    email: string;
    phone: string;
  };
  contractReference: string;
  property: string;
  stage: string;
  description: string;
  paidOn: string;
  issuedOn: string;
  method: string;
  reference: string;
  netCents: number;
  vatCents: number;
  totalCents: number;
  rate: number;
  contractTotalCents: number;
  receivedToDateCents: number;
  balanceCents: number;
  invoiceNumber: string;
  receiptNumber: string;
  recordedBy: string;
  /** The VAT in its parts when a stage is partly at the reduced rate. */
  parts?: { rate: number; netCents: number; vatCents: number }[];
  /** A credit from the reduced VAT that settles part of this invoice. */
  creditAppliedCents?: number;
  /** What was paid in money for it, when a credit covered the rest. */
  payableCents?: number;
  /** On a replacement invoice: the invoice and credit note it replaces. */
  replacesNumber?: string;
  replacedByCreditNote?: string;
  /** On a credit note. */
  creditNoteNumber?: string;
  relatesToInvoice?: string;
  relatesToInvoiceDate?: string;
  purpose?: string;
  reason?: string;
};

const TEAL = rgb(0x4d / 255, 0xa1 / 255, 0xb9 / 255);
const TEAL_DARK = rgb(0x3d / 255, 0x83 / 255, 0x97 / 255);
const TEAL_SOFT = rgb(0xe8 / 255, 0xf2 / 255, 0xf6 / 255);
const GRAPHITE = rgb(0x4d / 255, 0x4d / 255, 0x4f / 255);
const QUIET = rgb(0x86 / 255, 0x88 / 255, 0x8b / 255);
const LINE = rgb(0xd9 / 255, 0xe1 / 255, 0xe5 / 255);
const WHITE = rgb(1, 1, 1);

const shipped = (...parts: string[]) => path.join(process.cwd(), ...parts);

type Fonts = { plain: PDFFont; bold: PDFFont };

async function start(title: string): Promise<{ pdf: PDFDocument; page: PDFPage; f: Fonts }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor("One Eleven Investment & Developing Ltd");
  pdf.setCreator("One Eleven CRM");
  pdf.registerFontkit(fontkit);
  const [plainBytes, boldBytes] = await Promise.all([
    readFile(shipped("assets", "fonts", "DejaVuSans.ttf")),
    readFile(shipped("assets", "fonts", "DejaVuSans-Bold.ttf")),
  ]);
  const [plain, bold] = await Promise.all([
    pdf.embedFont(plainBytes, { subset: true }),
    pdf.embedFont(boldBytes, { subset: true }),
  ]);
  const page = pdf.addPage([595.28, 841.89]); // A4
  return { pdf, page, f: { plain, bold } };
}

/** Money the way an invoice prints it: always two decimals. */
export function eur(cents: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(cents) / 100);
}

export function longDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const L = 48;
const R = 595.28 - 48;

function text(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  color: RGB = GRAPHITE,
) {
  page.drawText(value || " ", { x, y, size, font, color });
}

function right(page: PDFPage, font: PDFFont, value: string, xRight: number, y: number, size: number, color: RGB = GRAPHITE) {
  text(page, font, value, xRight - font.widthOfTextAtSize(value || " ", size), y, size, color);
}

/** Cut a line to fit a width, word by word, into as many lines as it needs. */
function wrap(font: PDFFont, value: string, size: number, width: number): string[] {
  const words = (value || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(tryLine, size) <= width) line = tryLine;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** The letterhead both papers share: logo and company on the left, the paper's name on the right. */
async function letterhead(
  pdf: PDFDocument,
  page: PDFPage,
  f: Fonts,
  s: IssuedSnapshot,
  _titleEl: string,
  titleEn: string,
  number: string,
  date: string,
): Promise<number> {
  let y = 841.89 - 48;

  /* A thin brand band across the very top. */
  page.drawRectangle({ x: 0, y: 841.89 - 8, width: 595.28, height: 8, color: TEAL });

  try {
    const logo = await pdf.embedPng(await readFile(shipped("public", "brand", "oneeleven-logo.png")));
    const h = 50;
    page.drawImage(logo, { x: L, y: y - h, width: (logo.width / logo.height) * h, height: h });
  } catch {
    text(page, f.bold, "One Eleven", L, y - 30, 22, TEAL);
  }

  /* The paper's own name, number and date, in a box on the right. */
  const boxW = 230;
  const boxX = R - boxW;
  page.drawRectangle({ x: boxX, y: y - 78, width: boxW, height: 78, color: TEAL_SOFT });
  page.drawRectangle({ x: boxX, y: y - 30, width: boxW, height: 30, color: TEAL_DARK });
  /* English only, as the office asked. The name shrinks to fit the band. */
  const title = titleEn;
  const titleSize = Math.min(12, (boxW - 20) / f.bold.widthOfTextAtSize(title, 1));
  right(page, f.bold, title, R - 10, y - 19, titleSize, WHITE);
  text(page, f.plain, "No.", boxX + 10, y - 48, 8.5, QUIET);
  right(page, f.bold, number, R - 10, y - 49, 13, TEAL_DARK);
  text(page, f.plain, "Date", boxX + 10, y - 67, 8.5, QUIET);
  right(page, f.bold, date, R - 10, y - 67, 10);

  /* The company, as the law asks it to be named, below the logo and the box. */
  y -= 96;
  text(page, f.bold, s.company.name, L, y, 10.5);
  y -= 13;
  for (const line of wrap(f.plain, s.company.address, 8.5, 420)) {
    text(page, f.plain, line, L, y, 8.5, QUIET);
    y -= 11;
  }
  const contact = [
    s.company.phone ? `Tel. ${s.company.phone}` : "",
    s.company.fax ? `Fax ${s.company.fax}` : "",
  ]
    .filter(Boolean)
    .join("   ");
  if (contact) {
    text(page, f.plain, contact, L, y, 8.5, QUIET);
    y -= 11;
  }
  const web = [s.company.email, s.company.website].filter(Boolean).join("   ");
  if (web) {
    text(page, f.plain, web, L, y, 8.5, QUIET);
    y -= 11;
  }
  const ids = [
    s.company.registration ? `Reg. No: ${s.company.registration}` : "",
    s.company.vat ? `VAT No: ${s.company.vat}` : "",
  ].filter(Boolean);
  if (ids.length) {
    text(page, f.bold, ids.join("    "), L, y, 8.5);
    y -= 11;
  }
  if (s.company.tic) {
    text(page, f.plain, `TIC: ${s.company.tic}`, L, y, 8.5, QUIET);
    y -= 11;
  }

  y -= 8;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: LINE });
  return y - 18;
}

/** The foot both papers share. */
function foot(page: PDFPage, f: Fonts, s: IssuedSnapshot, words: string) {
  const y = 44;
  page.drawLine({ start: { x: L, y: y + 16 }, end: { x: R, y: y + 16 }, thickness: 0.8, color: LINE });
  const line = [s.company.name, s.company.registration, s.company.vat ? `VAT ${s.company.vat}` : ""]
    .filter(Boolean)
    .join("  .  ");
  text(page, f.plain, line, L, y, 7.5, QUIET);
  right(page, f.plain, words, R, y, 7.5, QUIET);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 6, color: TEAL });
}

/** A labelled box of lines, used for "Bill to" and "Details". */
function panel(
  page: PDFPage,
  f: Fonts,
  x: number,
  y: number,
  w: number,
  heading: string,
  rows: { label?: string; value: string; strong?: boolean }[],
  labelWidth = 92,
): number {
  text(page, f.bold, heading.toUpperCase(), x, y, 8, TEAL_DARK);
  let yy = y - 16;
  for (const row of rows) {
    if (!row.value) continue;
    if (row.label) {
      text(page, f.plain, row.label, x, yy, 8, QUIET);
      const lines = wrap(row.strong ? f.bold : f.plain, row.value, 9.5, w - labelWidth);
      for (const [i, line] of lines.entries()) {
        text(page, row.strong ? f.bold : f.plain, line, x + labelWidth, yy - i * 12, 9.5);
      }
      yy -= 12 * lines.length + 4;
    } else {
      const lines = wrap(row.strong ? f.bold : f.plain, row.value, row.strong ? 11 : 9.5, w);
      for (const line of lines) {
        text(page, row.strong ? f.bold : f.plain, line, x, yy, row.strong ? 11 : 9.5);
        yy -= row.strong ? 15 : 12;
      }
      yy -= 2;
    }
  }
  return yy;
}

/* ---------------------------------------------------------------------------
   The invoice
   --------------------------------------------------------------------------- */

export async function invoicePdf(s: IssuedSnapshot): Promise<Buffer> {
  return billPdf(s, "invoice");
}

/**
 * A credit note: the same page as the invoice, saying what is credited and why.
 *
 * For the reduced VAT it reverses one invoice in full, naming it; a new invoice
 * at the new VAT is issued beside it. For a refund or a delay penalty it is
 * for the agreed amount, including VAT at the rate the buyer paid.
 */
export async function creditNotePdf(s: IssuedSnapshot): Promise<Buffer> {
  return billPdf(s, "credit");
}

const pc = (rate: number) => `${Number.isInteger(rate) ? rate : rate.toFixed(2)}%`;

async function billPdf(s: IssuedSnapshot, mode: "invoice" | "credit"): Promise<Buffer> {
  const credit = mode === "credit";
  const number = credit ? (s.creditNoteNumber ?? "") : s.invoiceNumber;
  const { pdf, page, f } = await start(`${credit ? "Credit note" : "Invoice"} ${number}`);
  let y = await letterhead(
    pdf,
    page,
    f,
    s,
    "",
    credit ? "CREDIT NOTE" : "INVOICE",
    number,
    longDay(s.issuedOn),
  );
  const sign = credit ? "−" : "";
  const money = (cents: number) => `${sign}${eur(cents)}`;

  /* Who it is to, and what it is about. */
  const half = (R - L - 24) / 2;
  const leftEnd = panel(page, f, L, y, half, "Bill to", [
    { value: s.client.name, strong: true },
    { value: s.client.address },
    { value: s.client.country },
    { label: "ID No", value: s.client.idNumber },
    { label: "VAT No", value: s.client.vatNumber },
    { label: "Email", value: s.client.email },
  ]);
  const details = credit
    ? [
        { label: "Property", value: s.property, strong: true },
        { label: "Contract", value: s.contractReference },
        {
          label: "Invoice",
          value: s.relatesToInvoice
            ? `No. ${s.relatesToInvoice}${s.relatesToInvoiceDate ? ` of ${longDay(s.relatesToInvoiceDate)}` : ""}`
            : "",
        },
        { label: "Reason", value: s.reason ?? "" },
      ]
    : [
        { label: "Property", value: s.property, strong: true },
        { label: "Contract", value: s.contractReference },
        { label: "Supply date", value: longDay(s.paidOn) },
        { label: "Receipt", value: s.receiptNumber ? `No. ${s.receiptNumber}` : "" },
        {
          label: "Replaces",
          value: s.replacesNumber
            ? `Invoice ${s.replacesNumber}${s.replacedByCreditNote ? `, credit note ${s.replacedByCreditNote}` : ""}`
            : "",
        },
      ];
  const rightEnd = panel(page, f, L + half + 24, y, half, "Details", details, 122);
  y = Math.min(leftEnd, rightEnd) - 10;

  /* The line. One stage of the contract, as the books would write it. */
  const parts = s.parts && s.parts.length > 0 ? s.parts : [{ rate: s.rate, netCents: s.netCents, vatCents: s.vatCents }];
  const cols = { desc: L + 10, qty: 300, price: 385, vat: 440, amount: R - 10 };
  page.drawRectangle({ x: L, y: y - 8, width: R - L, height: 24, color: TEAL_DARK });
  text(page, f.bold, "Description", cols.desc, y, 8, WHITE);
  right(page, f.bold, "Qty", cols.qty, y, 8, WHITE);
  right(page, f.bold, "Price", cols.price, y, 8, WHITE);
  right(page, f.bold, "VAT", cols.vat, y, 8, WHITE);
  right(page, f.bold, "Amount", cols.amount, y, 8, WHITE);
  y -= 30;

  const descLines = wrap(f.plain, s.description, 9, 190);
  for (const [i, line] of descLines.entries()) text(page, i === 0 ? f.bold : f.plain, line, cols.desc, y - i * 13, 9);
  right(page, f.plain, "1", cols.qty, y, 9);
  right(page, f.plain, money(s.netCents), cols.price, y, 9);
  right(page, f.plain, parts.map((part) => pc(part.rate)).join(", "), cols.vat, y, 9);
  right(page, f.plain, money(s.netCents), cols.amount, y, 9);
  y -= 13 * descLines.length + 10;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: LINE });

  /* The totals, on the right, the way the book adds them up. */
  y -= 22;
  const tx = R - 280;
  const total = (label: string, value: string, strong = false) => {
    text(page, strong ? f.bold : f.plain, label, tx, y, 9.5);
    right(page, strong ? f.bold : f.plain, value, R - 10, y, 9.5);
    y -= 18;
  };
  total("Amount before VAT", money(s.netCents));
  if (parts.length > 1) {
    /* Part at the reduced rate and part at the standard rate, each said. */
    for (const part of parts) total(`VAT ${pc(part.rate)} on ${eur(part.netCents)}`, money(part.vatCents));
  } else {
    total(`VAT ${pc(parts[0].rate)}`, money(s.vatCents));
  }
  page.drawRectangle({ x: tx - 10, y: y - 10, width: R - tx + 10, height: 28, color: TEAL_SOFT });
  text(page, f.bold, credit ? "Total credited" : "Total", tx, y, credit ? 9.5 : 10.5, TEAL_DARK);
  right(page, f.bold, money(s.totalCents), R - 10, y, 12, TEAL_DARK);
  y -= 30;

  /* A credit from the reduced VAT that settled part of it. */
  if (!credit && s.creditAppliedCents) {
    total("Less credit (reduced VAT)", `−${eur(s.creditAppliedCents)}`);
    total("Paid", eur(s.payableCents ?? 0), true);
    y -= 4;
  }

  if (!credit) {
    /* Settled on the day, since it is issued with the money in hand. */
    const settled =
      s.payableCents === 0 && s.creditAppliedCents
        ? `SETTLED BY CREDIT ${longDay(s.issuedOn)}`
        : `PAID ${longDay(s.paidOn)}${s.receiptNumber ? `, receipt ${s.receiptNumber}` : ""}`;
    const w = f.bold.widthOfTextAtSize(settled, 8.5) + 16;
    page.drawRectangle({ x: L, y: y - 6, width: w, height: 24, borderColor: TEAL, borderWidth: 1 });
    text(page, f.bold, settled, L + 8, y + 2, 8.5, TEAL_DARK);
    y -= 34;
  }

  text(page, f.plain, amountInEnglish(s.totalCents), L, y, 8.5, QUIET);
  y -= 22;

  /* Where to pay the next stage, when the bank details are set. */
  if (!credit && s.company.iban) {
    text(page, f.bold, "BANK DETAILS", L, y, 8, TEAL_DARK);
    y -= 14;
    for (const [label, value] of [
      ["Bank", s.company.bankName],
      ["IBAN", s.company.iban],
      ["SWIFT / BIC", s.company.swift],
      ["Beneficiary", s.company.name],
    ]) {
      if (!value) continue;
      text(page, f.plain, label, L, y, 8.5, QUIET);
      text(page, f.plain, value, L + 80, y, 8.5);
      y -= 12;
    }
  }

  foot(page, f, s, `${credit ? "Credit note" : "Invoice"} ${number}`);
  return Buffer.from(await pdf.save());
}

/**
 * The same invoice with CANCELLED stamped across it.
 *
 * The original stays as it was issued; this is a copy with the stamp, the
 * credit note that cancelled it and the invoice that replaced it, which is
 * what the buyer is given so their own file matches ours.
 */
export async function stampCancelled(original: Buffer, lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.load(original);
  pdf.registerFontkit(fontkit);
  const bold = await pdf.embedFont(await readFile(shipped("assets", "fonts", "DejaVuSans-Bold.ttf")), { subset: true });
  const plain = await pdf.embedFont(await readFile(shipped("assets", "fonts", "DejaVuSans.ttf")), { subset: true });
  const RED = rgb(0xc0 / 255, 0x2b / 255, 0x2b / 255);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const title = "CANCELLED";
    const size = 30;
    const w = bold.widthOfTextAtSize(title, size);
    const boxW = Math.max(w, ...lines.map((line) => plain.widthOfTextAtSize(line, 12))) + 48;
    const boxH = 60 + lines.length * 18;
    const x = (width - boxW) / 2;
    /* In the open space below the totals, so the line it cancels stays readable. */
    const y = height * 0.3;
    /* Straight across the middle, like a rubber stamp on the printed page:
       a white panel so it reads over anything, a double red frame, the word. */
    page.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawRectangle({ x, y, width: boxW, height: boxH, borderColor: RED, borderWidth: 3 });
    page.drawRectangle({ x: x + 6, y: y + 6, width: boxW - 12, height: boxH - 12, borderColor: RED, borderWidth: 1 });
    page.drawText(title, { x: x + (boxW - w) / 2, y: y + boxH - 44, size, font: bold, color: RED });
    lines.forEach((line, i) => {
      const lw = plain.widthOfTextAtSize(line, 12);
      page.drawText(line, { x: x + (boxW - lw) / 2, y: y + boxH - 66 - i * 18, size: 12, font: plain, color: RED });
    });
  }
  return Buffer.from(await pdf.save());
}

/**
 * The paper a buyer signs when money is paid back to them.
 *
 * What was paid, why, against which property and contract, that the price in
 * the Contract of Sale is unchanged, and, for a goodwill refund with the
 * reservation cancelled, that the reservation is cancelled. With a place for
 * both signatures.
 */
export async function acknowledgementPdf(
  s: IssuedSnapshot,
  refund: { purpose: "REFUND" | "PENALTY"; amountCents: number; paidOn: string; method: string; reference: string; cancelled: boolean; note: string },
): Promise<Buffer> {
  const { pdf, page, f } = await start("Refund acknowledgement");
  let y = await letterhead(
    pdf,
    page,
    f,
    s,
    "",
    "ACKNOWLEDGEMENT",
    s.creditNoteNumber ? `CN ${s.creditNoteNumber}` : "",
    longDay(refund.paidOn),
  );
  const para = (value: string, size = 10, font = f.plain) => {
    for (const line of wrap(font, value, size, R - L)) {
      text(page, font, line, L, y, size);
      y -= size + 5;
    }
    y -= 8;
  };
  const amount = eur(refund.amountCents);
  const how = refund.method ? ` by ${({ CASH: "cash", CHEQUE: "cheque", BANK: "bank transfer", CARD: "card" } as Record<string, string>)[refund.method] ?? refund.method.toLowerCase()}${refund.reference ? ` (${refund.reference})` : ""}` : "";

  para(`I, ${s.client.name}${s.client.idNumber ? `, ID ${s.client.idNumber}` : ""}, confirm that I have received from ${s.company.name} the sum of ${amount} (${amountInEnglish(refund.amountCents).toLowerCase()})${how} on ${longDay(refund.paidOn)}.`, 10.5, f.bold);
  if (refund.purpose === "PENALTY") {
    para(`The amount is paid to me as the agreed compensation for the delay in the completion of the property ${s.property}, under contract ${s.contractReference}. It is covered by credit note ${s.creditNoteNumber}. The price in the Contract of Sale and its terms are unchanged.`);
  } else {
    para(`The amount is paid to me as a refund agreed as a matter of goodwill, for the property ${s.property} under contract ${s.contractReference}. It is covered by credit note ${s.creditNoteNumber}.${refund.cancelled ? " I confirm that my reservation of this property is cancelled." : ""}`);
  }
  if (refund.note) para(refund.note, 9.5);

  /* The two signatures. */
  y -= 40;
  const sig = (x: number, en: string, name: string) => {
    page.drawLine({ start: { x, y }, end: { x: x + 210, y }, thickness: 0.8, color: GRAPHITE });
    text(page, f.plain, en, x, y - 13, 8, QUIET);
    text(page, f.bold, name, x, y - 26, 9);
    text(page, f.plain, "Date: ____________", x, y - 44, 8.5, QUIET);
  };
  sig(L, "The client", s.client.name);
  sig(R - 210, "For the company", s.company.name);

  foot(page, f, s, "Refund acknowledgement");
  return Buffer.from(await pdf.save());
}

/* ---------------------------------------------------------------------------
   The receipt
   --------------------------------------------------------------------------- */

const METHOD_WORDS: Record<string, string> = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  BANK: "Bank transfer",
  CARD: "Card",
  OTHER: "Other",
};

export async function receiptPdfFrom(s: IssuedSnapshot): Promise<Buffer> {
  const { pdf, page, f } = await start(`Receipt ${s.receiptNumber}`);
  let y = await letterhead(pdf, page, f, s, "", "RECEIPT", s.receiptNumber, longDay(s.paidOn));

  const row = (label: string, value: string, strong = false) => {
    if (!value) return;
    text(page, f.plain, label, L, y - 3, 8, QUIET);
    const lines = wrap(strong ? f.bold : f.plain, value, 10.5, R - L - 140);
    for (const [i, line] of lines.entries()) text(page, strong ? f.bold : f.plain, line, L + 140, y - 3 - i * 14, 10.5);
    const used = Math.max(20, lines.length * 14 + 6);
    page.drawLine({ start: { x: L + 140, y: y - used + 4 }, end: { x: R, y: y - used + 4 }, thickness: 0.5, color: LINE });
    y -= used + 10;
  };

  row("Received from", s.client.name, true);
  if (s.client.address) row("Address", [s.client.address, s.client.country].filter(Boolean).join(", "));

  /*
   * The sum, in words and in figures, as the book asks. The words wrap in the
   * space left of the figure box, so the box never sits on top of them.
   */
  text(page, f.plain, "The sum of Euro", L, y - 3, 8, QUIET);
  const boxW = 130;
  const wordsWidth = R - boxW - 14 - (L + 140);
  const words = wrap(f.bold, amountInEnglish(s.totalCents), 10, wordsWidth);
  for (const [i, line] of words.entries()) text(page, f.bold, line, L + 140, y - 3 - i * 13, 10);
  page.drawRectangle({ x: R - boxW, y: y - 26, width: boxW, height: 34, color: TEAL_SOFT, borderColor: TEAL, borderWidth: 1 });
  right(page, f.bold, eur(s.totalCents), R - 10, y - 14, 15, TEAL_DARK);
  y -= Math.max(40, words.length * 13 + 12) + 8;

  row("For", s.description);
  row("Invoice", s.invoiceNumber ? `No. ${s.invoiceNumber}` : "");

  /* How it was paid: the book's boxes, with the one that applies ticked. */
  text(page, f.plain, "Paid by", L, y - 3, 8, QUIET);
  let bx = L + 140;
  const widths: Record<string, number> = { CASH: 72, CHEQUE: 80, BANK: 118, CARD: 60 };
  for (const key of ["CASH", "CHEQUE", "BANK", "CARD"]) {
    const en = METHOD_WORDS[key];
    const on = s.method === key;
    page.drawRectangle({ x: bx, y: y - 7, width: 10, height: 10, borderColor: on ? TEAL_DARK : QUIET, borderWidth: 1, color: on ? TEAL_DARK : undefined });
    if (on) {
      page.drawLine({ start: { x: bx + 2, y: y - 2 }, end: { x: bx + 4.5, y: y - 5 }, thickness: 1.4, color: WHITE });
      page.drawLine({ start: { x: bx + 4.5, y: y - 5 }, end: { x: bx + 8.5, y: y + 1.5 }, thickness: 1.4, color: WHITE });
    }
    text(page, on ? f.bold : f.plain, en, bx + 14, y - 5, 8.5);
    bx += widths[key];
  }
  y -= 28;

  if (s.vatCents > 0) {
    text(page, f.plain, `Includes VAT of ${eur(s.vatCents)} at ${Number.isInteger(s.rate) ? s.rate : s.rate.toFixed(2)}%.`, L + 140, y, 8, QUIET);
    y -= 22;
  }

  /* Where the contract stands after this money. */
  if (s.contractTotalCents > 0) {
    page.drawRectangle({ x: L, y: y - 58, width: R - L, height: 70, color: TEAL_SOFT });
    const cell = (x: number, en: string, value: string, strong = false) => {
      text(page, f.plain, en, x, y - 8, 8, QUIET);
      text(page, strong ? f.bold : f.bold, value, x, y - 30, strong ? 14 : 12, strong ? TEAL_DARK : GRAPHITE);
    };
    const w3 = (R - L - 24) / 3;
    cell(L + 12, "Contract total", eur(s.contractTotalCents));
    cell(L + 12 + w3, "Received to date", eur(s.receivedToDateCents));
    cell(L + 12 + 2 * w3, "Balance", eur(s.balanceCents), true);
    y -= 90;
  }

  /* The person who took the money, and a place for a signature. */
  y -= 20;
  page.drawLine({ start: { x: R - 200, y }, end: { x: R, y }, thickness: 0.8, color: GRAPHITE });
  right(page, f.plain, "The recipient", R, y - 12, 8, QUIET);
  if (s.recordedBy) right(page, f.bold, s.recordedBy, R, y - 24, 9);
  text(page, f.plain, "Date", L, y - 12, 8, QUIET);
  text(page, f.bold, longDay(s.paidOn), L, y - 24, 9);

  foot(page, f, s, `Receipt ${s.receiptNumber}`);
  return Buffer.from(await pdf.save());
}
