import "server-only";
import { makeZip } from "@/lib/zip";

/**
 * A plain Excel workbook: one sheet, a bold header row, text and numbers.
 *
 * Enough for a list an accountant opens, sorts and adds up, written straight
 * as the XML Excel reads, so nothing has to be installed for it.
 */

export type Cell = string | number | null | undefined;

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const column = (index: number) => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

export function makeXlsx(sheet: string, header: string[], rows: Cell[][], widths: number[] = []): Buffer {
  const line = (cells: Cell[], r: number, bold = false) =>
    `<row r="${r}">${cells
      .map((cell, c) => {
        const ref = `${column(c)}${r}`;
        if (typeof cell === "number" && Number.isFinite(cell)) {
          return `<c r="${ref}" s="${bold ? 1 : 2}"><v>${cell}</v></c>`;
        }
        const text = cell === null || cell === undefined ? "" : String(cell);
        return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
      })
      .join("")}</row>`;

  const cols = header.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[i] ?? 16}" customWidth="1"/>`).join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${[line(header, 1, true), ...rows.map((row, i) => line(row, i + 2))].join("")}</sheetData><autoFilter ref="A1:${column(header.length - 1)}${rows.length + 1}"/></worksheet>`;

  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(sheet.slice(0, 31))}'!$A$1:$${column(header.length - 1)}$${rows.length + 1}</definedName></definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0"/><xf fontId="1" applyFont="1"/><xf fontId="0" numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheetXml,
  };
  return makeZip(Object.entries(files).map(([name, text]) => ({ name, data: Buffer.from(text, "utf8") })));
}
