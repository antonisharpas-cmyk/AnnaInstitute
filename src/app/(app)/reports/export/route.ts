import { getSessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { saleLines } from "@/lib/apartmentSales";
import { many } from "@/lib/filters";
import { vatReport } from "@/lib/vatReport";
import {
  ageing,
  cashByMonth,
  cashEntryLines,
  commissionsAreOurs,
  costsByCategory,
  leadsBySource,
  projectsInScope,
  rangeFrom,
  salesByAgent,
  salesByMonth,
  salesByProject,
  scopeFrom,
} from "@/lib/reports";

/**
 * A report as a spreadsheet.
 *
 * The office lives in Excel, so every report can leave the CRM as a CSV of the
 * same figures that are on the screen, for the same period. Nothing is computed
 * differently here: the download calls the same functions the page does.
 */

const money = (cents: number) => (cents / 100).toFixed(2);

/** One CSV cell, quoted when it has to be. */
function cell(value: string | number): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: (string | number)[][]): string {
  // Excel opens a UTF-8 file properly when it starts with a byte order mark,
  // which is what makes Greek names readable rather than mojibake.
  return `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const url = new URL(request.url);
  const report = url.searchParams.get("report") ?? "projects";
  const { range } = rangeFrom({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  /* Developments, companies and shareholders, the same as on the screen. */
  const scope = scopeFrom({
    project: url.searchParams.get("project") ?? undefined,
    partner: url.searchParams.get("partner") ?? undefined,
    holder: url.searchParams.get("holder") ?? undefined,
  });

  let rows: (string | number)[][];

  switch (report) {
    case "sales": {
      const monthly = await salesByMonth(range);
      rows = [
        ["Month", "Contracts", "Value before VAT"],
        ...monthly.map((row) => [row.month, row.count, money(row.valueCents)]),
      ];
      break;
    }

    case "apartments": {
      /* Apartment Sales opens on everything, and its download does the same. */
      const period = url.searchParams.get("period") ?? (url.searchParams.get("from") || url.searchParams.get("to") ? undefined : "all");
      const span =
        period === "all"
          ? { from: new Date(2000, 0, 1), to: new Date(2100, 0, 1) }
          : rangeFrom({ period, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined }).range;
      const only = await projectsInScope(scope);
      const lines = await saleLines(span, only);
      rows = [
        [
          "Development", "Apartment", "Contract", "Date", "Buyer", "Stage", "VAT rate",
          "Agreed before VAT", "Received before VAT", "Agreed with VAT", "Received with VAT",
          "Cash agreed", "Cash received", "Reduced VAT", "VAT saved", "Penalties", "Refunds", "Credit notes", "Overdue",
        ],
        ...lines.map((line) => [
          line.project, line.unit, line.reference, line.date ? line.date.toISOString().slice(0, 10) : "", line.buyer,
          line.stage, line.vatRate,
          money(line.netAgreed), money(line.netReceived), money(line.grossAgreed), money(line.grossReceived),
          money(line.cashAgreed), money(line.cashReceived), line.reducedVat ? "Yes" : "No", money(line.vatSaved),
          money(line.penalties), money(line.refunds), line.creditNotes, money(line.overdueCents),
        ]),
      ];
      break;
    }

    case "vat": {
      /* One Eleven's own books travel as "oneEleven", every other company by its id. */
      const companies = many(url.searchParams.get("companies") ?? undefined).map((one) => (one === "oneEleven" ? "" : one));
      const vat = await vatReport(range, companies);
      rows = [
        [
          "Month", "VAT on invoices to buyers", "VAT on our company invoices", "VAT on credit notes", "VAT charged",
          "VAT on bills received", "VAT to constructors", "VAT to agents", "VAT paid", "Balance (to pay if positive, to claim back if negative)",
        ],
        ...vat.months.map((row) => [
          row.month, money(row.sales), money(row.companyInvoices), money(-row.credits), money(row.charged),
          money(row.bills), money(row.constructors), money(row.agents), money(row.paid), money(row.balance),
        ]),
        [
          "Total", money(vat.totals.sales), money(vat.totals.companyInvoices), money(-vat.totals.credits), money(vat.totals.charged),
          money(vat.totals.bills), money(vat.totals.constructors), money(vat.totals.agents), money(vat.totals.paid), money(vat.totals.balance),
        ],
      ];
      break;
    }

    case "agents": {
      const agents = await salesByAgent(range, await projectsInScope(scope), commissionsAreOurs(scope));
      rows = [
        [
          "Agent", "Company", "Rate", "VAT rate", "Sales", "Sold for",
          "Commission generated before VAT", "Commission generated with VAT",
          "Paid before VAT", "Paid with VAT", "Owed before VAT", "Owed with VAT",
        ],
        ...agents.map((row) => [
          row.agent.name,
          row.agent.company ?? "",
          Number(row.agent.commissionRate),
          Number(row.agent.vatRate),
          row.sales,
          money(row.valueCents),
          money(row.generatedCents),
          money(row.generatedTotalCents),
          money(row.paidCents),
          money(row.paidTotalCents),
          money(row.owedCents),
          money(row.owedTotalCents),
        ]),
      ];
      break;
    }

    case "cash": {
      const cash = await cashByMonth(range);
      rows = [
        ["Month", "Due", "Collected"],
        ...cash.map((row) => [row.month, money(row.dueCents), money(row.paidCents)]),
      ];
      break;
    }

    case "ageing": {
      const late = await ageing();
      rows = [
        ["Client", "Apartment", "Stage", "Due on", "Days late", "Outstanding"],
        ...late.lines.map((line) => [
          line.client,
          line.where,
          line.label,
          new Date(line.dueDate).toISOString().slice(0, 10),
          line.days,
          money(line.outstandingCents),
        ]),
      ];
      break;
    }

    case "leads": {
      const sources = await leadsBySource(range);
      rows = [
        ["Source", "Leads", "Became clients"],
        ...sources.map((row) => [row.source, row.total, row.converted]),
      ];
      break;
    }

    case "costs": {
      const only = await projectsInScope(scope);
      const [income, costs, cash] = await Promise.all([
        costsByCategory(range, only, "OUT"),
        costsByCategory(range, only, "IN"),
        cashEntryLines(range, only),
      ]);
      /* Cash paid and received outside the invoices, by category, paid in full. */
      const cashBy = (incoming: boolean) => {
        const by = new Map<string, { count: number; cents: number }>();
        for (const row of cash.filter((one) => one.income === incoming)) {
          const one = by.get(row.category) ?? { count: 0, cents: 0 };
          one.count += 1;
          one.cents += row.cents;
          by.set(row.category, one);
        }
        return [...by.entries()];
      };
      rows = [
        ["Which", "Category", "Lines", "Billed", "Still owed"],
        ...income.map((row) => ["Income", row.category, row.count, money(row.billedCents), money(row.owedCents)]),
        ...costs.map((row) => ["Expense", row.category, row.count, money(row.billedCents), money(row.owedCents)]),
        ...cashBy(true).map(([category, row]) => ["Cash income", category, row.count, money(row.cents), money(0)]),
        ...cashBy(false).map(([category, row]) => ["Cash expense", category, row.count, money(row.cents), money(0)]),
      ];
      break;
    }

    default: {
      const projects = await salesByProject();
      rows = [
        [
          "Development",
          "Location",
          "Status",
          "Apartments",
          "Sold",
          "Reserved",
          "Available",
          "List price",
          "Sold for",
          "Against asking price",
          "Per square metre",
        ],
        ...projects.map((row) => [
          row.project.name,
          row.project.location ?? "",
          row.project.status,
          row.total,
          row.sold,
          row.reserved,
          row.available,
          money(row.listCents),
          money(row.contractedCents),
          money(row.differenceCents),
          money(row.perSquareMetre),
        ]),
      ];
    }
  }

  await recordAudit({
    action: "report.export",
    entity: "report",
    detail: report,
    userId: user.id,
    userEmail: user.email,
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="oneeleven-${report}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
