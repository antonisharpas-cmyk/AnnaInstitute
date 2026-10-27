import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { agents, clients, leads } from "@/db/schema";
import { phoneProblem } from "@/lib/phoneCheck";

export type PhoneToCheck = { kind: "agent" | "client" | "lead"; id: string; name: string; phone: string; problem: string; href: string };

/**
 * Every agent, client and lead whose mobile, as written, an SMS cannot reach:
 * a UK number without +44, a landline, a number too short. For the office to
 * fix before a campaign, rather than finding them among the failed messages.
 */
export async function phonesToCheck(): Promise<PhoneToCheck[]> {
  const [agentRows, clientRows, leadRows] = await Promise.all([
    db.select({ id: agents.id, name: agents.name, phone: agents.phone }).from(agents).where(and(eq(agents.isActive, true), isNotNull(agents.phone))),
    db
      .select({ id: clients.id, first: clients.firstName, last: clients.lastName, phone: clients.phone })
      .from(clients)
      .where(and(isNull(clients.deletedAt), isNull(clients.closedAt), isNotNull(clients.phone))),
    db
      .select({ id: leads.id, first: leads.firstName, last: leads.lastName, phone: leads.phone })
      .from(leads)
      .where(and(isNull(leads.deletedAt), isNull(leads.clientId), isNotNull(leads.phone))),
  ]);
  const out: PhoneToCheck[] = [];
  for (const a of agentRows) {
    const problem = phoneProblem(a.phone);
    if (problem) out.push({ kind: "agent", id: a.id, name: a.name, phone: a.phone ?? "", problem, href: `/agents/${a.id}` });
  }
  for (const c of clientRows) {
    const problem = phoneProblem(c.phone);
    if (problem) out.push({ kind: "client", id: c.id, name: `${c.first ?? ""} ${c.last ?? ""}`.trim(), phone: c.phone ?? "", problem, href: `/clients/${c.id}` });
  }
  for (const l of leadRows) {
    const problem = phoneProblem(l.phone);
    if (problem) out.push({ kind: "lead", id: l.id, name: `${l.first ?? ""} ${l.last ?? ""}`.trim() || "?", phone: l.phone ?? "", problem, href: `/leads/${l.id}` });
  }
  return out;
}
