import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, clients, constructors, subownerDirectors, subowners, teamMembers } from "@/db/schema";
import { companyDetails, issuerDetails, ONE_ELEVEN } from "@/lib/issuer";
import type { IssuedSnapshot } from "@/lib/paymentPdf";
import type { Recipient } from "@/lib/messaging";

/*
 * Who is on the other side of an invoice under Company.
 *
 * One Eleven, or another of our companies, charges anybody the CRM knows: a
 * company, a client, an agent, a constructor, somebody in the team, or anybody
 * else typed by name. An invoice we received has the same choice for who sent
 * it. The party is kept as its kind and its record, so the paper, the email
 * and the reports always find the person as they are now.
 */

export const PARTY_KINDS = ["COMPANY", "CLIENT", "AGENT", "CONSTRUCTOR", "TEAM", "OTHER"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

export type PartyOption = { value: string; kind: PartyKind; name: string; email: string };

export const partyValue = (kind: string | null | undefined, id: string | null | undefined) =>
  kind && kind !== "OTHER" && id ? `${kind}:${id}` : "OTHER";

export function splitParty(value: string): { kind: PartyKind; id: string | null } {
  const [kind, ...rest] = value.split(":");
  const id = rest.join(":").trim();
  if ((PARTY_KINDS as readonly string[]).includes(kind) && kind !== "OTHER" && id) return { kind: kind as PartyKind, id };
  return { kind: "OTHER", id: null };
}

const norm = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/g, " ")
    .replace(/\b(ltd|limited|llc|plc)\b/g, "")
    .trim();

/** A company's first director's address, when the company has none of its own. */
async function companyEmail(companyId: string, own: string | null): Promise<string> {
  if (own?.trim()) return own.trim();
  const [director] = await db
    .select()
    .from(subownerDirectors)
    .where(eq(subownerDirectors.subownerId, companyId))
    .orderBy(asc(subownerDirectors.createdAt))
    .limit(1);
  return director?.email?.trim() || director?.emailAlternate?.trim() || "";
}

/**
 * Our own companies, the ones an invoice is issued from: One Eleven first, from
 * Settings, then every other company. The company page that is One Eleven
 * itself is the same company, so it is not listed twice: choosing One Eleven
 * keeps its one series of numbers.
 */
export async function ourCompanies(): Promise<{ id: string; name: string }[]> {
  const me = await companyDetails();
  const rows = await db.select({ id: subowners.id, name: subowners.name, company: subowners.company }).from(subowners).orderBy(asc(subowners.name));
  const mine = norm(me.name);
  return [
    { id: ONE_ELEVEN, name: me.name || "One Eleven" },
    ...rows
      .filter((one) => !mine || (norm(one.company) !== mine && norm(one.name) !== mine))
      .map((one) => ({ id: one.id, name: one.company?.trim() || one.name })),
  ];
}

/** Whether a company id is One Eleven's own page, so it is One Eleven's series. */
export async function asOurCompanyId(id: string | null | undefined): Promise<string> {
  const wanted = (id ?? "").trim();
  if (!wanted) return ONE_ELEVEN;
  const list = await ourCompanies();
  return list.some((one) => one.id === wanted) ? wanted : ONE_ELEVEN;
}

export async function ourCompanyName(id: string | null | undefined): Promise<string> {
  return (await issuerDetails(await asOurCompanyId(id))).name || "One Eleven";
}

/** Everybody an invoice can be to or from, grouped, for the picker. */
export async function partyOptions(): Promise<PartyOption[]> {
  const [companyRows, clientRows, agentRows, constructorRows, teamRows] = await Promise.all([
    db.select().from(subowners).orderBy(asc(subowners.name)),
    db
      .select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email })
      .from(clients)
      .orderBy(asc(clients.lastName), asc(clients.firstName)),
    db.select({ id: agents.id, name: agents.name, company: agents.company, email: agents.email }).from(agents).orderBy(asc(agents.name)),
    db
      .select({ id: constructors.id, name: constructors.name, company: constructors.company, email: constructors.email })
      .from(constructors)
      .orderBy(asc(constructors.name)),
    db.select({ id: teamMembers.id, name: teamMembers.name, email: teamMembers.email }).from(teamMembers).orderBy(asc(teamMembers.name)),
  ]);
  const out: PartyOption[] = [];
  for (const one of companyRows) {
    out.push({ value: `COMPANY:${one.id}`, kind: "COMPANY", name: one.company?.trim() || one.name, email: await companyEmail(one.id, one.email) });
  }
  for (const one of clientRows) {
    out.push({ value: `CLIENT:${one.id}`, kind: "CLIENT", name: `${one.firstName ?? ""} ${one.lastName ?? ""}`.trim() || "Client", email: one.email?.trim() ?? "" });
  }
  for (const one of agentRows) {
    out.push({
      value: `AGENT:${one.id}`,
      kind: "AGENT",
      name: one.company?.trim() && one.company.trim() !== one.name ? `${one.name} (${one.company.trim()})` : one.name,
      email: one.email?.trim() ?? "",
    });
  }
  for (const one of constructorRows) {
    out.push({ value: `CONSTRUCTOR:${one.id}`, kind: "CONSTRUCTOR", name: one.company?.trim() || one.name, email: one.email?.trim() ?? "" });
  }
  for (const one of teamRows) {
    out.push({ value: `TEAM:${one.id}`, kind: "TEAM", name: one.name, email: one.email?.trim() ?? "" });
  }
  return out;
}

