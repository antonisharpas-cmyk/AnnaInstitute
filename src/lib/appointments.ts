import "server-only";
import { and, asc, desc, eq, gte, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { appointments, clients, leads } from "@/db/schema";

/*
 * Appointments: where the office is going, and who they are meeting.
 *
 * Three questions are asked of this table, and they are the three the office
 * actually asks. What is coming up. What happened yesterday that nobody has
 * said yes or no to yet. And, on one person's card, everything ever arranged
 * with them.
 *
 * The middle one is the reason the table exists. An appointment that was never
 * answered for is a viewing nobody followed up, and it is invisible on paper.
 */

export type Answer = "PLANNED" | "DONE" | "MISSED";

/** One appointment with whoever it is with, named. */
const selection = {
  appointment: appointments,
  client: clients,
  lead: leads,
};

/** The start of today, so a meeting at four this afternoon still counts as coming up. */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Waiting for an answer: planned, and the day it was on has been and gone.
 *
 * Not "before now", because an appointment at four o'clock is not unanswered at
 * five: the office is still in it. It becomes a question the following day,
 * which is exactly how they described it.
 */
export function unanswered(): SQL {
  return and(eq(appointments.status, "PLANNED"), lt(appointments.at, startOfToday())) as SQL;
}

export async function howManyNeedAnAnswer(): Promise<number> {
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(appointments)
    .where(unanswered());
  return counted?.total ?? 0;
}

export type AppointmentFilter = {
  q?: string;
  /** "next" for what is coming, "past" for what has been, "waiting" for the unanswered. */
  when?: string;
  status?: string;
};

export async function listAppointments(filter: AppointmentFilter) {
  const parts: SQL[] = [];

  const query = (filter.q ?? "").trim();
  if (query) {
    parts.push(
      or(
        ilike(appointments.place, `%${query}%`),
        ilike(clients.firstName, `%${query}%`),
        ilike(clients.lastName, `%${query}%`),
        ilike(leads.firstName, `%${query}%`),
        ilike(leads.lastName, `%${query}%`),
      ) as SQL,
    );
  }

  if (filter.status === "PLANNED" || filter.status === "DONE" || filter.status === "MISSED") {
    parts.push(eq(appointments.status, filter.status));
  }

  const when = filter.when ?? "next";
  if (when === "next") parts.push(gte(appointments.at, startOfToday()));
  if (when === "past") parts.push(lt(appointments.at, startOfToday()));
  if (when === "waiting") parts.push(unanswered());

  const where = parts.length > 0 ? and(...parts) : undefined;

  const rows = await db
    .select(selection)
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .where(where)
    /* What is coming up reads soonest first. What has been reads latest first. */
    .orderBy(when === "next" ? asc(appointments.at) : desc(appointments.at))
    .limit(400);

  return rows;
}

/** Everything ever arranged with one client, soonest first among what is left. */
export async function appointmentsForClient(clientId: string) {
  return db
    .select()
    .from(appointments)
    .where(eq(appointments.clientId, clientId))
    .orderBy(desc(appointments.at));
}

export async function appointmentsForLead(leadId: string) {
  return db
    .select()
    .from(appointments)
    .where(eq(appointments.leadId, leadId))
    .orderBy(desc(appointments.at));
}

/** Clients and enquiries an appointment can be made with. */
export async function whoCanBeMet() {
  const [people, enquiries] = await Promise.all([
    db
      .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName })
      .from(clients)
      .where(isNull(clients.deletedAt))
      .orderBy(asc(clients.lastName), asc(clients.firstName)),
    db
      .select({ id: leads.id, firstName: leads.firstName, lastName: leads.lastName })
      .from(leads)
      .where(and(isNull(leads.deletedAt), isNull(leads.clientId)))
      .orderBy(asc(leads.createdAt)),
  ]);

  return { clients: people, leads: enquiries };
}

/** Is this one still waiting for somebody to say whether it happened? */
export function needsAnAnswer(row: { status: Answer; at: Date }): boolean {
  return row.status === "PLANNED" && new Date(row.at) < startOfToday();
}
