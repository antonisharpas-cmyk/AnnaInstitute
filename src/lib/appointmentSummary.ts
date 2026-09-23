import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { appointments, clients, leads, teamMembers } from "@/db/schema";
import { sendAndRecord } from "@/lib/messaging";
import { readSettings, writeSetting } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";
import { followUpsOnDay } from "@/lib/followUps";

/*
 * The day's summary, one email per person.
 *
 * At the end of the day everybody who was given something gets a list of what
 * they had, what came of it, and what is on them tomorrow. That is the whole
 * feature, and it exists for one reason: an appointment nobody answered for is
 * a viewing nobody followed up, and a list read at nine in the evening is how
 * the office notices.
 */

export type SummaryLine = {
  time: string;
  who: string;
  place: string;
  kind: string;
  status: "PLANNED" | "DONE" | "MISSED";
};

/** One follow up on one enquiry, as the email prints it. */
export type FollowUpLine = {
  time: string;
  who: string;
  note: string;
};

export type MemberSummary = {
  id: string;
  name: string;
  email: string | null;
  today: SummaryLine[];
  tomorrow: SummaryLine[];
  /**
   * The enquiries this person is going back to tomorrow.
   *
   * In the same letter as the appointments rather than in one of its own, which
   * is what the office asked for: one message a night, one place to look before
   * going home.
   */
  followUps: FollowUpLine[];
};

/** Midnight at the start of a day, some number of days from today. */
export function dayStart(offsetDays = 0): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
}

const clock = (at: Date) =>
  new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

const dateOf = (at: Date) =>
  new Date(at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

/** The six kinds, in English, for an email that carries no stylesheet. */
const KIND: Record<string, string> = {
  TIMBER: "Timber, Ocriam",
  BATHROOMS_TILES: "Bathrooms and tiles, Studio Bagno",
  OFFICE: "In the office",
  PHONE_CALL: "A call",
  BUILDING: "In the building",
  OTHER: "Other",
};

const STATUS: Record<string, string> = {
  PLANNED: "Pending",
  DONE: "Done",
  MISSED: "Did not happen",
};

/** Everything on one day, with the person it is with named. */
async function linesFor(from: Date, to: Date) {
  const rows = await db
    .select({ appointment: appointments, client: clients, lead: leads })
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .where(and(gte(appointments.at, from), lt(appointments.at, to)))
    .orderBy(asc(appointments.at));

  return rows.map(({ appointment, client, lead }) => ({
    assignedToId: appointment.assignedToId,
    line: {
      time: clock(appointment.at),
      who: client
        ? `${client.firstName} ${client.lastName}`.trim()
        : lead
          ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "an enquiry"
          : "nobody named",
      place: appointment.place,
      kind: KIND[appointment.type] ?? appointment.type,
      status: appointment.status,
    } satisfies SummaryLine,
  }));
}

/**
 * What each person's email will say, without sending anything.
 *
 * The settings page shows this, so the office can see exactly what goes out at
 * nine o'clock before it goes out.
 */
export async function buildSummaries(offsetDays = 0): Promise<MemberSummary[]> {
  const today = dayStart(offsetDays);
  const tomorrow = dayStart(offsetDays + 1);
  const dayAfter = dayStart(offsetDays + 2);

  const [people, todayLines, tomorrowLines, followUps] = await Promise.all([
    db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.isActive, true))
      .orderBy(asc(teamMembers.name)),
    linesFor(today, tomorrow),
    linesFor(tomorrow, dayAfter),
    /* Tomorrow's follow ups, which is the whole point of an email sent tonight. */
    followUpsOnDay(offsetDays + 1),
  ]);

  return people.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    today: todayLines.filter((row) => row.assignedToId === member.id).map((row) => row.line),
    tomorrow: tomorrowLines.filter((row) => row.assignedToId === member.id).map((row) => row.line),
    followUps: followUps
      .filter((row) => row.lead.assignedToId === member.id)
      .map((row) => ({
        time: clock(row.followUp.at),
        who:
          `${row.lead.firstName ?? ""} ${row.lead.lastName ?? ""}`.trim() ||
          row.lead.email ||
          "an enquiry",
        note: row.followUp.note ?? "",
      })),
  }));
}

/** The email itself, in the shape the office wrote out. */
export function summaryText(summary: MemberSummary, offsetDays = 0): string {
  const day = dateOf(dayStart(offsetDays));
  const next = dateOf(dayStart(offsetDays + 1));

  const block = (lines: SummaryLine[]) =>
    lines.length === 0
      ? "   Nothing."
      : lines
          .map(
            (line) =>
              `   ${line.time} . ${line.who} . ${line.place} (${line.kind}) . ${STATUS[line.status]}`,
          )
          .join("\n");

  const follow =
    summary.followUps.length === 0
      ? "   Nothing."
      : summary.followUps
          .map((one) => `   ${one.time} . ${one.who}${one.note ? ` . ${one.note}` : ""}`)
          .join("\n");

  return [
    `Appointments for ${day}`,
    "",
    block(summary.today),
    "",
    `Tomorrow, ${next}`,
    "",
    block(summary.tomorrow),
    "",
    `Enquiries to follow up tomorrow, ${next}`,
    "",
    follow,
    "",
    "Anything still pending needs an answer in the CRM: it happened, or it did not.",
  ].join("\n");
}

