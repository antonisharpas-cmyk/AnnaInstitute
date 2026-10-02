import "server-only";
import { choiceFilter } from "@/lib/choices/filter";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { many } from "@/lib/filters";
import {
  agents,
  appointments,
  auditLogs,
  clients,
  leadNotes,
  leads,
  projects,
  teamMembers,
  users,
} from "@/db/schema";

/**
 * What arrives from the website, and what the office sees.
 *
 * The payload is treated as data and nothing else. Every field is read by name,
 * trimmed, cut to a sane length and stored. Nothing in it is executed, followed
 * as an instruction, or trusted to be true: a lead is somebody who filled a form,
 * not a client, and it becomes a client only when the office says so.
 */

const LIMITS = { short: 200, long: 4000 } as const;

function text(value: unknown, limit: number = LIMITS.short): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  const cleaned = String(value)
    .replace(/\p{Cc}/gu, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, limit);
}

function pick(payload: Record<string, unknown>, names: string[], limit?: number) {
  for (const name of names) {
    const found = text(payload[name], limit);
    if (found) return found;
  }
  return null;
}

function truthy(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const asText = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "on", "y", "ναι"].includes(asText);
}

/** A full name split into two, so "Maria Georgiou" does not land in one box. */
function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Where a lead came from, offered in the order the office thinks of them.
 *
 * ENQUIRY is not here. It was the word for "somebody got in touch", which is
 * what every one of these is, so it says nothing; the leads that carry it keep
 * it and read as Lead, and nobody is offered it again.
 */
export const LEAD_SOURCES = [
  "WEBSITE",
  "INSTAGRAM",
  "FACEBOOK",
  "SOCIAL_MEDIA",
  "WHATSAPP",
  "PHONE",
  "EMAIL",
  "AGENT",
  "REFERRAL",
  "OTHER",
] as const;

/** Sources no longer offered, kept so the leads that hold them still read. */
export const OLD_LEAD_SOURCES = ["ENQUIRY"] as const;

/**
 * Every status a lead can hold, in the order the board reads.
 *
 * NEW is written by the CRM when the lead arrives and is never chosen by
 * hand. CONVERTED is written when the lead becomes a client and is not
 * chosen by hand either, which is why neither is offered in the picker.
 */
export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "NO_RESPONSE",
  "ACTIVE",
  "ON_HOLD",
  "NOT_INTERESTED",
  "CONVERTED",
  "CLOSED",
] as const;

