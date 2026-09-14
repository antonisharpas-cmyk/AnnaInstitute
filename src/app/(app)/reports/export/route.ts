import { getSessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  ageing,
  cashByMonth,
  costsByCategory,
  leadsBySource,
  rangeFrom,
  salesByAgent,
  salesByMonth,
  salesByProject,
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

    case "agents": {
      const agents = await salesByAgent(range);
      rows = [
        ["Agent", "Company", "Rate", "Sales", "Sold for", "Commission generated", "Paid", "Owed"],
        ...agents.map((row) => [
          row.agent.name,
          row.agent.company ?? "",
          Number(row.agent.commissionRate),
          row.sales,
          money(row.valueCents),
          money(row.generatedCents),
          money(row.paidCents),
          money(row.owedCents),
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
        ["Source", "Enquiries", "Became clients"],
        ...sources.map((row) => [row.source, row.total, row.converted]),
      ];
      break;
    }

    case "costs": {
      const categories = await costsByCategory(range);
      rows = [
        ["Category", "Invoices", "Billed", "Still owed"],
        ...categories.map((row) => [
          row.category,
          row.count,
          money(row.billedCents),
          money(row.owedCents),
        ]),
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
