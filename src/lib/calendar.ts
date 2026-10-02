import "server-only";
import { and, asc, eq, gte, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agents, appointments, clients, leadFollowUps, leads, projects, teamMembers } from "@/db/schema";

/**
 * The calendar: every appointment and every follow up, on its day.
 *
 * Nothing is kept for it. It reads the same two tables the Appointments and
 * Follow ups sections read, so an appointment booked or a follow up written
 * anywhere in the CRM is on the calendar the moment the page is next drawn,
 * and the page draws itself again every minute while it is open.
 *
 * Three things narrow it: whose they are, which development they are about,
 * and the days. A development counts for an appointment at its building, for a
 * client with an apartment or a contract in it, and for a lead that asked
 * about it.
 */

export type CalendarStatus = "pending" | "done" | "cancelled";

export type CalendarItem = {
  id: string;
  kind: "appointment" | "followUp";
  at: string;
  status: CalendarStatus;
  /** Pending with its day gone. Still yellow, with a word that says so. */
  late: boolean;
  who: string;
  whoKind: "client" | "lead" | "agent" | "other";
  whoHref: string | null;
  /** What it is: the place of an appointment, the note of a follow up. */
  what: string;
  member: string | null;
  /** Where the line opens: the person's own record, or the section. */
  href: string;
};

export type CalendarFilter = { from: Date; to: Date; member?: string; project?: string };

const name = (first: string | null | undefined, last: string | null | undefined) =>
  `${first ?? ""} ${last ?? ""}`.trim();

/** Is this client, by id, in the development: an apartment, or a contract on one there? */
function clientInProject(clientId: SQL | typeof appointments.clientId, projectId: string): SQL {
  return sql`exists (
    select 1 from units u
    where u.project_id = ${projectId}
      and (u.client_id = ${clientId}
        or exists (select 1 from contracts c where c.unit_id = u.id and c.client_id = ${clientId} and c.status <> 'CANCELLED'))
  )`;
}

export async function calendarItems(filter: CalendarFilter): Promise<CalendarItem[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  /* The appointments. */
  const meet: SQL[] = [gte(appointments.at, filter.from), lt(appointments.at, filter.to)];
  if (filter.member === "nobody") meet.push(isNull(appointments.assignedToId));
  else if (filter.member) meet.push(eq(appointments.assignedToId, filter.member));
  if (filter.project) {
    meet.push(
      or(
        eq(appointments.projectId, filter.project),
        eq(leads.projectId, filter.project),
        clientInProject(appointments.clientId, filter.project),
      ) as SQL,
    );
  }
  const meetings = await db
    .select({
      appointment: appointments,
      client: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName },
      lead: { id: leads.id, firstName: leads.firstName, lastName: leads.lastName, email: leads.email },
      agent: { id: agents.id, name: agents.name },
      project: { id: projects.id, name: projects.name },
      member: { name: teamMembers.name },
    })
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .leftJoin(agents, eq(agents.id, appointments.agentId))
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .leftJoin(teamMembers, eq(teamMembers.id, appointments.assignedToId))
    .where(and(...meet))
    .orderBy(asc(appointments.at))
    .limit(2000);

  /* The follow ups. Whose they are is their own person, or the lead's. */
  const whose = sql<string | null>`coalesce(${leadFollowUps.assignedToId}, ${leads.assignedToId})`;
  const follow: SQL[] = [gte(leadFollowUps.at, filter.from), lt(leadFollowUps.at, filter.to)];
  if (filter.member === "nobody") follow.push(sql`${whose} is null` as SQL);
  else if (filter.member) follow.push(sql`${whose} = ${filter.member}` as SQL);
  if (filter.project) {
    follow.push(
      or(
        eq(leads.projectId, filter.project),
        clientInProject(sql`${leadFollowUps.clientId}`, filter.project),
        clientInProject(sql`${leads.clientId}`, filter.project),
      ) as SQL,
    );
  }
  const followUps = await db
    .select({
      followUp: leadFollowUps,
      client: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName },
      lead: { id: leads.id, firstName: leads.firstName, lastName: leads.lastName, email: leads.email },
      agent: { id: agents.id, name: agents.name },
      member: { name: teamMembers.name },
    })
    .from(leadFollowUps)
    .leftJoin(leads, eq(leads.id, leadFollowUps.leadId))
    .leftJoin(clients, eq(clients.id, leadFollowUps.clientId))
    .leftJoin(agents, eq(agents.id, leadFollowUps.agentId))
    .leftJoin(teamMembers, eq(teamMembers.id, whose))
    .where(and(...follow))
    .orderBy(asc(leadFollowUps.at))
    .limit(2000);

  const items: CalendarItem[] = [];

  for (const row of meetings) {
    const a = row.appointment;
    const person =
      row.client?.id
        ? { who: name(row.client.firstName, row.client.lastName) || "?", whoKind: "client" as const, whoHref: `/clients/${row.client.id}` }
        : row.lead?.id
          ? { who: name(row.lead.firstName, row.lead.lastName) || row.lead.email || "?", whoKind: "lead" as const, whoHref: `/leads/${row.lead.id}` }
          : row.agent?.id
            ? { who: row.agent.name, whoKind: "agent" as const, whoHref: `/agents/${row.agent.id}` }
            : { who: a.otherName ?? "?", whoKind: "other" as const, whoHref: null };
    /* The place as it was written when it was booked, which is what the letter said. */
    let what = a.place;
    if (row.project?.name && !what.includes(row.project.name)) what = `${what}, ${row.project.name}`;
    const status: CalendarStatus = a.status === "DONE" ? "done" : a.status === "MISSED" ? "cancelled" : "pending";
    items.push({
      id: a.id,
      kind: "appointment",
      at: new Date(a.at).toISOString(),
      status,
      late: status === "pending" && new Date(a.at) < startOfToday,
      ...person,
      what,
      member: row.member?.name ?? null,
      href: person.whoHref ? `${person.whoHref}${person.whoKind === "client" ? "?tab=appointments" : ""}` : "/appointments",
    });
  }

  for (const row of followUps) {
    const f = row.followUp;
    const person =
      row.lead?.id
        ? { who: name(row.lead.firstName, row.lead.lastName) || row.lead.email || "?", whoKind: "lead" as const, whoHref: `/leads/${row.lead.id}` }
        : row.client?.id
          ? { who: name(row.client.firstName, row.client.lastName) || "?", whoKind: "client" as const, whoHref: `/clients/${row.client.id}` }
          : row.agent?.id
            ? { who: row.agent.name, whoKind: "agent" as const, whoHref: `/agents/${row.agent.id}` }
            : { who: f.otherName ?? "?", whoKind: "other" as const, whoHref: null };
    const status: CalendarStatus = f.status === "DONE" ? "done" : f.status === "CANCELLED" ? "cancelled" : "pending";
    items.push({
      id: f.id,
      kind: "followUp",
      at: new Date(f.at).toISOString(),
      status,
      late: status === "pending" && new Date(f.at) < startOfToday,
      ...person,
      what: f.note ?? "",
      member: row.member?.name ?? null,
      href: person.whoHref ? `${person.whoHref}${person.whoKind === "client" ? "?tab=followups" : ""}` : "/follow-ups",
    });
  }

  return items.sort((x, y) => x.at.localeCompare(y.at));
}

/** The developments, for the filter. */
export async function calendarProjects() {
  return db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name));
}