/** The statuses somebody in the office sets themselves. */
export const CHOOSABLE_LEAD_STATUSES = [
  "CONTACTED",
  "NO_RESPONSE",
  "ACTIVE",
  "ON_HOLD",
  "NOT_INTERESTED",
  "CLOSED",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * What the website called itself, mapped onto the office's own categories.
 *
 * A form posts whatever its own page was called, and the office thinks in ten
 * words rather than a hundred. Anything that does not name itself is the
 * website, which is where the API posts from.
 */
function sourceKindFrom(source: string | null): LeadSource {
  const value = (source ?? "").toLowerCase();
  if (value.includes("whatsapp")) return "WHATSAPP";
  if (value.includes("instagram")) return "INSTAGRAM";
  if (value.includes("facebook") || value.includes("messenger")) return "FACEBOOK";
  if (value.includes("social")) return "SOCIAL_MEDIA";
  if (value.includes("referral") || value.includes("referred")) return "REFERRAL";
  if (value.includes("agent")) return "AGENT";
  if (value.includes("phone") || value.includes("call")) return "PHONE";
  if (value.includes("mail")) return "EMAIL";
  return "WEBSITE";
}

export type ReadLead = ReturnType<typeof readLeadPayload>;

/**
 * The same lead can arrive under many names. Contact Form 7 sends
 * your-name, a hand written form sends fullName, WordPress plugins send
 * first_name. All of them are read here so the website developer does not have
 * to rewrite their form to match us.
 */
export function readLeadPayload(payload: Record<string, unknown>) {
  const source = pick(payload, ["source", "leadSource"]) ?? "website";
  const first = pick(payload, ["firstName", "first_name", "fname", "given_name"]);
  const last = pick(payload, ["lastName", "last_name", "lname", "surname", "family_name"]);
  const full = pick(payload, ["name", "fullName", "full_name", "your-name", "yourName"]);

  let firstName = first;
  let lastName = last;
  if (!firstName && full) {
    const split = splitName(full);
    firstName = split.firstName;
    lastName = lastName ?? split.lastName;
  }

  return {
    firstName,
    lastName,
    email: pick(payload, ["email", "your-email", "emailAddress", "email_address", "mail"]),
    phone: pick(payload, ["phone", "tel", "telephone", "mobile", "your-phone", "phoneNumber"]),
    message: pick(payload, ["message", "comments", "your-message", "enquiry", "text"], LIMITS.long),
    interest: pick(payload, ["interest", "subject", "your-subject", "enquiryType"]),
    projectName: pick(payload, ["project", "projectName", "development", "building"]),
    unitCode: pick(payload, ["unit", "unitCode", "apartment", "apartmentCode"]),
    budget: pick(payload, ["budget", "priceRange", "price_range"]),
    language: pick(payload, ["language", "locale", "lang"]),
    country: pick(payload, ["country", "countryName"]),
    source,
    sourceKind: sourceKindFrom(source),
    formName: pick(payload, ["form", "formName", "form_name", "formId"]),
    pageUrl: pick(payload, ["pageUrl", "page_url", "url", "page"], LIMITS.long),
    referrer: pick(payload, ["referrer", "referer", "ref"], LIMITS.long),
    utmSource: pick(payload, ["utmSource", "utm_source"]),
    utmMedium: pick(payload, ["utmMedium", "utm_medium"]),
    utmCampaign: pick(payload, ["utmCampaign", "utm_campaign"]),
    consent: truthy(payload.consent ?? payload.marketingConsent ?? payload.marketing_opt_in),
    consentText: pick(payload, ["consentText", "consent_text"], LIMITS.long),
  };
}

/** The project a lead names, matched on the developments we actually have. */
export async function matchProject(name: string | null) {
  if (!name) return null;
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(ilike(projects.name, `%${name}%`))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * The same form submitted twice in a minute is one lead, not two. A retry
 * from the website after a timeout lands here too, which is why the endpoint can
 * be retried safely.
 */
export async function recentDuplicate(email: string | null, phone: string | null) {
  if (!email && !phone) return null;
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const parts: SQL[] = [];
  if (email) parts.push(eq(leads.email, email));
  if (phone) parts.push(eq(leads.phone, phone));

  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(gte(leads.createdAt, since), or(...parts) as SQL))
    .limit(1);

  return rows[0]?.id ?? null;
}

/**
 * How the leads list can be ordered, as SQL for each column.
 *
 * Newest first is the default and stays the default, because an leads list
 * is a queue before it is a table. The rest are here for the moments when it is
 * a table: every lead from one development together, or the oldest thing
 * nobody has touched at the top.
 */
export const LEAD_ORDER: Record<string, SQL> = {
  name: sql`concat(coalesce(${leads.firstName}, ''), ' ', coalesce(${leads.lastName}, ''))`,
  received: sql`${leads.createdAt}`,
  contact: sql`coalesce(${leads.email}, ${leads.phone}, '')`,
  source: sql`${leads.sourceKind}::text`,
  status: sql`${leads.status}::text`,
  about: sql`coalesce(${leads.projectName}, '')`,
  note: sql`coalesce((select n.body from lead_notes n where n.lead_id = ${leads.id} order by n.created_at desc limit 1), ${leads.message}, '')`,
};

export async function listLeads({
  query = "",
  status = "",
  source = "",
  agent = "",
  assignedTo = "",
  followUps = "",
  sort = "received",
  dir = "desc",
  limit = 20,
  offset = 0,
}: {
  query?: string;
  status?: string;
  source?: string;
  /** The agent who introduced the lead. */
  agent?: string;
  /** Whose lead it is, from Our Team. */
  assignedTo?: string;
  /** "due": only the leads with a follow up that is pressing. */
  followUps?: string;
  sort?: string;
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  /**
   * Two things are out of every leads list.
   *
   * Anything in the recycle bin, and anything that has become a client. The
   * second is the office's own rule: the moment a lead becomes a buyer it
   * is a client record, and leaving it in the leads list as well means two
   * places to look and two places to keep up to date. Everything the lead
   * said, its notes included, is on the client profile, and the lead itself
   * is still at its own address for anybody who wants the original.
   */
  /*
   * Except in Handled. The office asked for the ones that became clients to
   * be there too, as the end of the road a lead was handled down, read
   * only, with the client record one click away for anything that changes.
   */
  const handledView = many(status).includes("HANDLED");
  const filters: SQL[] = [isNull(leads.deletedAt) as SQL];
  if (!handledView) filters.push(ne(leads.status, "CONVERTED") as SQL);
  if (query) {
    filters.push(
      or(
        ilike(leads.firstName, `%${query}%`),
        ilike(leads.lastName, `%${query}%`),
        ilike(leads.email, `%${query}%`),
        ilike(leads.phone, `%${query}%`),
        ilike(leads.message, `%${query}%`),
        ilike(leads.projectName, `%${query}%`),
      ) as SQL,
    );
  }
  /**
   * Status takes a list: "the new ones and the ones we have contacted" is the
   * question somebody actually asks before they start telephoning.
   */
  const wanted = choiceFilter(leads.status, leads.statusChoice, many(status), LEAD_STATUSES);
  if (wanted) filters.push(wanted);
  /**
   * Handled is the office's own word for the rest of the board: a lead
   * somebody has already picked up, whatever happened to it afterwards. It is
   * not a status on the record, it is every status except the first one, which
   * is why it is worked out here rather than stored.
   */
  if (many(status).includes("HANDLED")) {
    filters.push(ne(leads.status, "NEW") as SQL);
  }
  const from = choiceFilter(leads.sourceKind, leads.sourceChoice, many(source), [...LEAD_SOURCES, "ENQUIRY"]);
  if (from) filters.push(from);

  /* Whose leads these are, and who introduced them: two different people,
     two different questions, so two filters. */
  const byAgent = many(agent).filter(Boolean);
  if (byAgent.length === 1) filters.push(eq(leads.agentId, byAgent[0]));
  if (byAgent.length > 1) filters.push(inArray(leads.agentId, byAgent));

  const byPerson = many(assignedTo).filter(Boolean);
  if (byPerson.length === 1) filters.push(eq(leads.assignedToId, byPerson[0]));
  if (byPerson.length > 1) filters.push(inArray(leads.assignedToId, byPerson));

  /*
   * The leads somebody is going back to.
   *
   * Pressing means the same here as it does in the bell: pending, and due
   * before the end of tomorrow. The bell links straight to this list, so the
   * two have to agree or the number in the circle will not match what opens.
   */
  if (followUps === "due") {
    filters.push(
      sql`exists (
        select 1 from lead_follow_ups f
        where f.lead_id = ${leads.id}
          and f.status = 'PENDING'
          and f.at < (date_trunc('day', now()) + interval '2 days')
      )` as SQL,
    );
  }

  const where = and(...filters);

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        lead: leads,
        project: projects,
        client: clients,
        introducer: agents,
        member: teamMembers,
      })
      .from(leads)
      .leftJoin(projects, eq(projects.id, leads.projectId))
      .leftJoin(clients, eq(clients.id, leads.clientId))
      .leftJoin(agents, eq(agents.id, leads.agentId))
      .leftJoin(teamMembers, eq(teamMembers.id, leads.assignedToId))
      .where(where)
      .orderBy(
        dir === "asc"
          ? asc(LEAD_ORDER[sort] ?? LEAD_ORDER.received)
          : desc(LEAD_ORDER[sort] ?? LEAD_ORDER.received),
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(leads)
      .where(where),
  ]);

  return { rows, total: counted?.total ?? 0 };
}

