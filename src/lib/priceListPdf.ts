import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { companyDetails, ONE_ELEVEN_COLOR } from "@/lib/issuer";
import { logoBytes } from "@/lib/paymentPdf";
import { formatAmount, toCents } from "@/lib/money";
import { squareMetres, totalArea } from "@/lib/areas";
import type { priceListRows } from "@/lib/priceList";

/**
 * The price list as a PDF, to keep, print or forward.
 *
 * The same apartments and figures as the live page on the day it is made,
 * with that day and the day the link stops working printed on it: a PDF is a
 * copy that does not change, so it has to say how old it is.
 */

type Rows = Awaited<ReturnType<typeof priceListRows>>["rows"];

/* A4 on its side, so every column has room. */
const W = 841.89;
const H = 595.28;
const M = 40;

const hex = (value: string) => {
  const n = Number.parseInt(value.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const INK = rgb(0.07, 0.07, 0.07);
const GREY = rgb(0.42, 0.42, 0.45);
const LINE = rgb(0.86, 0.87, 0.89);
const SOFT = rgb(0.95, 0.97, 0.97);

const longDay = (value: Date) => value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export async function priceListPdf(options: { title: string; rows: Rows; expiresAt: Date | null; note?: string | null }): Promise<Buffer> {
  const company = await companyDetails();
  const teal = hex(ONE_ELEVEN_COLOR);
  const pdf = await PDFDocument.create();
  pdf.setTitle(options.title);
  pdf.setAuthor(company.name || "One Eleven");
  pdf.setCreator("One Eleven CRM");
  pdf.registerFontkit(fontkit);
  const shipped = (...parts: string[]) => path.join(process.cwd(), ...parts);
  const [plain, bold] = await Promise.all([
    readFile(shipped("assets", "fonts", "DejaVuSans.ttf")).then((bytes) => pdf.embedFont(bytes, { subset: true })),
    readFile(shipped("assets", "fonts", "DejaVuSans-Bold.ttf")).then((bytes) => pdf.embedFont(bytes, { subset: true })),
  ]);
  const logo = await (async () => {
    const bytes = await logoBytes({ company });
    if (!bytes) return null;
    try {
      return bytes[0] === 0x89 && bytes[1] === 0x50 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  })();

  const pages: PDFPage[] = [];
  let page = pdf.addPage([W, H]);
  pages.push(page);
  let y = H - M;

  const text = (value: string, x: number, at: number, size: number, font: PDFFont = plain, color = INK) =>
    page.drawText(value, { x, y: at, size, font, color });
  const right = (value: string, x: number, at: number, size: number, font: PDFFont = plain, color = INK) =>
    page.drawText(value, { x: x - font.widthOfTextAtSize(value, size), y: at, size, font, color });
  const fit = (value: string, width: number, size: number, font: PDFFont) => {
    let out = value;
    while (out.length > 1 && font.widthOfTextAtSize(out, size) > width) out = out.slice(0, -1);
    return out === value ? value : `${out.slice(0, -1)}…`;
  };

  /* The head of the first page: logo, title, the day it was made and the day it stops. */
  if (logo) {
    const scale = Math.min(150 / logo.width, 60 / logo.height);
    page.drawImage(logo, { x: M, y: y - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
  }
  const contact = [company.address, company.phone, company.email, company.website].filter((one) => one?.trim());
  contact.forEach((line, i) => right(line, W - M, y - 10 - i * 12, 8.5, plain, GREY));
  y -= 90;
  text(options.title, M, y, 17, bold);
  y -= 18;
  const valid = options.expiresAt ? ` Valid until ${longDay(options.expiresAt)}.` : "";
  text(`Prices before VAT. Correct as at ${longDay(new Date())}.${valid}`, M, y, 9.5, plain, GREY);
  if (options.note?.trim()) {
    y -= 13;
    text(options.note.trim(), M, y, 9.5, bold, GREY);
  }
  y -= 22;

  /* The columns, laid across the page. */
  const cols = [
    { head: "Unit", w: 70, align: "left" as const },
    { head: "Floor", w: 60, align: "left" as const },
    { head: "Bedrooms", w: 70, align: "right" as const },
    { head: "Covered", w: 80, align: "right" as const },
    { head: "Veranda", w: 80, align: "right" as const },
    { head: "Roof garden", w: 85, align: "right" as const },
    { head: "Total area", w: 85, align: "right" as const },
    { head: "Parking", w: 60, align: "right" as const },
    { head: "Price before VAT", w: W - 2 * M - 590, align: "right" as const },
  ];
  const ROW = 20;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - M;
  };
  const header = () => {
    page.drawRectangle({ x: M, y: y - ROW + 5, width: W - 2 * M, height: ROW, color: teal });
    let x = M;
    for (const col of cols) {
      if (col.align === "right") right(col.head, x + col.w - 8, y - 9, 8.5, bold, rgb(1, 1, 1));
      else text(col.head, x + 8, y - 9, 8.5, bold, rgb(1, 1, 1));
      x += col.w;
    }
    y -= ROW;
  };

  /* One block a development, in the order of the rows. */
  const groups = new Map<string, { name: string; where: string; units: Rows }>();
  for (const row of options.rows) {
    const found = groups.get(row.project.id);
    if (found) found.units.push(row);
    else
      groups.set(row.project.id, {
        name: row.project.name,
        where: [row.project.location, row.project.completionBy ? `ready ${row.project.completionBy}` : null].filter(Boolean).join(" . "),
        units: [row],
      });
  }

  if (groups.size === 0) {
    text("Nothing is available at the moment.", M, y, 11, plain, GREY);
  }

  for (const group of groups.values()) {
    if (y < M + 90) newPage();
    text(group.name, M, y, 13, bold);
    if (group.where) text(group.where, M + bold.widthOfTextAtSize(group.name, 13) + 10, y, 9, plain, GREY);
    y -= 12;
    header();
    group.units.forEach(({ unit }, i) => {
      if (y < M + 40) {
        newPage();
        header();
      }
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - ROW + 5, width: W - 2 * M, height: ROW, color: SOFT });
      const values = [
        unit.code,
        unit.floor ?? "",
        unit.bedrooms ?? "",
        squareMetres(unit.coveredArea),
        squareMetres(unit.verandaArea),
        squareMetres(unit.roofGardenArea),
        squareMetres(totalArea(unit)),
        String(unit.parkingSpaces ?? ""),
        formatAmount(toCents(unit.netPrice), "en"),
      ];
      let x = M;
      values.forEach((value, n) => {
        const col = cols[n];
        const font = n === 0 || n === 6 || n === 8 ? bold : plain;
        const shown = fit(String(value), col.w - 12, 9, font);
        if (col.align === "right") right(shown, x + col.w - 8, y - 9, 9, font);
        else text(shown, x + 8, y - 9, 9, font);
        x += col.w;
      });
      page.drawLine({ start: { x: M, y: y - ROW + 5 }, end: { x: W - M, y: y - ROW + 5 }, thickness: 0.5, color: LINE });
      y -= ROW;
    });
    y -= 22;
  }

  /* The notes and the page numbers, on every page. */
  pages.forEach((one, i) => {
    one.drawText(
      "VAT is charged in addition and depends on the buyer. Total area is the covered area, the verandas and the roof garden together.",
      { x: M, y: 26, size: 7.5, font: plain, color: GREY },
    );
    const label = `Page ${i + 1} of ${pages.length}`;
    one.drawText(label, { x: W - M - plain.widthOfTextAtSize(label, 7.5), y: 26, size: 7.5, font: plain, color: GREY });
  });

  return Buffer.from(await pdf.save());
}
