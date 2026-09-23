import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { leadFollowUps, leads, teamMembers } from "@/db/schema";

/**
 * What happens next on an enquiry.
 *
 * A note says what happened. A follow up says what happens next, on a day, and
 * it refuses to be forgotten: from the evening before its date it sits in the
 * notifications, and it stays there until somebody marks it done. The person it
 * nags is whoever the enquiry belongs to, which is why the lead carries a name.
 *
 * The office asked for this in one sentence: the next meeting, a small note,
 * and an email the night before. Everything here is that sentence.
 */

export type FollowUpRow = {
  id: string;
  leadId: string;
  at: Date;
  note: string | null;
  status: "PENDING" | "DONE";
  doneAt: Date | null;
};

/** Every follow up on one enquiry, the soonest first. */
export async function followUpsForLead(leadId: string): Promise<FollowUpRow[]> {
  const rows = await db
    .select()
    .from(leadFollowUps)
    .where(eq(leadFollowUps.leadId, leadId))
    .orderBy(asc(leadFollowUps.at));

  return rows.map((row) => ({
    id: row.id,
    leadId: row.leadId,
    at: row.at,
    note: row.note,
    status: row.status,
    doneAt: row.doneAt,
  }));
}

/** Midnight this morning, in the office's own day rather than in UTC. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfDay(offset: number): Date {
  const day = startOfToday();
  day.setDate(day.getDate() + offset);
  return day;
}

/**
 * The follow ups that are pressing.
 *
 * Pressing means pending and within a day: a follow up due tomorrow appears
 * this evening, one due today is there all day, and one nobody answered for
 * stays until they do. That is the whole rule the office asked for, which is
 * why it is one comparison rather than a policy.
 */
export async function pressingFollowUps() {
  const edge = startOfDay(2); // anything due before the end of tomorrow

  return db
    .select({
      followUp: leadFollowUps,
      lead: leads,
      member: teamMembers,
    })
    .from(leadFollowUps)
    .innerJoin(leads, eq(leads.id, leadFollowUps.leadId))
    .leftJoin(teamMembers, eq(teamMembers.id, leads.assignedToId))
    .where(and(eq(leadFollowUps.status, "PENDING"), lte(leadFollowUps.at, edge)))
    .orderBy(asc(leadFollowUps.at));
}

/** How many are pressing, for the bell. */
export async function pressingFollowUpCount(): Promise<number> {
  const edge = startOfDay(2);
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(leadFollowUps)
    .where(and(eq(leadFollowUps.status, "PENDING"), lte(leadFollowUps.at, edge)));
  return row?.total ?? 0;
}

/**
 * Tomorrow's follow ups, for the email that goes out in the evening.
 *
 * Offset 1 is tomorrow, which is what the office asked for. Offset 0 is today,
 * which is what the Send now button on the settings page shows so that somebody
 * can see the shape of the letter without waiting until nine at night.
 */
export async function followUpsOnDay(offset: number) {
  const from = startOfDay(offset);
  const to = startOfDay(offset + 1);

  return db
    .select({
      followUp: leadFollowUps,
      lead: leads,
      member: teamMembers,
    })
    .from(leadFollowUps)
    .innerJoin(leads, eq(leads.id, leadFollowUps.leadId))
    .leftJoin(teamMembers, eq(teamMembers.id, leads.assignedToId))
    .where(
      and(
        eq(leadFollowUps.status, "PENDING"),
        sql`${leadFollowUps.at} >= ${from} and ${leadFollowUps.at} < ${to}`,
      ),
    )
    .orderBy(asc(leadFollowUps.at));
}
