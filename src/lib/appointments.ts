import "server-only";
import { choiceFilter } from "@/lib/choices/filter";
import { and, asc, desc, eq, gte, ilike, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { appointments, clients, leads, teamMembers } from "@/db/schema";

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

/** One appointment with whoever it is with and whoever is going, both named. */
const selection = {
  appointment: appointments,
  client: clients,
  lead: leads,
  member: teamMembers,
};

/** The start of today, so a meeting at four this afternoon still counts as coming up. */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * The days a named period covers, as a start and an end the end not included.
 *
 * A week is Monday to Sunday, the way the office plans one. Two typed days
 * cover both of them whole. A named period wins over typed days, so a link
 * sent as "this week" means this week whoever opens it.
 */
export const PERIODS = ["today", "tomorrow", "thisWeek", "next7", "nextWeek", "thisMonth"] as const;

export function periodOf(filter: { when?: string; from?: string; to?: string }): { from?: Date; to?: Date } {
  const today = startOfToday();
  const plus = (base: Date, days: number) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  const monday = plus(today, -((today.getDay() + 6) % 7));
  switch (filter.when) {
    case "today":
      return { from: today, to: plus(today, 1) };
    case "tomorrow":
      return { from: plus(today, 1), to: plus(today, 2) };
    case "thisWeek":
      return { from: monday, to: plus(monday, 7) };
    case "next7":
      return { from: today, to: plus(today, 7) };
    case "nextWeek":
      return { from: plus(monday, 7), to: plus(monday, 14) };
    case "thisMonth":
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: new Date(today.getFullYear(), today.getMonth() + 1, 1),
      };
  }
  const day = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const from = day(filter.from);
  const until = day(filter.to);
  return { from, to: until ? plus(until, 1) : undefined };
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
  /** A period by name: today, tomorrow, thisWeek, next7, nextWeek, thisMonth. */
  when?: string;
  /** Or two days, as the date fields send them. */
  from?: string;
  to?: string;
  /**
   * What to show, in the office's own words: everything, the ones still to
   * come, the ones that were done, the ones that were cancelled, or the ones
   * whose day has passed with nobody saying which.
   */
  show?: string;
  q_unused?: never;
  status?: string;
  /** One person's own appointments, which is what they came to the page for. */
  assignedTo?: string;
  /** One of the six kinds. */
  type?: string;
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

  /*
    The filter says the same words as the status.

    An appointment is Pending from the moment it is made, Done when somebody
    in the office says it happened, or Cancelled. The filter offers exactly
    those, so what a row says and what the filter asks for can never disagree,
    which is what the office meant by "the same logic and terminology".

    Two older words are still understood so that links made before today keep
    working: upcoming is pending from today on, and waiting is pending with its
    day already gone, which is what the bell points at.
  */
  const show = filter.show ?? "all";
  if (show === "pending") {
    parts.push(eq(appointments.status, "PLANNED"));
  } else if (show === "upcoming") {
    parts.push(eq(appointments.status, "PLANNED"));
    parts.push(gte(appointments.at, startOfToday()));
  } else if (show === "done") {
    parts.push(eq(appointments.status, "DONE"));
  } else if (show === "cancelled") {
    parts.push(eq(appointments.status, "MISSED"));
  } else if (show === "waiting") {
    parts.push(unanswered());
  }

  const range = periodOf(filter);
  if (range.from) parts.push(gte(appointments.at, range.from));
  if (range.to) parts.push(lt(appointments.at, range.to));

  if (filter.assignedTo === "nobody") parts.push(isNull(appointments.assignedToId));
  else if (filter.assignedTo) parts.push(eq(appointments.assignedToId, filter.assignedTo));

  const KINDS = ["TIMBER", "BATHROOMS_TILES", "OFFICE", "PHONE_CALL", "BUILDING", "OTHER"];
  const byKind = filter.type ? choiceFilter(appointments.type, appointments.typeChoice, filter.type.split(",").filter(Boolean), KINDS) : null;
  if (byKind) parts.push(byKind);

  const where = parts.length > 0 ? and(...parts) : undefined;

  const rows = await db
    .select(selection)
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .leftJoin(teamMembers, eq(teamMembers.id, appointments.assignedToId))
    .where(where)
    /* What is still to happen reads soonest first, so an overdue one is at the
       top where it cannot be missed. What has happened reads latest first. */
    .orderBy(
      show === "pending" || show === "upcoming" || show === "waiting"
        ? asc(appointments.at)
        : desc(appointments.at),
    )
    .limit(400);

  return rows;
}

/**
 * Everything ever arranged with one client, with the name of whoever is going.
 *
 * The name is joined in rather than looked up per row, because the card shows
 * it against every line and an appointment with nobody's name on it is the one
 * thing the office most wants to see.
 */
const withMember = {
  id: appointments.id,
  place: appointments.place,
  at: appointments.at,
  status: appointments.status,
  /* What it reads as: the office's own kind from the Builder while it still counts as the built in one. */
  type: sql<string>`case when ${appointments.typeChoice} like ${appointments.type}::text || '~%' then ${appointments.typeChoice} else ${appointments.type}::text end`,
  typeOther: appointments.typeOther,
  assignedToId: appointments.assignedToId,
  assignedToName: teamMembers.name,
};

export async function appointmentsForClient(clientId: string) {
  return db
    .select(withMember)
    .from(appointments)
    .leftJoin(teamMembers, eq(teamMembers.id, appointments.assignedToId))
    .where(eq(appointments.clientId, clientId))
    .orderBy(desc(appointments.at));
}

export async function appointmentsForLead(leadId: string) {
  return db
    .select(withMember)
    .from(appointments)
    .leftJoin(teamMembers, eq(teamMembers.id, appointments.assignedToId))
    .where(eq(appointments.leadId, leadId))
    .orderBy(desc(appointments.at));
}

/** Clients and enquiries an appointment can be made with. */
export async function whoCanBeMet() {
  const [people, enquiries] = await Promise.all([
    db
      .select({
        id: clients.id,
        firstName: clients.firstName,
        lastName: clients.lastName,
        phone: clients.phone,
        email: clients.email,
      })
      .from(clients)
      /* Not the ones who walked away: bring them back first, then meet them. */
      .where(and(isNull(clients.deletedAt), isNull(clients.closedAt)))
      .orderBy(asc(clients.lastName), asc(clients.firstName)),
    db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        phone: leads.phone,
        email: leads.email,
      })
      .from(leads)
      .where(and(isNull(leads.deletedAt), isNull(leads.clientId), ne(leads.status, "CONVERTED")))
      .orderBy(asc(leads.createdAt)),
  ]);

  return { clients: people, leads: enquiries };
}

/** Is this one still waiting for somebody to say whether it happened? */
export function needsAnAnswer(row: { status: Answer; at: Date }): boolean {
  return row.status === "PLANNED" && new Date(row.at) < startOfToday();
}
