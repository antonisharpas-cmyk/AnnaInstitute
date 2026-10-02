import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { db } from "@/db";
import { clients, contracts, installments, payments, projectPartners, projects, subownerShares, subowners, units } from "@/db/schema";
import { toCents } from "@/lib/money";
import { buyersName } from "@/lib/buyers";
import { constructorOfProject } from "@/lib/constructors";

/**
 * The status of one development, for its shareholders.
 *
 * The figures at the top, the constructor's contract and what has been paid on
 * it, every apartment with its buyer, where each buyer's payments stand, each
 * buyer's payments one by one, and the constructor's payments one by one. The
 * contract figures only: money agreed outside the contract, the cash, is left
 * out, as the office asked.
 */

export type ProjectReport = Awaited<ReturnType<typeof projectReportData>>;

export async function projectReportData(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  const unitRows = await db
    .select({ unit: units, client: clients })
    .from(units)
    .leftJoin(clients, eq(clients.id, units.clientId))
    .where(eq(units.projectId, projectId))
    .orderBy(asc(units.code));

  const contractRows = unitRows.length
    ? await db
        .select({ contract: contracts, client: clients })
        .from(contracts)
        .leftJoin(clients, eq(clients.id, contracts.clientId))
        .where(and(inArray(contracts.unitId, unitRows.map((one) => one.unit.id)), ne(contracts.status, "CANCELLED")))
    : [];
  const contractIds = contractRows.map((one) => one.contract.id);
  const [lines, paid] = contractIds.length
    ? await Promise.all([
        db.select().from(installments).where(inArray(installments.contractId, contractIds)),
        db.select().from(payments).where(inArray(payments.contractId, contractIds)).orderBy(asc(payments.paidOn), asc(payments.createdAt)),
      ])
    : [[], []];

  const sold = (status: string) => status === "SOLD" || status === "DELIVERED" || status === "RESERVED";
  const apartments = unitRows.map(({ unit, client }) => {
    const contract = contractRows.find((one) => one.contract.unitId === unit.id);
    const buyer = contract?.client ?? client;
    return {
      code: unit.code,
      beds: unit.bedrooms,
      /* The price on the contract once there is one, which never includes the cash part. */
      priceCents: contract ? toCents(contract.contract.netPrice) : toCents(unit.netPrice),
      status: unit.status,
      sold: sold(unit.status),
      buyer: buyer ? buyersName(buyer) : "",
      contractId: contract?.contract.id ?? null,
      reference: contract?.contract.reference ?? "",
    };
  });

  /* Each buyer's contract: what the schedule comes to with VAT, and what was paid on it. */
  const buyers = apartments
    .filter((one) => one.contractId)
    .map((one) => {
      const schedule = lines.filter((line) => line.contractId === one.contractId);
      const owedCents = schedule.reduce((a, line) => a + toCents(line.totalAmount), 0);
      const mine = paid.filter((pay) => pay.contractId === one.contractId);
      const rows = mine.map((pay, i) => {
        const line = schedule.find((l) => l.id === pay.installmentId);
        const gross = toCents(pay.amount);
        const lineGross = line ? toCents(line.totalAmount) : 0;
        const net = line && lineGross > 0 ? Math.round((gross * toCents(line.netAmount)) / lineGross) : gross;
        return {
          date: new Date(pay.paidOn).toISOString(),
          description: `${pay.kind === "CREDIT" ? "Credit, reduced VAT" : `Payment ${i + 1}`}${line?.label ? `, ${line.label}` : ""}`,
          netCents: net,
          grossCents: gross,
        };
      });
      const paidCents = rows.reduce((a, row) => a + row.grossCents, 0);
      const scheduleNet = schedule.reduce((a, line) => a + toCents(line.netAmount), 0);
      return {
        code: one.code,
        buyer: one.buyer,
        owedCents,
        paidCents,
        balanceCents: owedCents - paidCents,
        percent: owedCents > 0 ? paidCents / owedCents : 0,
        rows,
        paidNetCents: rows.reduce((a, row) => a + row.netCents, 0),
        balanceNetCents: scheduleNet - rows.reduce((a, row) => a + row.netCents, 0),
      };
    });

  const constructor = await constructorOfProject(projectId);

  return {
    project,
    apartments,
    buyers,
    totals: {
      units: apartments.length,
      sold: apartments.filter((one) => one.sold).length,
      available: apartments.filter((one) => !one.sold).length,
      soldCents: apartments.filter((one) => one.sold).reduce((a, one) => a + one.priceCents, 0),
      availableCents: apartments.filter((one) => !one.sold).reduce((a, one) => a + one.priceCents, 0),
      valueCents: apartments.reduce((a, one) => a + one.priceCents, 0),
    },
    constructor,
  };
}

