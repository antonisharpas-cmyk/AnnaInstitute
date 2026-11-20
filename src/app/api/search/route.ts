import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  clients,
  contracts,
  expenses,
  leads,
  partners,
  projects,
  subowners,
  units,
} from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { wordsMatch } from "@/lib/search";

/**
 * One search for the whole CRM.
 *
 * A surname, a telephone number, an apartment code, a contract reference or a
 * supplier: whatever somebody remembers about a record, typed in one box. Five
 * results per kind, so the answer is short enough to read rather than scroll.
 */

export type Hit = { title: string; subtitle: string; href: string };
export type HitGroup = { key: string; items: Hit[] };

const LIMIT = 5;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ groups: [] }, { status: 401 });

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ groups: [] });


  const [
    clientRows,
    projectRows,
    unitRows,
    contractRows,
    leadRows,
    agentRows,
    partnerRows,
    invoiceRows,
    contactRows,
  ] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(
        and(
          isNull(clients.deletedAt),
          wordsMatch(query, [clients.firstName, clients.lastName, clients.email, clients.phone, clients.idNumber, clients.secondFirstName, clients.secondLastName, clients.secondIdNumber]),
        ),
      )
      .limit(LIMIT),
    db
      .select()
      .from(projects)
      .where(wordsMatch(query, [projects.name, projects.location]))
      .limit(LIMIT),
    db
      .select({ unit: units, project: projects })
      .from(units)
      .innerJoin(projects, eq(projects.id, units.projectId))
      .where(wordsMatch(query, [units.code]))
      .limit(LIMIT),
    db
      .select({ contract: contracts, client: clients, unit: units })
      .from(contracts)
      .leftJoin(clients, eq(clients.id, contracts.clientId))
      .leftJoin(units, eq(units.id, contracts.unitId))
      .where(wordsMatch(query, [contracts.reference]))
      .limit(LIMIT),
    db
      .select()
      .from(leads)
      .where(
        and(
          isNull(leads.deletedAt),
          wordsMatch(query, [leads.firstName, leads.lastName, leads.email, leads.phone]),
        ),
      )
      .limit(LIMIT),
    db
      .select()
      .from(agents)
      .where(wordsMatch(query, [agents.name, agents.company, agents.email]))
      .limit(LIMIT),
    db
      .select()
      .from(subowners)
      .where(
        wordsMatch(query, [subowners.name, subowners.company, subowners.contactName]),
      )
      .limit(LIMIT),
    db
      .select()
      .from(expenses)
      .where(wordsMatch(query, [expenses.supplier, expenses.reference]))
      .limit(LIMIT),
    db
      .select()
      .from(partners)
      .where(wordsMatch(query, [partners.name, partners.email, partners.mobile]))
      .limit(LIMIT),
  ]);

  const groups: HitGroup[] = [
    {
      key: "clients",
      items: clientRows.map((row) => ({
        title: `${row.firstName} ${row.lastName}`.trim(),
        subtitle: [row.email, row.phone].filter(Boolean).join(" . "),
        href: `/clients/${row.id}`,
      })),
    },
    {
      key: "projects",
      items: projectRows.map((row) => ({
        title: row.name,
        subtitle: row.location ?? "",
        href: `/projects/${row.id}`,
      })),
    },
    {
      key: "units",
      items: unitRows.map((row) => ({
        title: `${row.project.name} ${row.unit.code}`,
        subtitle: row.unit.status.toLowerCase(),
        href: `/projects/${row.project.id}/units/${row.unit.id}`,
      })),
    },
    {
      key: "contracts",
      items: contractRows.map((row) => ({
        title: row.contract.reference,
        subtitle: [
          row.client ? `${row.client.firstName} ${row.client.lastName}` : null,
          row.unit?.code,
        ]
          .filter(Boolean)
          .join(" . "),
        href: `/contracts/${row.contract.id}`,
      })),
    },
    {
      key: "leads",
      items: leadRows.map((row) => ({
        title: [row.firstName, row.lastName].filter(Boolean).join(" ") || "Lead",
        subtitle: [row.email, row.phone].filter(Boolean).join(" . "),
        href: `/leads/${row.id}`,
      })),
    },
    {
      key: "agents",
      items: agentRows.map((row) => ({
        title: row.name,
        subtitle: row.company ?? "",
        href: `/agents/${row.id}`,
      })),
    },
    {
      key: "subowners",
      items: partnerRows.map((row) => ({
        title: row.name,
        subtitle: row.company ?? row.contactName ?? "",
        href: `/subowners/${row.id}`,
      })),
    },
    {
      key: "partners",
      items: contactRows.map((row) => ({
        title: row.name,
        subtitle: [row.email, row.mobile].filter(Boolean).join(" . "),
        href: `/partners/${row.id}`,
      })),
    },
    {
      key: "invoices",
      items: invoiceRows.map((row) => ({
        title: row.supplier,
        subtitle: [row.reference, row.category.toLowerCase()].filter(Boolean).join(" . "),
        href: `/invoices/${row.id}`,
      })),
    },
  ].filter((group) => group.items.length > 0);

  return NextResponse.json({ groups });
}
