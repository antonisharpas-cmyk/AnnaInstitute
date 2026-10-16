import "server-only";
import { monthPapers, packMonths, type PackItem } from "@/lib/accountantPack";
import { ourCompanies } from "@/lib/parties";
import type { Range } from "@/lib/reports";

/*
 * VAT, month by month: the VAT our companies charged against the VAT they
 * were charged, so the office can see before each return whether there is VAT
 * to pay or VAT to claim back.
 *
 * It reads the same papers the accountant receives, so the two always agree:
 *
 *   charged  the VAT on the invoices our companies issued, to buyers and under
 *            Company, less the VAT on the credit notes they issued
 *   paid     the VAT on the invoices received under Company, and on the
 *            payments made to the constructors and the agents
 *
 * Each paper counts in the month of its date: an invoice on the day it was
 * issued, a payment to a constructor or an agent on the day it was paid. A
 * paper that was voided or replaced does not count; a constructor payment
 * still pending does not count until it is paid. Receipts carry no VAT of
 * their own, since the VAT is on the invoice they settle.
 *
 * VAT is returned company by company, so every figure can be read for one of
 * our companies, several, or all of them together.
 */

export const VAT_PARTS = ["sales", "companyInvoices", "credits", "bills", "constructors", "agents"] as const;
export type VatPart = (typeof VAT_PARTS)[number];

/** Which side of the return each part is on: charged to others, or charged to us. */
export const VAT_SIDE: Record<VatPart, "charged" | "paid"> = {
  sales: "charged",
  companyInvoices: "charged",
  credits: "charged",
  bills: "paid",
  constructors: "paid",
  agents: "paid",
};

export type VatTotals = Record<VatPart, number> & { charged: number; paid: number; balance: number };

const empty = (): VatTotals =>
  Object.assign(Object.fromEntries(VAT_PARTS.map((one) => [one, 0])) as Record<VatPart, number>, { charged: 0, paid: 0, balance: 0 });

/** Which part of the report a paper belongs to, or none when it carries no VAT of its own or does not count. */
function partOf(item: PackItem): VatPart | null {
  if (item.state === "voided" || item.state === "cancelled") return null;
  switch (item.group) {
    case "invoice":
      return "sales";
    case "companyInvoice":
      return "companyInvoices";
    case "credit":
      return "credits";
    case "received":
      return "bills";
    case "constructor":
      return item.state === "pending" ? null : "constructors";
    case "commission":
      return "agents";
    default:
      return null;
  }
}

export type VatLine = {
  key: string;
  date: string;
  part: VatPart;
  company: string;
  companyId: string;
  number: string;
  party: string;
  about: string;
  netCents: number;
  vatCents: number;
  totalCents: number;
};

const finish = (totals: VatTotals) => {
  /* A credit note takes VAT back from what was charged. */
  totals.charged = totals.sales + totals.companyInvoices - totals.credits;
  totals.paid = totals.bills + totals.constructors + totals.agents;
  /* Positive is VAT to pay to the tax office, negative is VAT to claim back. */
  totals.balance = totals.charged - totals.paid;
  return totals;
};

export async function vatReport(range: Range, companyIds: string[]) {
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const from = key(range.from);
  const to = key(range.to);
  /* The months that have papers, within the period, oldest first. */
  const months = (await packMonths()).filter((month) => month >= from && month <= to).sort();
  const companies = await ourCompanies();
  const wanted = new Set(companyIds);

  const lines: VatLine[] = [];
  for (const month of months) {
    for (const item of await monthPapers(month)) {
      if (wanted.size > 0 && !wanted.has(item.companyId)) continue;
      const part = partOf(item);
      if (!part || item.vatCents === 0) continue;
      lines.push({
        key: item.key,
        date: item.date,
        part,
        company: item.company,
        companyId: item.companyId,
        number: item.number,
        party: item.party,
        about: item.about,
        netCents: item.netCents,
        vatCents: Math.abs(item.vatCents),
        totalCents: item.totalCents,
      });
    }
  }

  const byMonth = new Map<string, VatTotals>();
  const byCompany = new Map<string, VatTotals>();
  const totals = empty();
  for (const line of lines) {
    const month = key(new Date(line.date));
    const row = byMonth.get(month) ?? empty();
    row[line.part] += line.vatCents;
    byMonth.set(month, row);
    const company = byCompany.get(line.companyId) ?? empty();
    company[line.part] += line.vatCents;
    byCompany.set(line.companyId, company);
    totals[line.part] += line.vatCents;
  }

  return {
    months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, row]) => ({ month, ...finish(row) })),
    companies: [...byCompany.entries()].map(([id, row]) => ({
      id,
      name: companies.find((one) => one.id === id)?.name ?? lines.find((one) => one.companyId === id)?.company ?? "",
      ...finish(row),
    })),
    totals: finish(totals),
    /* Newest first, for the list at the end. */
    lines: lines.sort((a, b) => b.date.localeCompare(a.date)),
    companyChoices: companies,
  };
}
