/**
 * The lists the office can shape for itself, in the Builder.
 *
 * Every list here is one the office picks from somewhere: a lead's status, where
 * a client came from, the kind of appointment. Each starts with the CRM's own
 * values, the built in ones, and the office can rename them, put them in its own
 * order, switch off the ones it never uses and add its own.
 *
 * A value the office adds always counts as one of the built in ones. "Held for
 * the owner" can count as Reserved, say: the apartment then reads "Held for the
 * owner" everywhere it is shown, while the money, the price list, the reports
 * and the automatic emails go on treating it as reserved. That is what keeps an
 * office's own words from ever breaking the arithmetic.
 *
 * The code of a value the office adds carries the built in one it counts as in
 * front of it, "RESERVED~held_for_owner", so any record can say what it counts
 * as without looking anything up.
 *
 * This file has no server code in it, so the forms in the browser can use it.
 */

export type ListKey =
  | "leadStatus"
  | "leadSource"
  | "clientSource"
  | "idType"
  | "projectStatus"
  | "unitStatus"
  | "contractStatus"
  | "contractKind"
  | "installmentStage"
  | "paymentMethod"
  | "appointmentType"
  | "expenseCategory";

export type SectionKey = "leads" | "clients" | "projects" | "contracts" | "appointments" | "invoices";

export type Builtin = {
  code: string;
  /** Written by the CRM itself and never picked by hand: it can be renamed, nothing else. */
  auto?: boolean;
  /** Needed by the CRM, so it can be renamed and moved but not switched off. */
  locked?: boolean;
  /** Kept for the records that have it, but off until the office switches it on in the Builder. */
  offByDefault?: boolean;
};

export type ListDef = {
  key: ListKey;
  section: SectionKey;
  /** Where its words live in the dictionary: "leads.status" reads "leads.status.NEW". */
  prefix: string;
  builtins: Builtin[];
};

export const SECTIONS: SectionKey[] = ["leads", "clients", "projects", "contracts", "appointments", "invoices"];

