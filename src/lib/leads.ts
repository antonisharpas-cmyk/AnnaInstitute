import "server-only";
import { and, desc, eq, gte, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { clients, leads, projects } from "@/db/schema";

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

export const LEAD_SOURCES = ["WEBSITE", "ENQUIRY", "AGENT", "WHATSAPP", "OTHER"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** What the website called itself, mapped onto the office's own categories. */
function sourceKindFrom(source: string | null): LeadSource {
  const value = (source ?? "").toLowerCase();
  if (value.includes("whatsapp")) return "WHATSAPP";
  if (value.includes("agent")) return "AGENT";
  if (value.includes("enquiry") || value.includes("enquiries")) return "ENQUIRY";
  return "WEBSITE";
}

export type ReadLead = ReturnType<typeof readLeadPayload>;

/**
 * The same enquiry can arrive under many names. Contact Form 7 sends
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
 * The same form submitted twice in a minute is one enquiry, not two. A retry
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

export async function listLeads({
  query = "",
  status = "",
  source = "",
  limit = 20,
  offset = 0,
}: {
  query?: string;
  status?: string;
  source?: string;
  limit?: number;
  offset?: number;
}) {
  // Anything in the recycle bin is out of every list and every count.
  const filters: SQL[] = [isNull(leads.deletedAt) as SQL];
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
  if (["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "CLOSED"].includes(status)) {
    filters.push(eq(leads.status, status as "NEW"));
  }
  if ((LEAD_SOURCES as readonly string[]).includes(source)) {
    filters.push(eq(leads.sourceKind, source as LeadSource));
  }
  const where = and(...filters);

  const [rows, [counted]] = await Promise.all([
    db
      .select({ lead: leads, project: projects, client: clients })
      .from(leads)
      .leftJoin(projects, eq(projects.id, leads.projectId))
      .leftJoin(clients, eq(clients.id, leads.clientId))
      .where(where)
      .orderBy(desc(leads.createdAt))
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
      total: sql<number>`count(*)::int`,
      fresh: sql<number>`count(*) filter (where status = 'NEW')::int`,
      working: sql<number>`count(*) filter (where status in ('CONTACTED','QUALIFIED'))::int`,
      converted: sql<number>`count(*) filter (where status = 'CONVERTED')::int`,
    })
    .from(leads)
    .where(isNull(leads.deletedAt));
  return row ?? { total: 0, fresh: 0, working: 0, converted: 0 };
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
  status === "CONVERTED"
    ? "good"
    : status === "NEW"
      ? "warn"
      : status === "CLOSED"
        ? "neutral"
        : "neutral";

/**
 * The ids of every enquiry the current filters match, in the order they show.
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