export type SummaryOutcome = {
  name: string;
  email: string | null;
  sent: boolean;
  why: string;
};

/**
 * Send the day's summary.
 *
 * Called by the ticker at the hour the office set, by the button on the
 * settings page, and by the endpoint a proper scheduler can call. All three end
 * up here, so all three behave the same.
 */
export async function sendDailySummary(options?: {
  /** 0 for today, which is what the evening run means. */
  offsetDays?: number;
  /** Sent by hand, so it goes even if it has gone once today already. */
  byHand?: boolean;
  who?: { id: string; email: string } | null;
}): Promise<SummaryOutcome[]> {
  const offsetDays = options?.offsetDays ?? 0;
  const config = await readSettings([
    "appointments.summaryOn",
    "appointments.summaryWhenEmpty",
    "appointments.summaryLastSent",
  ]);

  if (config["appointments.summaryOn"] !== "yes" && !options?.byHand) {
    return [{ name: "", email: null, sent: false, why: "The summary is switched off." }];
  }

  const summaries = await buildSummaries(offsetDays);
  const whenEmpty = config["appointments.summaryWhenEmpty"] === "yes";
  const outcomes: SummaryOutcome[] = [];

  for (const summary of summaries) {
    if (!summary.email) {
      outcomes.push({
        name: summary.name,
        email: null,
        sent: false,
        why: "No email address on the record.",
      });
      continue;
    }

    /* A day with nothing on it: either nothing is sent, or a line saying so.
       The office chooses, because both are reasonable and only they know
       whether a quiet inbox reads as "nothing on" or as "the CRM is broken". */
    const nothingOn =
      summary.today.length === 0 &&
      summary.tomorrow.length === 0 &&
      summary.followUps.length === 0;

    if (nothingOn && !whenEmpty) {
      outcomes.push({
        name: summary.name,
        email: summary.email,
        sent: false,
        why: "Nothing on, and the setting says not to send on an empty day.",
      });
      continue;
    }

    const body = nothingOn
      ? `No appointments today.\n\n${summaryText(summary, offsetDays)}`
      : summaryText(summary, offsetDays);

    const result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: summary.name, email: summary.email },
      subject: `Appointments for ${dateOf(dayStart(offsetDays))}`,
      body,
      /* Staff, not a marketing list: no unsubscribe link on an internal email. */
      withOptOut: false,
    });

    outcomes.push({
      name: summary.name,
      email: summary.email,
      sent: result.status === "SENT",
      why:
        result.status === "SENT"
          ? "Sent."
          : result.status === "SIMULATED"
            ? "Email is not set up yet, so nothing left the building."
            : (result.error ?? "It did not go."),
    });
  }

  /* What happened, kept where the settings page can read it back. */
  const sent = outcomes.filter((one) => one.sent).length;
  await writeSetting(
    "appointments.summaryLastSent",
    dayStart(offsetDays).toISOString().slice(0, 10),
  );
  await writeSetting(
    "appointments.summaryLastResult",
    `${new Date().toISOString().slice(0, 16).replace("T", " ")}: ${sent} of ${outcomes.length} sent`,
  );

  await recordAudit({
    action: "appointments.summary",
    entity: "appointment",
    entityId: dayStart(offsetDays).toISOString().slice(0, 10),
    detail: outcomes
      .map((one) => `${one.name}: ${one.why}`)
      .join("; ")
      .slice(0, 900),
    userId: options?.who?.id,
    userEmail: options?.who?.email ?? "the evening run",
  });

  return outcomes;
}

/**
 * Has the hour come, and has today's summary not gone yet?
 *
 * Asked every few minutes by the ticker. Deliberately forgiving: a summary due
 * at nine that the app was asleep for is sent when the app wakes up, because a
 * late summary is worth more than none.
 */
export async function summaryIsDue(): Promise<boolean> {
  const config = await readSettings([
    "appointments.summaryOn",
    "appointments.summaryHour",
    "appointments.summaryLastSent",
  ]);
  if (config["appointments.summaryOn"] !== "yes") return false;

  const hour = Number(config["appointments.summaryHour"]);
  if (!Number.isFinite(hour)) return false;

  const now = new Date();
  if (now.getHours() < hour) return false;

  return config["appointments.summaryLastSent"] !== dayStart().toISOString().slice(0, 10);
}