export async function leadCounts() {
  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where status <> 'CONVERTED')::int`,
      fresh: sql<number>`count(*) filter (where status = 'NEW')::int`,
      working: sql<number>`count(*) filter (where status in ('CONTACTED','ACTIVE','ON_HOLD','NO_RESPONSE'))::int`,
      /** Kept for the reports, which still want to know how many became buyers. */
      converted: sql<number>`count(*) filter (where status = 'CONVERTED')::int`,
      /**
       * Everything picked up, the ones that became clients included, which
       * the Handled view shows read only.
       */
      handled: sql<number>`count(*) filter (where status <> 'NEW')::int`,
    })
    .from(leads)
    .where(isNull(leads.deletedAt));
  return row ?? { total: 0, fresh: 0, working: 0, converted: 0, handled: 0 };
}

/** How many leads are still waiting for somebody to pick them up. */
export async function newLeadCount() {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.status, "NEW"), isNull(leads.clientId), isNull(leads.deletedAt)));
  return row?.total ?? 0;
}

export const leadStatusTone = (status: string) =>
  status === "CONVERTED" || status === "ACTIVE"
    ? "good"
    : status === "NEW" || status === "ON_HOLD" || status === "NO_RESPONSE"
      ? "warn"
      : "neutral";

/**
 * The ids of every lead the current filters match, in the order they show.
 *
 * The side panel needs this to say "eleven of forty two" and to walk to the
 * next record without going back to the list, and it is only ids, so it stays
 * cheap enough to run on every page load.
 */
export async function leadIdsFor({
  query = "",
  status = "",
  source = "",
}: {
  query?: string;
  status?: string;
  source?: string;
}): Promise<string[]> {
  const { rows } = await listLeads({ query, status, source, limit: 2000, offset: 0 });
  return rows.map((row) => row.lead.id);
}

/* ---------------------------------------------------------------------------
   The running record on a lead
   --------------------------------------------------------------------------- */

/** Ten to a page, which is about what fits without the card becoming a list. */
export const NOTES_PER_PAGE = 10;

/**
 * The notes on a lead, newest first.
 *
 * All of them, not a page of them, and the paging happens in the browser. Two
 * reasons: a lead has tens of notes rather than thousands, so there is
 * nothing to save by asking the database twice, and the arrows then turn the
 * page instantly instead of reloading the record around them. It also keeps the
 * address clean, so a link to a lead is a link to the lead rather than
 * to page three of its notes.
 */
export async function notesForLead(leadId: string) {
  return (
    db
      .select({
        id: leadNotes.id,
        body: leadNotes.body,
        createdAt: leadNotes.createdAt,
        writtenBy: users.name,
      })
      .from(leadNotes)
      .leftJoin(users, eq(users.id, leadNotes.writtenById))
      .where(eq(leadNotes.leadId, leadId))
      // Two notes written in the same second still need a definite order, so the
      // identifier breaks the tie and the list never shuffles between loads.
      .orderBy(desc(leadNotes.createdAt), desc(leadNotes.id))
      .limit(500)
  );
}

/** The latest note on each of these leads, for the list column. */
export async function latestNoteByLead(leadIds: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (leadIds.length === 0) return found;

  const rows = await db
    .select({ leadId: leadNotes.leadId, body: leadNotes.body, createdAt: leadNotes.createdAt })
    .from(leadNotes)
    .where(inArray(leadNotes.leadId, leadIds))
    .orderBy(desc(leadNotes.createdAt));

  for (const row of rows) {
    if (!found.has(row.leadId)) found.set(row.leadId, row.body);
  }
  return found;
}

/* ---------------------------------------------------------------------------
   The history of a lead
   --------------------------------------------------------------------------- */

export type HistoryLine = {
  id: string;
  at: Date;
  /** "status", "assigned", "followUp", "note", "converted", "appointment". */
  kind: string;
  /** The sentence, already in the office's words. */
  said: string;
  /** What the action itself recorded: the status, the name, the day. */
  detail: string | null;
  who: string | null;
};

/**
 * Everything that has happened to one lead, newest first.
 *
 * Read out of the audit trail rather than kept a second time, which matters
 * more than it sounds: a history written alongside the records drifts from them
 * the first time somebody changes one without the other, and then nobody
 * trusts either. The audit trail is written by the actions themselves, so this
 * cannot disagree with what was done.
 *
 * Appointments arranged with this lead are in here too, by their own ids,
 * because "who moved the viewing" is exactly the question this card exists to
 * answer.
 */
export async function historyForLead(leadId: string): Promise<HistoryLine[]> {
  const mine = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(eq(appointments.leadId, leadId));

  const ids = [leadId, ...mine.map((row) => row.id)];

  const rows = await db
    .select({ log: auditLogs })
    .from(auditLogs)
    .where(and(inArray(auditLogs.entityId, ids), inArray(auditLogs.entity, ["lead", "appointment"])))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  const WORDS: Record<string, string> = {
    "lead.create": "The lead was written down",
    "lead.update": "The lead was edited",
    "lead.status": "The status was moved",
    "lead.status.bulk": "The status was moved",
    "lead.assigned": "A team member was assigned",
    "lead.note": "A note was written",
    "lead.note.remove": "A note was taken off",
    "lead.followUp.add": "A follow up was arranged",
    "lead.followUp.status": "A follow up was answered",
    "lead.followUp.delete": "A follow up was taken off",
    "lead.converted": "It became a client",
    "lead.conversion.undone": "The conversion was undone",
    "lead.binned": "It was moved to the bin",
    "lead.binned.bulk": "It was moved to the bin",
    "lead.restored": "It was brought back from the bin",
    "appointment.create": "An appointment was arranged",
    "appointment.update": "The appointment was changed",
    "appointment.answer": "The appointment was answered for",
    "appointment.delete": "The appointment was taken off",
  };

  const KIND: Record<string, string> = {
    "lead.status": "status",
    "lead.status.bulk": "status",
    "lead.assigned": "assigned",
    "lead.note": "note",
    "lead.converted": "converted",
  };

  return rows.map(({ log }) => ({
    id: log.id,
    at: log.createdAt,
    kind: KIND[log.action] ?? (log.action.startsWith("lead.followUp") ? "followUp" : "other"),
    said: WORDS[log.action] ?? log.action,
    detail: log.detail,
    who: log.userEmail,
  }));
}