/** Who can be sent a development's report: the shareholders of the companies that hold it. */
export async function reportRecipients(projectId: string) {
  const rows = await db
    .select({ holder: subownerShares.holder, email: subownerShares.email, company: subowners.name })
    .from(projectPartners)
    .innerJoin(subowners, eq(subowners.id, projectPartners.subownerId))
    .innerJoin(subownerShares, eq(subownerShares.subownerId, subowners.id))
    .where(eq(projectPartners.projectId, projectId))
    .orderBy(asc(subownerShares.holder));
  const seen = new Set<string>();
  return rows
    .filter((one) => {
      const key = `${one.holder.toLowerCase()}|${(one.email ?? "").toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((one) => ({ name: one.holder, email: one.email?.trim() || "", company: one.company }));
}

/* ---------------------------------------------------------------------------
   The PDF
   --------------------------------------------------------------------------- */

const W = 595.28;
const H = 841.89;
const L = 44;
const R = W - 44;
const TEAL = rgb(0x3d / 255, 0x83 / 255, 0x97 / 255);
const TEAL_SOFT = rgb(0xe8 / 255, 0xf3 / 255, 0xf6 / 255);
const GRAPHITE = rgb(0x4d / 255, 0x4d / 255, 0x4f / 255);
const QUIET = rgb(0.45, 0.47, 0.5);
const LINE = rgb(0.86, 0.88, 0.9);
const STRIPE = rgb(0.975, 0.98, 0.985);
const GOOD = rgb(0x1f / 255, 0x6f / 255, 0x43 / 255);
const WARN = rgb(0x8a / 255, 0x61 / 255, 0x00);
const BAD = rgb(0x8a / 255, 0x2f / 255, 0x2f / 255);
const WHITE = rgb(1, 1, 1);
const SAND = rgb(0xfd / 255, 0xf5 / 255, 0xe5 / 255);

const eur = (cents: number) =>
  new Intl.NumberFormat("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(cents / 100));
const day = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

/** The constructor as the shareholders know them: the person or firm, and the company when it differs. */
const builderName = (who: { name: string; company: string | null }) =>
  [who.name, who.company].filter((one, i, all) => one && all.indexOf(one) === i).join(", ");

type Col = { title: string; width: number; align?: "left" | "right" | "center" };
type Cell = { text: string; bold?: boolean; color?: RGB };

export async function projectReportPdf(data: NonNullable<ProjectReport>, forName: string, companyName: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const shipped = (...parts: string[]) => path.join(process.cwd(), ...parts);
  const [plain, bold] = await Promise.all([
    pdf.embedFont(await readFile(shipped("assets", "fonts", "DejaVuSans.ttf")), { subset: true }),
    pdf.embedFont(await readFile(shipped("assets", "fonts", "DejaVuSans-Bold.ttf")), { subset: true }),
  ]);
  pdf.setTitle(`Project status, ${data.project.name}`);
  pdf.setAuthor(companyName);

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - 52;
  const fresh = () => {
    page = pdf.addPage([W, H]);
    y = H - 52;
  };
  const room = (needed: number) => {
    if (y - needed < 56) fresh();
  };
  const text = (value: string, x: number, at: number, size: number, font: PDFFont = plain, color: RGB = GRAPHITE) =>
    page.drawText(value || " ", { x, y: at, size, font, color });
  const width = (value: string, size: number, font: PDFFont = plain) => font.widthOfTextAtSize(value || " ", size);
  const wrap = (value: string, size: number, max: number, font: PDFFont = plain) => {
    const words = (value || "").split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (width(next, size, font) <= max) line = next;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };

  /* A heading never sits alone at the foot of a page: it keeps room for the table head and a row. */
  const heading = (value: string) => {
    room(110);
    y -= 14;
    text(value, L, y, 13, bold, TEAL);
    y -= 18;
  };

  /** A table: a teal head, striped rows, text that wraps, and a new page when one is full. */
  const table = (cols: Col[], rows: Cell[][], options: { foot?: Cell[][]; tint?: (i: number) => RGB | null } = {}) => {
    const total = cols.reduce((a, c) => a + c.width, 0);
    const scale = (R - L) / total;
    const xs: number[] = [];
    let x = L;
    for (const c of cols) {
      xs.push(x);
      x += c.width * scale;
    }
    const drawHead = () => {
      const lines = cols.map((c) => wrap(c.title, 8, c.width * scale - 10, bold));
      const h = Math.max(...lines.map((l) => l.length)) * 10 + 12;
      page.drawRectangle({ x: L, y: y - h, width: R - L, height: h, color: TEAL });
      cols.forEach((c, i) => {
        lines[i].forEach((line, n) => {
          const w = width(line, 8, bold);
          const cx = c.align === "right" ? xs[i] + c.width * scale - 6 - w : c.align === "center" ? xs[i] + (c.width * scale - w) / 2 : xs[i] + 6;
          text(line, cx, y - 14 - n * 10, 8, bold, WHITE);
        });
      });
      y -= h;
    };
    room(60);
    drawHead();
    const drawRow = (cells: Cell[], fill: RGB | null) => {
      const lines = cells.map((cell, i) => wrap(cell.text, 8.5, cols[i].width * scale - 10, cell.bold ? bold : plain));
      const h = Math.max(...lines.map((l) => l.length)) * 11 + 9;
      if (y - h < 56) {
        fresh();
        drawHead();
      }
      if (fill) page.drawRectangle({ x: L, y: y - h, width: R - L, height: h, color: fill });
      cells.forEach((cell, i) => {
        const font = cell.bold ? bold : plain;
        lines[i].forEach((line, n) => {
          const w = width(line, 8.5, font);
          const c = cols[i];
          const cx = c.align === "right" ? xs[i] + c.width * scale - 6 - w : c.align === "center" ? xs[i] + (c.width * scale - w) / 2 : xs[i] + 6;
          text(line, cx, y - 12 - n * 11, 8.5, font, cell.color ?? GRAPHITE);
        });
      });
      page.drawLine({ start: { x: L, y: y - h }, end: { x: R, y: y - h }, thickness: 0.4, color: LINE });
      y -= h;
    };
    rows.forEach((cells, i) => drawRow(cells, options.tint?.(i) ?? (i % 2 ? STRIPE : null)));
    for (const cells of options.foot ?? []) drawRow(cells, TEAL_SOFT);
    y -= 8;
  };

  /* The head of the first page. */
  const where = (data.project.location ?? "").split(",")[0].trim();
  text(`PROJECT STATUS${where ? `, ${where.toUpperCase()}` : ""}`, L, y, 19, bold, TEAL);
  y -= 18;
  text(data.project.name.toUpperCase(), L, y, 11.5, bold, GRAPHITE);
  y -= 15;
  const today = day(new Date().toISOString());
  text(`${forName ? `Update for ${forName}  |  ` : ""}Date: ${today}`, L, y, 9.5, plain, QUIET);
  y -= 12;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: TEAL });
  y -= 18;

  const t = data.totals;
  table(
    [
      { title: "Total units", width: 1, align: "center" },
      { title: "Sold", width: 1, align: "center" },
      { title: "Available", width: 1, align: "center" },
      { title: "Value sold (€)", width: 1.2, align: "center" },
      { title: "Value available (€)", width: 1.2, align: "center" },
      { title: "Total project value (€)", width: 1.3, align: "center" },
    ],
    [[
      { text: String(t.units) },
      { text: `${t.sold}${t.units ? ` (${((t.sold / t.units) * 100).toFixed(1)}%)` : ""}` },
      { text: String(t.available) },
      { text: eur(t.soldCents) },
      { text: eur(t.availableCents) },
      { text: eur(t.valueCents), bold: true },
    ]],
  );

  /* The constructor, with what has been paid on the contract. */
  const c = data.constructor;
  if (c) {
    table(
      [
        { title: "Contract with the constructor (€)", width: 1.4, align: "center" },
        { title: "Paid to the constructor (€)", width: 1.3, align: "center" },
        { title: "Pending (€)", width: 1, align: "center" },
        { title: "Still to pay (€)", width: 1.1, align: "center" },
        { title: "Paid of the contract", width: 1, align: "center" },
      ],
      [[
        { text: eur(c.agreedCents), bold: true },
        { text: eur(c.paidCents), bold: true, color: GOOD },
        { text: eur(c.pendingCents), color: WARN },
        { text: eur(c.remainingCents), bold: true },
        { text: c.agreedCents > 0 ? `${((c.paidCents / c.agreedCents) * 100).toFixed(1)}%` : "" },
      ]],
    );
    y -= 12;
    text(`Constructor: ${builderName(c.constructor)}`, L, y, 9, plain, QUIET);
    y -= 16;
  }

  heading("Detailed apartment status");
  table(
    [
      { title: "Apt No.", width: 0.8, align: "center" },
      { title: "Beds", width: 0.7, align: "center" },
      { title: "Price (€)", width: 1, align: "right" },
      { title: "Status", width: 1.1, align: "center" },
      { title: "Buyer", width: 3 },
    ],
    data.apartments.map((one) => [
      { text: one.code },
      { text: one.beds !== null && one.beds !== undefined ? String(one.beds) : "" },
      { text: eur(one.priceCents) },
      { text: one.status, bold: true, color: one.sold ? GOOD : WARN },
      { text: one.buyer || "None yet" },
    ]),
    { tint: (i) => (data.apartments[i].sold ? (i % 2 ? STRIPE : null) : SAND) },
  );

  if (data.buyers.length > 0) {
    heading("Payment status per client");
    table(
      [
        { title: "Apt No.", width: 0.7, align: "center" },
        { title: "Client", width: 2.4 },
        { title: "Contract incl. VAT (€)", width: 1.2, align: "right" },
        { title: "Paid (€)", width: 1, align: "right" },
        { title: "Balance (€)", width: 1, align: "right" },
        { title: "% Paid", width: 0.8, align: "right" },
      ],
      data.buyers.map((one) => [
        { text: one.code },
        { text: one.buyer },
        { text: eur(one.owedCents) },
        { text: eur(one.paidCents) },
        { text: eur(one.balanceCents) },
        { text: `${(one.percent * 100).toFixed(1)}%` },
      ]),
      {
        foot: [[
          { text: "" },
          { text: "Total", bold: true },
          { text: eur(data.buyers.reduce((a, one) => a + one.owedCents, 0)), bold: true },
          { text: eur(data.buyers.reduce((a, one) => a + one.paidCents, 0)), bold: true },
          { text: eur(data.buyers.reduce((a, one) => a + one.balanceCents, 0)), bold: true },
          { text: "" },
        ]],
      },
    );

    for (const one of data.buyers) {
      heading(`Payments, apt. ${one.code} (${one.buyer})`);
      table(
        [
          { title: "Date", width: 1, align: "center" },
          { title: "Description", width: 2.6 },
          { title: "Amount excl. VAT (€)", width: 1.2, align: "right" },
          { title: "Amount incl. VAT (€)", width: 1.2, align: "right" },
        ],
        one.rows.length > 0
          ? one.rows.map((row) => [{ text: day(row.date) }, { text: row.description }, { text: eur(row.netCents) }, { text: eur(row.grossCents) }])
          : [[{ text: "" }, { text: "No payments yet" }, { text: "" }, { text: "" }]],
        {
          foot: [
            [{ text: "" }, { text: "Total payments", bold: true }, { text: eur(one.paidNetCents), bold: true }, { text: eur(one.paidCents), bold: true }],
            [{ text: "" }, { text: "Balance (contract)", bold: true }, { text: eur(one.balanceNetCents), bold: true }, { text: eur(one.balanceCents), bold: true }],
          ],
        },
      );
    }
  }

  if (c) {
    heading(`Payments to the constructor, ${builderName(c.constructor)}`);
    /* A cancelled payment never happened, so the shareholders do not see it. */
    const shown = [...c.payments].reverse().filter((pay) => pay.status !== "CANCELLED");
    table(
      [
        { title: "Date", width: 1, align: "center" },
        { title: "Kind of payment", width: 2.4 },
        { title: "Amount (€)", width: 1.2, align: "right" },
        { title: "Status", width: 1, align: "center" },
      ],
      shown.length > 0
        ? shown.map((pay) => [
            { text: day(new Date(pay.paidOn).toISOString()) },
            { text: [pay.kind, pay.notes].filter(Boolean).join(", ") },
            { text: eur(toCents(pay.amount)) },
            {
              text: pay.status === "PAID" ? "PAID" : pay.status === "CANCELLED" ? "CANCELLED" : "PENDING",
              bold: true,
              color: pay.status === "PAID" ? GOOD : pay.status === "CANCELLED" ? BAD : WARN,
            },
          ])
        : [[{ text: "" }, { text: "No payments yet" }, { text: "" }, { text: "" }]],
      {
        foot: [
          [{ text: "" }, { text: "Paid", bold: true }, { text: eur(c.paidCents), bold: true }, { text: "" }],
          [{ text: "" }, { text: "Pending", bold: true }, { text: eur(c.pendingCents), bold: true }, { text: "" }],
          [{ text: "" }, { text: "Contract with the constructor", bold: true }, { text: eur(c.agreedCents), bold: true }, { text: "" }],
          [{ text: "" }, { text: "Still to pay", bold: true }, { text: eur(c.remainingCents), bold: true }, { text: "" }],
        ],
      },
    );
  }

  /* A foot on every page: who it is from, and the page number. */
  const pages = pdf.getPages();
  pages.forEach((one, i) => {
    one.drawLine({ start: { x: L, y: 40 }, end: { x: R, y: 40 }, thickness: 0.6, color: LINE });
    one.drawText(`${companyName}  |  ${data.project.name}  |  ${today}`, { x: L, y: 28, size: 7.5, font: plain, color: QUIET });
    const label = `Page ${i + 1} of ${pages.length}`;
    one.drawText(label, { x: R - plain.widthOfTextAtSize(label, 7.5), y: 28, size: 7.5, font: plain, color: QUIET });
  });

  return Buffer.from(await pdf.save());
}