export type Party = {
  kind: PartyKind;
  id: string | null;
  name: string;
  /** Who the letter starts with: the contact person when there is one. */
  dear: string;
  email: string;
  phone: string;
  /** As the paper prints it under "Bill to" or "Received from". */
  bill: IssuedSnapshot["client"];
  /** For the message log. */
  recipient: Recipient;
};

/**
 * The party of an invoice as it is today: the record when there is one, the
 * name and address typed on the invoice otherwise.
 */
export async function partyOf(expense: {
  partyKind: string | null;
  partyId: string | null;
  subownerId?: string | null;
  supplier: string;
  partyEmail: string | null;
  partyAddress: string | null;
}): Promise<Party> {
  const kind = (expense.partyKind ?? (expense.subownerId ? "COMPANY" : "OTHER")) as PartyKind;
  const id = expense.partyId ?? (kind === "COMPANY" ? (expense.subownerId ?? null) : null);
  const typedEmail = expense.partyEmail?.trim() ?? "";
  const blank = (name: string, extra: Partial<IssuedSnapshot["client"]> = {}): IssuedSnapshot["client"] => ({
    name,
    address: "",
    country: "",
    idNumber: "",
    vatNumber: "",
    email: "",
    phone: "",
    registration: "",
    ...extra,
  });

  if (kind === "COMPANY" && id) {
    const [one] = await db.select().from(subowners).where(eq(subowners.id, id)).limit(1);
    if (one) {
      const name = one.company?.trim() || one.name;
      const email = typedEmail || (await companyEmail(one.id, one.email));
      return {
        kind,
        id,
        name,
        dear: one.contactName?.trim() || name,
        email,
        phone: one.phone ?? "",
        bill: blank(name, {
          address: one.address ?? "",
          country: one.country ?? "",
          vatNumber: one.vatNumber ?? "",
          email,
          phone: one.phone ?? "",
          registration: one.registryNumber ?? "",
        }),
        recipient: { name, email, subownerId: one.id },
      };
    }
  }
  if (kind === "CLIENT" && id) {
    const [one] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
    if (one) {
      const name = `${one.firstName ?? ""} ${one.lastName ?? ""}`.trim();
      const email = typedEmail || one.email?.trim() || "";
      return {
        kind,
        id,
        name,
        dear: name,
        email,
        phone: one.phone ?? "",
        bill: blank(name, {
          address: one.address ?? "",
          country: one.country ?? "",
          idNumber: one.idNumber ?? "",
          vatNumber: one.vatNumber ?? "",
          email,
          phone: one.phone ?? "",
        }),
        recipient: { name, email, clientId: one.id },
      };
    }
  }
  if (kind === "AGENT" && id) {
    const [one] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (one) {
      const name = one.company?.trim() || one.name;
      const email = typedEmail || one.email?.trim() || "";
      return {
        kind,
        id,
        name,
        dear: one.name,
        email,
        phone: one.phone ?? "",
        bill: blank(name, {
          address: one.address ?? "",
          country: one.country ?? "",
          vatNumber: one.vatNumber ?? "",
          email,
          phone: one.phone ?? "",
          registration: one.licenceNumber ?? "",
        }),
        recipient: { name, email, agentId: one.id },
      };
    }
  }
  if (kind === "CONSTRUCTOR" && id) {
    const [one] = await db.select().from(constructors).where(eq(constructors.id, id)).limit(1);
    if (one) {
      const name = one.company?.trim() || one.name;
      const email = typedEmail || one.email?.trim() || "";
      return {
        kind,
        id,
        name,
        dear: one.contactName?.trim() || name,
        email,
        phone: one.phone ?? "",
        bill: blank(name, {
          address: one.address ?? "",
          vatNumber: one.vatNumber ?? "",
          email,
          phone: one.phone ?? "",
          registration: one.registryNumber ?? "",
        }),
        recipient: { name, email },
      };
    }
  }
  if (kind === "TEAM" && id) {
    const [one] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    if (one) {
      const email = typedEmail || one.email?.trim() || "";
      return {
        kind,
        id,
        name: one.name,
        dear: one.name,
        email,
        phone: one.phone ?? "",
        bill: blank(one.name, { email, phone: one.phone ?? "" }),
        recipient: { name: one.name, email },
      };
    }
  }
  /* Somebody typed by name, or a record that has since gone: what the invoice says. */
  const name = expense.supplier;
  return {
    kind: "OTHER",
    id: null,
    name,
    dear: name,
    email: typedEmail,
    phone: "",
    bill: blank(name, { address: expense.partyAddress ?? "", email: typedEmail }),
    recipient: { name, email: typedEmail },
  };
}

/** Where a party's own page is, for the link on the invoice. */
export function partyHref(kind: string | null | undefined, id: string | null | undefined): string | null {
  if (!id) return null;
  switch (kind) {
    case "COMPANY":
      return `/subowners/${id}`;
    case "CLIENT":
      return `/clients/${id}`;
    case "AGENT":
      return `/agents/${id}`;
    case "CONSTRUCTOR":
      return `/constructors/${id}`;
    default:
      return null;
  }
}
