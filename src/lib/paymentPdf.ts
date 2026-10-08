import "server-only";
import { baseOf, isCustom } from "@/lib/choices/lists";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { amountInEnglish } from "@/lib/words";
import { resolveStored } from "@/lib/storage";

/**
 * The invoice and the receipt the CRM issues for a buyer's payment, as PDFs.
 *
 * They follow the office's own printed books, the blue invoice and the yellow
 * receipt, in English only, as the office asked, and carry what a Cyprus
 * invoice has to: the issuing company's name, address, registration
 * and VAT numbers, a running number, the date, the buyer and their address,
 * what was supplied, the amount before VAT, the VAT rate and the VAT, and the
 * total. The receipt says what was received, in figures and in words, how it
 * was paid, which invoice it settles and what is left on the contract.
 *
 * Each is drawn in the name of the company that issued it, the one that holds
 * the development, with that company's logo, colour and bank, and One
 * Eleven's own letterhead from its brand guideline otherwise. The page is used
 * top to bottom: the paper's figures at the top, and the bank details, the
 * words and the signatures kept to the foot of the page above the letterhead's
 * own contact bar.
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
    /** Empty for One Eleven, the company's id otherwise. Older papers have none. */
    issuerId?: string;
    mobile?: string;
    beneficiary?: string;
    bankAccount?: string;
    /** "public:..." for a shipped logo, or a stored upload's path. */
    logo?: string;
    /** The colour the paper is drawn in. */
    color?: string;
  };
  client: {
    name: string;
    address: string;
    country: string;
    idNumber: string;
    vatNumber: string;
    email: string;
    phone: string;
    /** A company's registration number, when the invoice is to a company. */
    registration?: string;
  };
  contractReference: string;
  property: string;
  stage: string;
  description: string;
  paidOn: string;
  issuedOn: string;
  method: string;
  /** The office's own name for the method, from the Builder, when it has one. */
  methodName?: string;
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
  /** An invoice issued for a stage before the money, sent with the Reservation or the Contract of Sale. */
  advance?: boolean;
  /** What the stamp of such an invoice says: due on signing, or due on receipt for a stage of the building. */
  dueWords?: string;
  /**
   * A receipt for one part of a stage paid in parts: the invoice for the
   * whole stage it is against, what has come in on it so far and what remains.
   */
  /** An invoice with several lines: one development each, for instance. */
  lines?: { description: string; netCents: number; vatCents: number; rate?: number }[];
  againstInvoice?: {
    number: string;
    totalCents: number;
    paidCents: number;
    remainingCents: number;
    part?: number;
    parts?: number;
  };
  /** On a replacement invoice: the invoice and credit note it replaces. */
  replacesNumber?: string;
  replacedByCreditNote?: string;
  /** On a credit note. */
  creditNoteNumber?: string;
  relatesToInvoice?: string;
  relatesToInvoiceDate?: string;
  purpose?: string;
  reason?: string;
  /**
   * An invoice One Eleven issues to a partner company, management fees and the
   * like. It is issued before it is paid, so it says when it is due rather
   * than that it was paid, and it carries the bank details.
   */
  billTo?: "partner";
  dueOn?: string;
};

const GRAPHITE = rgb(0x4d / 255, 0x4d / 255, 0x4f / 255);
const QUIET = rgb(0x80 / 255, 0x82 / 255, 0x86 / 255);
const LINE = rgb(0xd9 / 255, 0xe1 / 255, 0xe5 / 255);
const WHITE = rgb(1, 1, 1);

/** One Eleven's teal dark, for papers from before each company had its own colour. */
const DEFAULT_ACCENT = "#3D8397";

const shipped = (...parts: string[]) => path.join(process.cwd(), ...parts);

const W = 595.28;
const H = 841.89;
const L = 50;
const R = W - 50;
/** Where the letterhead's foot starts: nothing is drawn below it. */
const FOOT_TOP = 92;

type Fonts = { plain: PDFFont; bold: PDFFont };

/** Everything a paper is drawn with: the page, the fonts and the issuer's colours. */
type Sheet = {
  pdf: PDFDocument;
  page: PDFPage;
  f: Fonts;
  accent: RGB;
  soft: RGB;
  line: RGB;
};

function hexToRgb(hex: string | undefined): { r: number; g: number; b: number } {
  const v = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim())?.[1] ?? DEFAULT_ACCENT.slice(1);
  return { r: parseInt(v.slice(0, 2), 16) / 255, g: parseInt(v.slice(2, 4), 16) / 255, b: parseInt(v.slice(4, 6), 16) / 255 };
}

/** The colour, and a pale wash of it for panels. */
function palette(hex: string | undefined) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number, k: number) => c + (1 - c) * k;
  return {
    accent: rgb(r, g, b),
    soft: rgb(mix(r, 0.9), mix(g, 0.9), mix(b, 0.9)),
    line: rgb(mix(r, 0.72), mix(g, 0.72), mix(b, 0.72)),
  };
}

async function start(title: string, s: IssuedSnapshot): Promise<Sheet> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor(s.company.name || "One Eleven Investment and Developing Ltd");
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
  const page = pdf.addPage([W, H]); // A4
  return { pdf, page, f: { plain, bold }, ...palette(s.company.color) };
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

