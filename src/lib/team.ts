import "server-only";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, teamMembers } from "@/db/schema";

/*
 * The people in the office who go to the appointments.
 *
 * A short list of names and email addresses, kept apart from the login
 * accounts. The office adds Panayiotis in ten seconds and gets on with the
 * work, and the day's summary has somewhere to be sent.
 */

/**
 * Everybody, with how much is on each of them.
 *
 * Counted in two plain queries rather than one clever one: the team is a short
 * list and the appointments are read narrow, so the arithmetic is cheaper here
 * than a correlated subquery is to write correctly for two database engines.
 */
export async function listTeam() {
  const [people, load] = await Promise.all([
    db.select().from(teamMembers).orderBy(desc(teamMembers.isActive), asc(teamMembers.name)),
    db
      .select({
        assignedToId: appointments.assignedToId,
        at: appointments.at,
        status: appointments.status,
      })
      .from(appointments)
      .where(isNotNull(appointments.assignedToId)),
  ]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return people.map((member) => {
    const theirs = load.filter((row) => row.assignedToId === member.id);
    return {
      member,
      coming: theirs.filter((row) => row.status === "PLANNED" && new Date(row.at) >= today).length,
      waiting: theirs.filter((row) => row.status === "PLANNED" && new Date(row.at) < today).length,
    };
  });
}

/** The ones who can be given an appointment today. */
export async function whoCanGo() {
  return db
    .select({ id: teamMembers.id, name: teamMembers.name, email: teamMembers.email })
    .from(teamMembers)
    .where(eq(teamMembers.isActive, true))
    .orderBy(asc(teamMembers.name));
}

export async function oneMember(id: string) {
  const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
  return row ?? null;
}

/** Appointments still on somebody, which stops a delete from losing them. */
export async function whatIsOnThem(memberId: string) {
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(appointments)
    .where(eq(appointments.assignedToId, memberId));
  return counted?.total ?? 0;
}
