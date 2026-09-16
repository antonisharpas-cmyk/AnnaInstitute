"use client";

import { useEffect } from "react";

/**
 * Every other table in the CRM, sortable by clicking a heading.
 *
 * The four big lists sort on the server, because they show one page of many and
 * only the database can order the whole set. Everywhere else, a table is all of
 * itself on the page: the apartments in a development, the schedule on a
 * contract, an agent's commission lines, the rows of a report. Those can be
 * sorted where they are, and doing it here means the tables that already exist
 * get the behaviour without being rewritten, and any table added later gets it
 * for free.
 *
 * A note on how carefully this has to behave, which cost a rewrite to learn.
 *
 * The first version put a button inside every heading as soon as the page
 * loaded. That works until it does not: these pages arrive as HTML and React
 * then takes them over, section by section, and a script that has already
 * changed the headings hands React a page that does not match the one the
 * server sent. React says so, throws that part of the tree away and draws it
 * again, which is a warning in the console and wasted work in the browser.
 *
 * So this version changes nothing until somebody actually clicks. One listener
 * on the document, the direction kept in a map here rather than in the page,
 * the arrows drawn by the stylesheet from a single attribute, and the rows only
 * reordered once a person has asked for it, long after React has settled. The
 * headings still look sortable, because the stylesheet marks every heading of
 * an unsorted table rather than waiting for this file to do it.
 */

type Dir = "asc" | "desc";
type State = { index: number; dir: Dir };

const MONEY = /[€$£]/;
const NUMBERISH = /^[\s€$£+-]*[\d.,\s]+%?$/;

/** What each table is currently sorted by, kept out of the page itself. */
const sortedBy = new WeakMap<HTMLTableElement, State>();

function cleanNumber(text: string): number {
  const bare = text.replace(/[^\d,.-]/g, "").trim();
  if (!bare) return Number.NaN;
  // European and plain formats both appear, so the last separator decides.
  const lastComma = bare.lastIndexOf(",");
  const lastDot = bare.lastIndexOf(".");
  if (lastComma > lastDot) return Number(bare.replace(/\./g, "").replace(",", "."));
  return Number(bare.replace(/,/g, ""));
}

function asDate(text: string): number {
  const trimmed = text.trim();
  // Day first, the way both English and Greek write it here.
  const dayFirst = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dayFirst) {
    const [, d, m, y] = dayFirst;
    const year = Number(y.length === 2 ? `20${y}` : y);
    return new Date(year, Number(m) - 1, Number(d)).getTime();
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function textOf(cell: HTMLTableCellElement | undefined): string {
  if (!cell) return "";
  // A cell being edited in place carries its value in the field, not the text.
  const field = cell.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  if (field && field.type !== "checkbox" && field.value) return String(field.value);
  return (cell.innerText ?? "").trim();
}

function kindOf(
  body: HTMLTableSectionElement,
  index: number,
): "number" | "money" | "date" | "text" {
  const values = [...body.rows]
    .slice(0, 12)
    .map((row) => textOf(row.cells[index] as HTMLTableCellElement))
    .filter((text) => text.length > 0);

  if (values.length === 0) return "text";
  if (values.every((text) => MONEY.test(text))) return "money";
  if (values.every((text) => NUMBERISH.test(text))) return "number";
  if (values.every((text) => !Number.isNaN(asDate(text)))) return "date";
  return "text";
}

export default function Sortable() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const heading = target.closest("th");
      if (!heading) return;

      // A heading that is already a link sorts through the server instead.
      if (heading.querySelector("a[data-sort]")) return;
      // The checkbox column has nothing to sort by, and a click in it is a
      // click on the checkbox.
      if (heading.classList.contains("pick")) return;
      // Anything the office can click inside a heading keeps its own click.
      if (target.closest("a, button, input, select, label")) return;

      const table = heading.closest("table.data") as HTMLTableElement | null;
      if (!table || table.dataset.nosort === "true") return;

      const head = table.tHead;
      const body = table.tBodies[0];
      if (!head || !body || body.rows.length < 2) return;

      const headings = [...head.rows[head.rows.length - 1].cells];
      const index = headings.indexOf(heading as HTMLTableCellElement);
      if (index < 0) return;

      const already = sortedBy.get(table);
      const dir: Dir = already && already.index === index && already.dir === "asc" ? "desc" : "asc";
      sortedBy.set(table, { index, dir });

      const kind = kindOf(body, index);
      const rows = [...body.rows];

      rows.sort((a, b) => {
        const left = textOf(a.cells[index] as HTMLTableCellElement);
        const right = textOf(b.cells[index] as HTMLTableCellElement);

        // An empty cell always sits at the bottom, whichever way round it is.
        if (!left && right) return 1;
        if (left && !right) return -1;
        if (!left && !right) return 0;

        let answer: number;
        if (kind === "money" || kind === "number") {
          answer = cleanNumber(left) - cleanNumber(right);
          if (Number.isNaN(answer)) answer = left.localeCompare(right);
        } else if (kind === "date") {
          answer = asDate(left) - asDate(right);
        } else {
          answer = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
        }

        return dir === "asc" ? answer : -answer;
      });

      // Putting the rows back in order is the sort. The striping is written
      // against odd and even children, so it corrects itself.
      for (const row of rows) body.appendChild(row);

      /**
       * The arrow is drawn by the stylesheet from this one attribute, so
       * nothing is inserted into the page. React does not manage it, and it is
       * only ever set in response to a click, which is long after the page has
       * settled.
       */
      for (const other of headings) delete other.dataset.sorted;
      (heading as HTMLTableCellElement).dataset.sorted = dir;
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