/**
 * Every word on the papers is drawn a touch smaller than the size asked, the
 * office's wish, by this one factor, so the proportions between headings,
 * figures and small print stay as they were.
 */
const SCALE = 0.93;

function text(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  color: RGB = GRAPHITE,
) {
  page.drawText(value || " ", { x, y, size: size * SCALE, font, color });
}

function right(page: PDFPage, font: PDFFont, value: string, xRight: number, y: number, size: number, color: RGB = GRAPHITE) {
  text(page, font, value, xRight - font.widthOfTextAtSize(value || " ", size * SCALE), y, size, color);
}

/** The largest size, up to the one wanted, at which a value fits a width. */
function fit(font: PDFFont, value: string, size: number, width: number): number {
  const at1 = font.widthOfTextAtSize(value || " ", 1);
  return Math.max(6, Math.min(size, width / at1));
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

/*
 * A box with a figure in it.
 *
 * The figure's baseline is placed from the box's own height and the font's
 * real height at that size, so the top of the digits is never cut by the box
 * or by the line above it, which is what the office saw on the old papers.
 */
function figureBox(
  sh: Sheet,
  box: { x: number; top: number; w: number; h: number; fill?: RGB; border?: RGB },
  label: string | null,
  value: string,
  size: number,
  color: RGB,
) {
  const { page, f } = sh;
  page.drawRectangle({
    x: box.x,
    y: box.top - box.h,
    width: box.w,
    height: box.h,
    color: box.fill,
    borderColor: box.border,
    borderWidth: box.border ? 1 : 0,
  });
  const valueSize = fit(f.bold, value, size, box.w - 24);
  const cap = f.bold.heightAtSize(valueSize, { descender: false });
  if (label) {
    text(page, f.plain, label, box.x + 12, box.top - 16, 8, QUIET);
    /* Below the label, centred in what is left. */
    const room = box.h - 22;
    right(page, f.bold, value, box.x + box.w - 12, box.top - 22 - (room + cap) / 2 + 2, valueSize, color);
  } else {
    right(page, f.bold, value, box.x + box.w - 12, box.top - (box.h + cap) / 2 - 1 + cap * 0.08, valueSize, color);
  }
}

/** The issuer's logo: shipped with the app, or uploaded on the company's page. */
export async function logoBytes(s: Pick<IssuedSnapshot, "company">): Promise<Buffer | null> {
  const ref = s.company.logo || (s.company.issuerId ? "" : "public:brand/oneeleven-logo.png");
  if (!ref) return null;
  try {
    if (ref.startsWith("public:")) {
      const rel = ref.slice("public:".length).split("/").filter((part) => part && part !== "..");
      return await readFile(shipped("public", ...rel));
    }
    return await readFile(resolveStored(ref));
  } catch {
    return null;
  }
}

async function drawLogo(sh: Sheet, s: IssuedSnapshot, x: number, top: number, maxW: number, maxH: number): Promise<number> {
  const bytes = await logoBytes(s);
  if (bytes) {
    try {
      const png = bytes[0] === 0x89 && bytes[1] === 0x50;
      const image = png ? await sh.pdf.embedPng(bytes) : await sh.pdf.embedJpg(bytes);
      const scale = Math.min(maxW / image.width, maxH / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      sh.page.drawImage(image, { x, y: top - h, width: w, height: h });
      return h;
    } catch {
      /* A logo that will not draw leaves the name in its place. */
    }
  }
  /* No logo: nothing here, the name under it says who it is, and once is enough. */
  return 0;
}

/**
 * The letterhead every paper shares: the issuer's logo and its details on the
 * left, the paper's name, number and date in a box on the right.
 */
async function letterhead(
  sh: Sheet,
  s: IssuedSnapshot,
  titleEn: string,
  number: string,
  date: string,
): Promise<number> {
  const { page, f } = sh;
  /* A band of the issuer's colour across the very top. */
  page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: sh.accent });

  const top = H - 44;
  const logoH = await drawLogo(sh, s, L, top, 210, 70);

  /* The paper's own name, number and date. Each row is tall enough for its figure. */
  const boxW = 220;
  const boxX = R - boxW;
  const band = 36;
  const rowH = 32;
  page.drawRectangle({ x: boxX, y: top - band, width: boxW, height: band, color: sh.accent });
  const titleSize = fit(f.bold, titleEn, 15, boxW - 28);
  right(page, f.bold, titleEn, R - 14, top - band / 2 - titleSize * 0.36, titleSize, WHITE);
  page.drawRectangle({ x: boxX, y: top - band - rowH * 2, width: boxW, height: rowH * 2, color: sh.soft });
  const numberSize = fit(f.bold, number || " ", 16, boxW - 80);
  const row1 = top - band;
  text(page, f.plain, "No.", boxX + 14, row1 - rowH / 2 - 3, 9, QUIET);
  right(page, f.bold, number, R - 14, row1 - rowH / 2 - numberSize * 0.36, numberSize, sh.accent);
  page.drawLine({ start: { x: boxX + 10, y: row1 - rowH }, end: { x: R - 10, y: row1 - rowH }, thickness: 0.6, color: sh.line });
  text(page, f.plain, "Date", boxX + 14, row1 - rowH - rowH / 2 - 3, 9, QUIET);
  right(page, f.bold, date, R - 14, row1 - rowH - rowH / 2 - 4, 11);
  const boxBottom = top - band - rowH * 2;

  /* The issuer, as the law asks it to be named, under the logo. */
  let y = top - logoH - (logoH ? 22 : 12);
  const width = boxX - L - 16;
  const nameSize = fit(f.bold, s.company.name, 11.5, width);
  text(page, f.bold, s.company.name, L, y, nameSize);
  y -= 15;
  /* Beside the box the lines are narrower; below it they have the page's width. */
  const say = (value: string, font = f.plain, color = QUIET) => {
    if (!value) return;
    const room = () => (y > boxBottom - 4 ? width : R - L);
    let rest = value.replace(/\s+/g, " ").trim();
    while (rest) {
      const [line] = wrap(font, rest, 8.8, room());
      text(page, font, line, L, y, 8.8, color);
      y -= 12.5;
      rest = rest.slice(rest.indexOf(line) + line.length).trim();
    }
  };
  say(s.company.address);
  say(
    [
      s.company.phone ? `Tel. ${s.company.phone}` : "",
      s.company.mobile ? `Mob. ${s.company.mobile}` : "",
      s.company.fax ? `Fax ${s.company.fax}` : "",
    ]
      .filter(Boolean)
      .join("    "),
  );
  say([s.company.email, s.company.website].filter(Boolean).join("    "));
  say(
    [
      s.company.registration ? `Reg. No: ${s.company.registration}` : "",
      s.company.vat ? `VAT No: ${s.company.vat}` : "",
      s.company.tic ? `TIC: ${s.company.tic}` : "",
    ]
      .filter(Boolean)
      .join("    "),
    f.bold,
    GRAPHITE,
  );

  y = Math.min(y, boxBottom) - 12;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: LINE });
  return y - 26;
}