export const LISTS: ListDef[] = [
  {
    key: "leadStatus",
    section: "leads",
    prefix: "leads.status",
    builtins: [
      { code: "NEW", auto: true },
      { code: "CONTACTED", locked: true },
      { code: "NO_RESPONSE" },
      { code: "ACTIVE" },
      { code: "ON_HOLD" },
      { code: "NOT_INTERESTED" },
      { code: "CONVERTED", auto: true },
      { code: "CLOSED", locked: true },
    ],
  },
  {
    key: "leadSource",
    section: "leads",
    prefix: "leads.source",
    builtins: [
      { code: "WEBSITE", locked: true },
      { code: "INSTAGRAM" },
      { code: "FACEBOOK" },
      { code: "SOCIAL_MEDIA" },
      { code: "WHATSAPP" },
      { code: "PHONE" },
      { code: "EMAIL" },
      { code: "AGENT", locked: true },
      { code: "REFERRAL" },
      { code: "OTHER", locked: true },
    ],
  },
  {
    key: "clientSource",
    section: "clients",
    prefix: "clients.source",
    builtins: [
      { code: "BUYER", locked: true },
      { code: "WEBSITE" },
      { code: "INSTAGRAM" },
      { code: "FACEBOOK" },
      { code: "SOCIAL_MEDIA" },
      { code: "WHATSAPP" },
      { code: "PHONE" },
      { code: "EMAIL" },
      { code: "ENQUIRY" },
      { code: "AGENT_REFERRAL" },
      { code: "REFERRAL" },
      { code: "LAND_OWNER", locked: true },
      { code: "OTHER", locked: true },
    ],
  },
  {
    key: "idType",
    section: "clients",
    prefix: "clients.idType",
    builtins: [{ code: "ID_CARD", locked: true }, { code: "PASSPORT", locked: true }, { code: "YELLOW_SLIP" }],
  },
  {
    key: "projectStatus",
    section: "projects",
    prefix: "projects.status",
    builtins: [
      { code: "PLANNING" },
      { code: "UNDER_CONSTRUCTION", locked: true },
      { code: "COMPLETED", locked: true },
      { code: "DELIVERED", locked: true },
    ],
  },
  {
    key: "unitStatus",
    section: "projects",
    prefix: "units.status",
    builtins: [
      { code: "AVAILABLE", locked: true },
      { code: "RESERVED", locked: true },
      { code: "SOLD", locked: true },
      { code: "DELIVERED", locked: true },
    ],
  },
  {
    key: "contractStatus",
    section: "contracts",
    prefix: "contracts.status",
    builtins: [
      { code: "DRAFT", locked: true },
      { code: "ACTIVE", locked: true },
      { code: "COMPLETED", locked: true },
      { code: "CANCELLED", locked: true },
    ],
  },
  {
    key: "contractKind",
    section: "contracts",
    prefix: "contracts.kind",
    builtins: [{ code: "SALE", locked: true }, { code: "LAND_EXCHANGE", locked: true }],
  },
  {
    /*
     * The stages a schedule is written in.
     *
     * An installment keeps its stage as words, the way it was written on the
     * contract, so a renamed stage never rewrites a contract already signed.
     * What the CRM needs to know, which line is the reservation and which the
     * signing, it reads from the words through every name the stage has had,
     * see stageOfLabel.
     */
    key: "installmentStage",
    section: "contracts",
    prefix: "contracts.stage",
    builtins: [
      { code: "RESERVATION", locked: true },
      { code: "SIGNING", locked: true },
      { code: "STRUCTURE" },
      { code: "BRICKWORK" },
      { code: "TILING" },
      { code: "ALUMINIUM" },
      { code: "PROPERTY" },
      { code: "DELIVERY" },
      { code: "TITLE_DEED" },
      { code: "APARTMENT" },
    ],
  },
  {
    key: "paymentMethod",
    section: "contracts",
    prefix: "contracts.method",
    builtins: [
      { code: "BANK", locked: true },
      { code: "CHEQUE" },
      { code: "CASH" },
      { code: "CARD" },
      { code: "OTHER", locked: true },
    ],
  },
  {
    key: "appointmentType",
    section: "appointments",
    prefix: "appointments.type",
    /* In the office's order: the office, a building, Studio Bagno, Ocriam, or
       something else. A call is kept for the appointments that were calls, and
       is off until somebody switches it on again. */
    builtins: [
      { code: "OFFICE" },
      { code: "BUILDING", locked: true },
      { code: "BATHROOMS_TILES" },
      { code: "TIMBER" },
      { code: "PHONE_CALL", offByDefault: true },
      { code: "OTHER", locked: true },
    ],
  },
  {
    key: "expenseCategory",
    section: "invoices",
    prefix: "invoices.category",
    builtins: [
      { code: "MANAGEMENT_FEES", locked: true },
      { code: "MARKETING" },
      { code: "OFFICE" },
      { code: "RENT" },
      { code: "BILLS" },
      { code: "LEGAL" },
      { code: "CONSTRUCTION" },
      { code: "OTHER", locked: true },
    ],
  },
];

export const LIST_BY_KEY = Object.fromEntries(LISTS.map((one) => [one.key, one])) as Record<ListKey, ListDef>;

export function isListKey(value: string): value is ListKey {
  return value in LIST_BY_KEY;
}

/** The mark between the built in value and the office's own name for it. */
export const JOIN = "~";

/** The built in value a code counts as: "RESERVED~held" counts as RESERVED. */
export function baseOf(code: string): string {
  const at = code.indexOf(JOIN);
  return at === -1 ? code : code.slice(0, at);
}

export function isCustom(code: string | null | undefined): boolean {
  return Boolean(code && code.includes(JOIN));
}

/**
 * A picked value split into what the record keeps.
 *
 * The built in column always holds the built in value, so every calculation
 * keeps working; the choice column holds the office's own value, or nothing.
 */
export function splitChoice(value: string): { base: string; choice: string | null } {
  return isCustom(value) ? { base: baseOf(value), choice: value } : { base: value, choice: null };
}

/**
 * What a record shows.
 *
 * The office's own value, as long as it still counts as what the record holds.
 * When the CRM moves a record on by itself, an apartment sold by its contract
 * say, the old choice no longer matches and the built in word shows instead, so
 * nothing ever reads "Held for the owner" once it is sold.
 */
export function shownCode(base: string, choice: string | null | undefined): string {
  return choice && baseOf(choice) === base ? choice : base;
}

/** The dictionary key for a value in a list. */
export function labelKey(list: ListKey, code: string): string {
  return `${LIST_BY_KEY[list].prefix}.${code}`;
}

/** A code for a value the office adds, from its name. */
export function makeCode(countsAs: string, name: string): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "own";
  return `${countsAs}${JOIN}${slug}_${Math.random().toString(36).slice(2, 6)}`;
}