/**
 * The foot of the letterhead, from the brand guideline: the name over a line
 * of the issuer's colour and the website in a tab of that colour at the right,
 * with the paper's own name and number under the line.
 *
 * The address and the numbers are not repeated here: they are at the top,
 * under the logo. And nothing is drawn in the last 40 points of the page, so
 * a printer that keeps a margin on an A4 sheet never cuts a word off.
 */
function foot(sh: Sheet, s: IssuedSnapshot, words: string) {
  const { page, f } = sh;
  const lineY = 58;
  const web = (s.company.website || s.company.email || "").replace(/^https?:\/\//, "");
  const tabW = web ? Math.min(230, f.bold.widthOfTextAtSize(web, 8) + 40) : 0;
  if (web) {
    page.drawRectangle({ x: R - tabW, y: lineY, width: tabW, height: 18, color: sh.accent });
    const tracked = web.split("").join(" ");
    const size = fit(f.plain, tracked, 8, (tabW - 16) / SCALE);
    text(page, f.plain, tracked, R - tabW + (tabW - f.plain.widthOfTextAtSize(tracked, size * SCALE)) / 2, lineY + 5.5, size, WHITE);
  }
  page.drawRectangle({ x: L, y: lineY - 1.2, width: R - L, height: 2.4, color: sh.accent });
  const nameSize = fit(f.bold, s.company.name, 8.5, R - L - tabW - 12);
  text(page, f.bold, s.company.name, L, lineY + 5.5, nameSize, sh.accent);
  right(page, f.plain, words, R, lineY - 14, 7.4, QUIET);
}

/** A labelled block of lines, used for "Bill to" and "Details". */
function panel(
  sh: Sheet,
  x: number,
  y: number,
  w: number,
  heading: string,
  rows: { label?: string; value: string; strong?: boolean }[],
  labelWidth = 92,
): number {
  const { page, f } = sh;
  text(page, f.bold, heading.toUpperCase(), x, y, 8.5, sh.accent);
  page.drawLine({ start: { x, y: y - 5 }, end: { x: x + w, y: y - 5 }, thickness: 0.6, color: sh.line });
  let yy = y - 19;
  for (const row of rows) {
    if (!row.value) continue;
    if (row.label) {
      text(page, f.plain, row.label, x, yy, 8.5, QUIET);
      const lines = wrap(row.strong ? f.bold : f.plain, row.value, 9.5 * SCALE, w - labelWidth);
      for (const [i, line] of lines.entries()) {
        text(page, row.strong ? f.bold : f.plain, line, x + labelWidth, yy - i * 12, 9.5);
      }
      yy -= 12 * lines.length + 3;
    } else {
      const lines = wrap(row.strong ? f.bold : f.plain, row.value, (row.strong ? 11 : 9.5) * SCALE, w);
      for (const line of lines) {
        text(page, row.strong ? f.bold : f.plain, line, x, yy, row.strong ? 11 : 9.5);
        yy -= row.strong ? 15 : 12;
      }
      yy -= 2;
    }
  }
  return yy;
}

/** The bank details, in a panel of their own. */
function bankPanel(sh: Sheet, s: IssuedSnapshot, x: number, top: number, w: number): number {
  const { page, f } = sh;
  const rows = [
    ["Bank", s.company.bankName],
    ["Beneficiary", s.company.beneficiary || s.company.name],
    ["Account No", s.company.bankAccount ?? ""],
    ["IBAN", s.company.iban],
    ["SWIFT / BIC", s.company.swift],
  ].filter(([, value]) => value) as [string, string][];
  const h = 26 + rows.length * 13;
  page.drawRectangle({ x, y: top - h, width: w, height: h, color: sh.soft });
  text(page, f.bold, "BANK DETAILS", x + 14, top - 16, 8.5, sh.accent);
  let y = top - 31;
  for (const [label, value] of rows) {
    text(page, f.plain, label, x + 14, y, 8.5, QUIET);
    text(page, f.bold, value, x + 90, y, fit(f.bold, value, 9, (w - 102) / SCALE));
    y -= 13;
  }
  return h;
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
  const sh = await start(`${credit ? "Credit note" : "Invoice"} ${number}`, s);
  const { f } = sh;
  let page = sh.page;
  let y = await letterhead(sh, s, credit ? "CREDIT NOTE" : "INVOICE", number, longDay(s.issuedOn));
  const paperWords = `${credit ? "Credit note" : "Invoice"} ${number}`;
  /*
   * A long invoice carries on onto a second page rather than running into the
   * foot: the first page is closed with its foot, and the next one starts at
   * the top with the column heads again.
   */
  const nextPage = (withHeads: boolean) => {
    foot(sh, s, `${paperWords}, page ${sh.pdf.getPageCount()}`);
    page = sh.pdf.addPage([W, H]);
    sh.page = page;
    page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: sh.accent });
    y = H - 60;
    if (withHeads) heads();
  };
  const sign = credit ? "−" : "";
  const money = (cents: number) => `${sign}${eur(cents)}`;

  /* Who it is to, and what it is about. */
  const half = (R - L - 30) / 2;
  /* Who it is to, in as few lines as it takes: the address on one line, the numbers on one, how to reach them on one. */
  const leftEnd = panel(sh, L, y, half, "Bill to", [
    { value: s.client.name, strong: true },
    { value: [s.client.address, s.client.country].map((one) => (one ?? "").trim()).filter((one, i, all) => one && !all.slice(0, i).some((before) => before.includes(one))).join(", ") },
    {
      value: [
        s.client.idNumber ? `ID ${s.client.idNumber}` : "",
        s.client.registration ? `Reg. ${s.client.registration}` : "",
        s.client.vatNumber ? `VAT ${s.client.vatNumber}` : "",
      ]
        .filter(Boolean)
        .join("    "),
    },
    { value: [s.client.email, s.client.phone].filter(Boolean).join("    ") },
  ], 64);
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
    : s.billTo === "partner"
      ? [
          /* The invoice date is at the top already; the due date is said only when there is one. */
          { label: "Development", value: s.property, strong: true },
          { label: "Due date", value: s.dueOn ? longDay(s.dueOn) : "" },
        ]
      : [
          { label: "Property", value: s.property, strong: true },
          { label: "Contract", value: s.contractReference },
          /* The supply date only when it is not the invoice's own date, and the receipt is in the stamp below. */
          { label: "Supply date", value: s.advance || longDay(s.paidOn) === longDay(s.issuedOn) ? "" : longDay(s.paidOn) },
          {
            label: "Replaces",
            value: s.replacesNumber
              ? `Invoice ${s.replacesNumber}${s.replacedByCreditNote ? `, credit note ${s.replacedByCreditNote}` : ""}`
              : "",
          },
        ];
  /* With nothing to say, the Details heading is left out too. */
  const rightEnd = details.some((one) => one.value) ? panel(sh, L + half + 30, y, half, "Details", details, 78) : y;
  y = Math.min(leftEnd, rightEnd) - 14;

  /* The line. One stage of the contract, as the books would write it. */
  const parts = s.parts && s.parts.length > 0 ? s.parts : [{ rate: s.rate, netCents: s.netCents, vatCents: s.vatCents }];
  const cols = { desc: L + 12, qty: 318, price: 405, vat: 455, amount: R - 12 };
  const headH = 26;
  function heads() {
    page.drawRectangle({ x: L, y: y - headH, width: R - L, height: headH, color: sh.accent });
    const headY = y - headH / 2 - 3;
    text(page, f.bold, "Description", cols.desc, headY, 8.5, WHITE);
    right(page, f.bold, "Qty", cols.qty, headY, 8.5, WHITE);
    right(page, f.bold, "Price", cols.price, headY, 8.5, WHITE);
    right(page, f.bold, "VAT", cols.vat, headY, 8.5, WHITE);
    right(page, f.bold, "Amount", cols.amount, headY, 8.5, WHITE);
    y -= headH + 20;
  }
  heads();

  /* One line, or a line for each part of it: each development of a fee, say. */
  const rows = s.lines && s.lines.length > 0 ? s.lines : [{ description: s.description, netCents: s.netCents, vatCents: s.vatCents }];
  /* A word above the lines only when it says more than the lines' own categories. */
  if (s.lines && s.lines.length > 0 && s.description && s.description !== rows[0].description && s.description !== s.stage) {
    for (const line of wrap(f.plain, s.description, 9.5, R - L - 24)) {
      text(page, f.plain, line, cols.desc, y, 9.5, QUIET);
      y -= 14;
    }
    y -= 4;
  }
  for (const [n, row] of rows.entries()) {
    const descLines = wrap(f.plain, row.description, 9.5, cols.qty - cols.desc - 40);
    if (y - 14 * descLines.length < FOOT_TOP + 20) nextPage(true);
    for (const [i, line] of descLines.entries()) text(page, i === 0 ? f.bold : f.plain, line, cols.desc, y - i * 14, 9.5);
    right(page, f.plain, "1", cols.qty, y, 9.5);
    right(page, f.plain, money(row.netCents), cols.price, y, 9.5);
    right(page, f.plain, "rate" in row && typeof row.rate === "number" ? pc(row.rate) : parts.map((part) => pc(part.rate)).join(", "), cols.vat, y, 9.5);
    right(page, f.plain, money(row.netCents), cols.amount, y, 9.5);
    y -= 14 * (descLines.length - 1) + 18;
    if (n < rows.length - 1) {
      page.drawLine({ start: { x: L, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 0.4, color: LINE });
      y -= 8;
    }
  }
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.8, color: LINE });

  /* The totals, the stamp, the bank and the signature need about this much; otherwise they start a page of their own. */
  const bankRows = [s.company.bankName, s.company.beneficiary || s.company.name, s.company.bankAccount, s.company.iban, s.company.swift].filter(Boolean).length;
  const after = 24 + (s.parts && s.parts.length > 1 ? s.parts.length + 1 : 2) * 20 + (s.creditAppliedCents ? 40 : 0) + 46 + 30 + Math.max(credit ? 0 : 26 + bankRows * 13, 80);
  if (y - after < FOOT_TOP + 16) nextPage(false);

  /* The totals, on the right, the way the book adds them up. */
  y -= 24;
  const tx = R - 270;
  /* The lines that add up to it, quiet; the amount to pay, alone in its box, the boldest thing on the page. */
  const total = (label: string, value: string) => {
    text(page, f.plain, label, tx, y, 9.5, QUIET);
    right(page, f.plain, value, R - 12, y, 9.5);
    y -= 20;
  };
  total("Amount before VAT", money(s.netCents));
  if (parts.length > 1) {
    /* Part at the reduced rate and part at the standard rate, each said. */
    for (const part of parts) total(`VAT ${pc(part.rate)} on ${eur(part.netCents)}`, money(part.vatCents));
  } else {
    total(`VAT ${pc(parts[0].rate)}`, money(s.vatCents));
  }
  /*
   * The figure in a box of its own, clear of the line above it. With a credit
   * from the reduced VAT set against it, the box holds what is left to pay,
   * because that is the figure the client acts on; the full total and the
   * credit are the lines above it.
   */
  const withCredit = !credit && Boolean(s.creditAppliedCents);
  if (withCredit) {
    total("Total", money(s.totalCents));
    total("Less credit (reduced VAT)", `−${eur(s.creditAppliedCents ?? 0)}`);
  }
  const totalTop = y + 8;
  const totalH = 46;
  page.drawRectangle({ x: tx - 12, y: totalTop - totalH, width: R - tx + 12, height: totalH, color: sh.soft });
  page.drawRectangle({ x: tx - 12, y: totalTop - totalH, width: 3, height: totalH, color: sh.accent });
  const totalValue = money(withCredit ? (s.payableCents ?? 0) : s.totalCents);
  const totalSize = fit(f.bold, totalValue, 19, 165);
  const mid = totalTop - totalH / 2;
  const totalWord = credit
    ? "Total credited"
    : withCredit
      ? s.advance || !s.payableCents
        ? "To pay"
        : "Paid"
      : s.advance || s.billTo === "partner"
        ? "To pay"
        : "Total";
  text(page, f.bold, totalWord, tx, mid - 4.5, 12, sh.accent);
  right(page, f.bold, totalValue, R - 12, mid - totalSize * SCALE * 0.36, totalSize, sh.accent);
  y = totalTop - totalH - 24;

  /* The left of the totals: the status stamp. The amount is not written out in words. */
  const leftW = tx - 12 - L - 24;
  let ly = totalTop + 2 * 22 - 4;
  const stamp = (words: string) => {
    const size = fit(f.bold, words, 9, leftW - 24);
    const w = f.bold.widthOfTextAtSize(words, size) + 24;
    page.drawRectangle({ x: L, y: ly - 28, width: w, height: 28, borderColor: sh.accent, borderWidth: 1.2 });
    text(page, f.bold, words, L + 12, ly - 17.5, size, sh.accent);
    ly -= 50;
  };
  if (!credit && s.advance) {
    /* Issued before the money, to be paid on the day of signing. */
    stamp(s.payableCents === 0 && s.creditAppliedCents ? `SETTLED BY CREDIT ${longDay(s.issuedOn)}` : (s.dueWords ?? "PAYMENT DUE ON SIGNING"));
  } else if (!credit && s.billTo === "partner") {
    /* Issued before the money: it says when it is due, not that it was paid. */
    stamp(s.dueOn ? `PAYMENT DUE BY ${longDay(s.dueOn)}` : "PAYMENT DUE ON RECEIPT");
  } else if (!credit) {
    /* Settled on the day, since it is issued with the money in hand. */
    stamp(
      s.payableCents === 0 && s.creditAppliedCents
        ? `SETTLED BY CREDIT ${longDay(s.issuedOn)}`
        : `PAID ${longDay(s.paidOn)}${s.receiptNumber ? `, RECEIPT ${s.receiptNumber}` : ""}`,
    );
  }
  y = Math.min(y, ly) - 16;

  /*
   * The foot of the page: the bank details on the left and the signature on
   * the right, kept just above the letterhead's foot, so the page is used to
   * its end however short the invoice is.
   */
  const showBank = !credit && Boolean(s.company.iban || s.company.bankAccount);
  const bankH = showBank ? 26 + 13 * bankRows : 0;
  const bottomH = Math.max(bankH, 80);
  const bottomTop = Math.min(y, FOOT_TOP + 20 + bottomH);
  if (showBank) bankPanel(sh, s, L, bottomTop, 320);
  const sigY = bottomTop - bottomH + 34;
  const sigW = showBank ? R - L - 320 - 24 : 200;
  page.drawLine({ start: { x: R - sigW, y: sigY }, end: { x: R, y: sigY }, thickness: 0.8, color: GRAPHITE });
  right(page, f.plain, `For ${s.company.name}`, R, sigY - 14, fit(f.plain, `For ${s.company.name}`, 8.5, sigW), QUIET);

  foot(sh, s, sh.pdf.getPageCount() > 1 ? `${paperWords}, page ${sh.pdf.getPageCount()}` : paperWords);
  return Buffer.from(await sh.pdf.save());
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
    const size = 24;
    const w = bold.widthOfTextAtSize(title, size);
    const boxW = Math.min(width * 0.4, Math.max(w, ...lines.map((line) => plain.widthOfTextAtSize(line, 10))) + 36);
    const boxH = 48 + lines.length * 15;
    /* At the left of the totals, over the PAID stamp, so the line it cancels and its figures stay readable. */
    const x = L;
    const y = height * 0.37 - boxH;
    /* Straight across the middle, like a rubber stamp on the printed page:
       a white panel so it reads over anything, a double red frame, the word. */
    page.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawRectangle({ x, y, width: boxW, height: boxH, borderColor: RED, borderWidth: 3 });
    page.drawRectangle({ x: x + 6, y: y + 6, width: boxW - 12, height: boxH - 12, borderColor: RED, borderWidth: 1 });
    page.drawText(title, { x: x + (boxW - w) / 2, y: y + boxH - 34, size, font: bold, color: RED });
    lines.forEach((line, i) => {
      const lw = plain.widthOfTextAtSize(line, 10);
      page.drawText(line, { x: x + (boxW - lw) / 2, y: y + boxH - 52 - i * 15, size: 10, font: plain, color: RED });
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
  refund: { purpose: "REFUND" | "PENALTY" | "VAT_CHANGE"; amountCents: number; paidOn: string; method: string; reference: string; cancelled: boolean; note: string },
): Promise<Buffer> {
  const sh = await start("Refund acknowledgement", s);
  const { page, f } = sh;
  let y = await letterhead(sh, s, "ACKNOWLEDGEMENT", s.creditNoteNumber ? `CN ${s.creditNoteNumber}` : "", longDay(refund.paidOn));
  const para = (value: string, size = 10.5, font = f.plain) => {
    for (const line of wrap(font, value, size, R - L)) {
      text(page, font, line, L, y, size);
      y -= size + 6;
    }
    y -= 10;
  };
  const amount = eur(refund.amountCents);
  const how = refund.method ? ` by ${({ CASH: "cash", CHEQUE: "cheque", BANK: "bank transfer", CARD: "card" } as Record<string, string>)[refund.method] ?? (isCustom(refund.method) ? ({ CASH: "cash", CHEQUE: "cheque", BANK: "bank transfer", CARD: "card", OTHER: "other means" } as Record<string, string>)[baseOf(refund.method)] ?? "other means" : refund.method.toLowerCase())}${refund.reference ? ` (${refund.reference})` : ""}` : "";

  const me = `I, ${s.client.name}${s.client.idNumber ? `, ID ${s.client.idNumber}` : ""}`;
  if (refund.amountCents === 0) {
    /* Agreed without any money changing hands: the paper says so plainly. */
    if (refund.purpose === "PENALTY") {
      para(`${me}, confirm that it has been agreed with ${s.company.name} on ${longDay(refund.paidOn)} that no compensation is paid to me for the delay in the completion of the property ${s.property}, under contract ${s.contractReference}. The price in the Contract of Sale and its terms are unchanged.`, 11, f.bold);
    } else {
      para(`${me}, confirm that it has been agreed with ${s.company.name} on ${longDay(refund.paidOn)} that no money is paid back to me for the property ${s.property}, under contract ${s.contractReference}.${refund.cancelled ? " I confirm that my reservation of this property is cancelled." : ""}`, 11, f.bold);
    }
    if (refund.note) para(refund.note, 10);
    figureBox(sh, { x: R - 200, top: y, w: 200, h: 50, fill: sh.soft, border: sh.accent }, "Amount paid", "Nothing", 17, sh.accent);
    y -= 70;
  } else {
  para(`${me}, confirm that I have received from ${s.company.name} the sum of ${amount} (${amountInEnglish(refund.amountCents).toLowerCase()})${how} on ${longDay(refund.paidOn)}.`, 11, f.bold);
  if (refund.purpose === "VAT_CHANGE") {
    para(`The amount is the VAT I paid over at the standard rate on the property ${s.property}, under contract ${s.contractReference}, before my reduced VAT was approved, which could not be set against any further payment. It is covered by credit note ${s.creditNoteNumber}. The price in the Contract of Sale before VAT is unchanged.`);
  } else if (refund.purpose === "PENALTY") {
    para(`The amount is paid to me as the agreed compensation for the delay in the completion of the property ${s.property}, under contract ${s.contractReference}. It is covered by credit note ${s.creditNoteNumber}. The price in the Contract of Sale and its terms are unchanged.`);
  } else {
    para(`The amount is paid to me as a refund agreed as a matter of goodwill, for the property ${s.property} under contract ${s.contractReference}. It is covered by credit note ${s.creditNoteNumber}.${refund.cancelled ? " I confirm that my reservation of this property is cancelled." : ""}`);
  }
  if (refund.note) para(refund.note, 10);

  figureBox(sh, { x: R - 200, top: y, w: 200, h: 50, fill: sh.soft, border: sh.accent }, "Amount paid", amount, 17, sh.accent);
  y -= 70;
  }

  /* The two signatures, at the foot of the page. */
  y = Math.min(y - 40, FOOT_TOP + 110);
  const sig = (x: number, en: string, name: string) => {
    page.drawLine({ start: { x, y }, end: { x: x + 210, y }, thickness: 0.8, color: GRAPHITE });
    text(page, f.plain, en, x, y - 14, 8.5, QUIET);
    text(page, f.bold, name, x, y - 28, fit(f.bold, name, 9.5, 210));
    text(page, f.plain, "Date: ____________", x, y - 48, 8.5, QUIET);
  };
  sig(L, "The client", s.client.name);
  sig(R - 210, "For the company", s.company.name);

  foot(sh, s, "Refund acknowledgement");
  return Buffer.from(await sh.pdf.save());
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
  const sh = await start(`Receipt ${s.receiptNumber}`, s);
  const { page, f } = sh;
  let y = await letterhead(sh, s, "RECEIPT", s.receiptNumber, longDay(s.paidOn));
  const valueX = L + 130;

  const row = (label: string, value: string, strong = false) => {
    if (!value) return;
    text(page, f.plain, label, L, y, 8.5, QUIET);
    const size = strong ? 12 : 10.5;
    const lines = wrap(strong ? f.bold : f.plain, value, size, R - valueX);
    for (const [i, line] of lines.entries()) text(page, strong ? f.bold : f.plain, line, valueX, y - i * 15, size);
    const used = (lines.length - 1) * 15 + 10;
    page.drawLine({ start: { x: valueX, y: y - used }, end: { x: R, y: y - used }, thickness: 0.5, color: LINE });
    y -= used + 18;
  };

  /*
   * Who paid, in as few lines as it takes, like the invoice's Bill to: the
   * name, then the address on one line and the numbers on one, in small print
   * under it. Beside it, the amount received, the boldest figure on the page.
   * The amount is not written out in words.
   */
  const boxW = 190;
  const boxH = 52;
  const boxTop = y + 14;
  text(page, f.plain, "Received from", L, y, 8.5, QUIET);
  const nameW = R - boxW - 18 - valueX;
  const nameLines = wrap(f.bold, s.client.name, 11.5 * SCALE, nameW);
  for (const [i, line] of nameLines.entries()) text(page, f.bold, line, valueX, y - i * 14, 11.5);
  let wy = y - 14 * nameLines.length - 1;
  const small = [
    [s.client.address, s.client.country].map((one) => (one ?? "").trim()).filter((one, i, all) => one && !all.slice(0, i).some((before) => before.includes(one))).join(", "),
    [s.client.idNumber ? `ID ${s.client.idNumber}` : "", s.client.registration ? `Reg. ${s.client.registration}` : "", s.client.vatNumber ? `VAT ${s.client.vatNumber}` : ""].filter(Boolean).join("    "),
  ].filter(Boolean);
  for (const value of small) {
    for (const line of wrap(f.plain, value, 9 * SCALE, nameW)) {
      text(page, f.plain, line, valueX, wy, 9, QUIET);
      wy -= 12;
    }
  }
  figureBox(sh, { x: R - boxW, top: boxTop, w: boxW, h: boxH, fill: sh.soft, border: sh.accent }, "Amount received", eur(s.totalCents), 21, sh.accent);
  y = Math.min(wy, boxTop - boxH) - 14;
  page.drawLine({ start: { x: L, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 0.5, color: LINE });
  y -= 12;

  row("For", s.description);
  if (s.againstInvoice) {
    const a = s.againstInvoice;
    row(
      "Invoice",
      `No. ${a.number} for ${eur(a.totalCents)}${a.part && a.parts ? `, part ${a.part} of ${a.parts}` : ""}`,
    );
  } else {
    row("Invoice", s.invoiceNumber ? `No. ${s.invoiceNumber}` : "");
  }

  /* How it was paid: the book's boxes, with the one that applies ticked. */
  text(page, f.plain, "Paid by", L, y, 8.5, QUIET);
  let bx = valueX;
  const widths: Record<string, number> = { CASH: 64, CHEQUE: 74, BANK: 106, CARD: 56, OTHER: 0 };
  /* "Something else" is a box of its own, ticked, with what it was written beside it. */
  const base = baseOf(s.method ?? "");
  const other = base === "OTHER" || (!!s.method && !["CASH", "CHEQUE", "BANK", "CARD"].includes(base));
  const keys = other ? ["CASH", "CHEQUE", "BANK", "CARD", "OTHER"] : ["CASH", "CHEQUE", "BANK", "CARD"];
  for (const key of keys) {
    let en = key === "OTHER" ? s.methodName?.trim() || METHOD_WORDS.OTHER : METHOD_WORDS[key];
    while (key === "OTHER" && en.length > 4 && f.bold.widthOfTextAtSize(en, 9 * SCALE) > R - bx - 16) en = `${en.slice(0, -2).trimEnd()}…`;
    const on = key === "OTHER" ? other : base === key;
    page.drawRectangle({ x: bx, y: y - 2, width: 11, height: 11, borderColor: on ? sh.accent : QUIET, borderWidth: 1, color: on ? sh.accent : undefined });
    if (on) {
      page.drawLine({ start: { x: bx + 2.2, y: y + 3.5 }, end: { x: bx + 4.8, y: y + 0.6 }, thickness: 1.4, color: WHITE });
      page.drawLine({ start: { x: bx + 4.8, y: y + 0.6 }, end: { x: bx + 9, y: y + 7.4 }, thickness: 1.4, color: WHITE });
    }
    text(page, on ? f.bold : f.plain, en, bx + 16, y, 9);
    bx += widths[key];
  }
  /* The office's own method, named after the boxes: "Bank transfer" ticked, "Standing order" said. */
  if (s.methodName && !other) text(page, f.bold, s.methodName.slice(0, 24), Math.min(bx + 4, R - 90), y, 9);
  y -= 20;
  if (s.reference) {
    text(page, f.plain, `Reference: ${s.reference}`, valueX, y, 8.5, QUIET);
    y -= 16;
  }

  if (s.vatCents > 0) {
    text(page, f.plain, `Includes VAT of ${eur(s.vatCents)} at ${Number.isInteger(s.rate) ? s.rate : s.rate.toFixed(2)}%.`, valueX, y, 8.5, QUIET);
    y -= 16;
  }
  y -= 10;

  /* A part of a stage: where its invoice stands after this money. */
  if (s.againstInvoice) {
    const a = s.againstInvoice;
    const gap = 12;
    const w3 = (R - L - gap * 2) / 3;
    const h = 52;
    figureBox(sh, { x: L, top: y, w: w3, h, fill: sh.soft }, `Invoice ${a.number}`, eur(a.totalCents), 14, GRAPHITE);
    figureBox(sh, { x: L + w3 + gap, top: y, w: w3, h, fill: sh.soft }, "Received on it so far", eur(a.paidCents), 14, GRAPHITE);
    figureBox(sh, { x: L + 2 * (w3 + gap), top: y, w: w3, h, fill: sh.soft, border: sh.accent }, "Remaining on this invoice", eur(a.remainingCents), 15, sh.accent);
    y -= h + 12;
  }

  /* Where the contract stands after this money, in three boxes that fit their figures. */
  if (s.contractTotalCents > 0) {
    const gap = 12;
    const w3 = (R - L - gap * 2) / 3;
    const h = 52;
    figureBox(sh, { x: L, top: y, w: w3, h, fill: sh.soft }, "Contract total", eur(s.contractTotalCents), 14, GRAPHITE);
    figureBox(sh, { x: L + w3 + gap, top: y, w: w3, h, fill: sh.soft }, "Received to date", eur(s.receivedToDateCents), 14, GRAPHITE);
    figureBox(sh, { x: L + 2 * (w3 + gap), top: y, w: w3, h, fill: sh.soft, border: sh.accent }, "Balance", eur(s.balanceCents), 15, sh.accent);
    y -= h + 16;
  }

  /*
   * The person who took the money and a place for a signature, at the foot of
   * the page, clear of the foot. The date is the one at the top, said once.
   */
  y = Math.max(Math.min(y - 24, FOOT_TOP + 90), FOOT_TOP + 22);
  page.drawLine({ start: { x: R - 210, y }, end: { x: R, y }, thickness: 0.8, color: GRAPHITE });
  right(page, f.plain, `The recipient, for ${s.company.name}`, R, y - 14, fit(f.plain, `The recipient, for ${s.company.name}`, 8.5, 260), QUIET);
  if (s.recordedBy) right(page, f.bold, s.recordedBy, R, y - 29, 9.5);

  foot(sh, s, `Receipt ${s.receiptNumber}`);
  return Buffer.from(await sh.pdf.save());
}
