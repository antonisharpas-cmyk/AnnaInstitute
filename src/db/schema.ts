import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@/lib/id";

const id = () => text("id").primaryKey().$defaultFn(createId);
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const rate = (name: string) => numeric(name, { precision: 6, scale: 3 });
const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const roleEnum = pgEnum("role", ["ADMIN", "AGENT", "BUYER"]);
export const projectStatusEnum = pgEnum("project_status", [
  "PLANNING",
  "UNDER_CONSTRUCTION",
  "COMPLETED",
  /** Every apartment in it has been handed over. Set by the money, not by hand. */
  "DELIVERED",
]);
/*
 * Negotiation: a client is discussing the terms of a reservation but has not
 * signed the Reservation Agreement yet. The apartment is still offered to
 * others. Reserved is kept for after the agreement is signed.
 */
export const unitStatusEnum = pgEnum("unit_status", ["AVAILABLE", "NEGOTIATION", "RESERVED", "SOLD", "DELIVERED"]);
export type UnitStatus = (typeof unitStatusEnum.enumValues)[number];
/** The statuses an apartment is still offered to buyers in: on the price list and counted as available. */
export const OFFERED_STATUSES = ["AVAILABLE", "NEGOTIATION"] as const;
/**
 * What kind of transaction a contract records.
 *
 * A sale is money for an apartment. A land exchange, antiparochi, is the older
 * arrangement this business is built on: the owner of the plot is paid in
 * apartments in the building that goes up on it, sometimes with a sum of cash
 * on top, and the VAT is whatever that particular transaction attracts rather
 * than the usual rate. The two are different agreements, so the record says
 * which it is instead of leaving somebody to work it out from a nought.
 */
export const contractKindEnum = pgEnum("contract_kind", ["SALE", "LAND_EXCHANGE"]);
export const contractStatusEnum = pgEnum("contract_status", [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);
export const installmentStatusEnum = pgEnum("installment_status", ["PENDING", "PARTIAL", "PAID"]);
/** How the schedule was built: the classic stages, or equal periodic payments. */
export const scheduleTypeEnum = pgEnum("schedule_type", ["STANDARD", "PERIODIC"]);
/** What kind of identity document the client gave us. */
export const idTypeEnum = pgEnum("id_type", ["ID_CARD", "PASSPORT", "YELLOW_SLIP"]);

export const contactSourceEnum = pgEnum("contact_source", [
  "BUYER",
  "ENQUIRY",
  "AGENT_REFERRAL",
  /**
   * Somebody who came in by giving land rather than by buying.
   *
   * On a land exchange the other side of the agreement is a client like any
   * other, with apartments, paperwork and a profile, but they never bought
   * anything, so calling them a buyer would be wrong everywhere it appeared.
   */
  "LAND_OWNER",
  "OTHER",
  /*
   * The two a lead can arrive by that a client had no word for.
   *
   * A lead that came in on WhatsApp became a client whose source read
   * "Lead", so the one thing the office knew about where the buyer came
   * from was thrown away at the moment of conversion. The client's own source
   * now holds every way somebody can reach us.
   */
  "WEBSITE",
  "WHATSAPP",
  /*
   * And the rest of the ways somebody reaches One Eleven, kept the same on both
   * sides so a source survives the moment a lead becomes a client.
   */
  "INSTAGRAM",
  "FACEBOOK",
  "SOCIAL_MEDIA",
  "PHONE",
  "EMAIL",
  "REFERRAL",
]);
export const documentCategoryEnum = pgEnum("document_category", [
  "IDENTIFICATION",
  "CONTRACT",
  "RECEIPT",
  "FLOOR_PLAN",
  "CHANGE_REQUEST",
  "PROGRESS_PHOTO",
  "PRICE_LIST",
  /**
   * The four kinds of paper a development carries.
   *
   * A development is sold on its pictures, its drawings, its brochure and its
   * specification, so those are the only four the project page offers. Keeping
   * the list short is the point: a picker with ten choices gets a brochure
   * filed under Other and then nobody can find it.
   */
  "PICTURES",
  "ARCHITECTURAL",
  "BROCHURE",
  "TECHNICAL_SPEC",
  /**
   * The two papers that settle an agent's commission.
   *
   * The agent sends an invoice for what they are owed, and the office files the
   * receipt for the money it paid. A commission is finished when both are on
   * the record and not before, so they are their own two kinds rather than two
   * files called Other that somebody has to open to tell apart.
   */
  "AGENT_INVOICE",
  "AGENT_RECEIPT",
  /** The invoice the CRM issues to a buyer for a payment. */
  "INVOICE",
  /** A credit note the CRM issues, and the refund acknowledgement a buyer signs. */
  "CREDIT_NOTE",
  "REFUND_ACK",
  /** The signed Reservation agreement. The signed Contract of Sale is a CONTRACT. */
  "RESERVATION",
  /** A Reservation or Contract of Sale sent to the buyer to check, before it is signed. */
  "DRAFT",
  /** The paper that approves the buyer's reduced VAT. */
  "VAT_APPROVAL",
  /** The architect's certificate that a stage of the building is done, and its photographs. */
  "STAGE_CERTIFICATE",
  "STAGE_PHOTO",
  "OTHER",
]);
export const changeRequestStatusEnum = pgEnum("change_request_status", [
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
]);
/** A commission line is either the rate on the price, or something extra. */
export const commissionKindEnum = pgEnum("commission_kind", ["RATE", "EXTRA"]);
export const commissionStatusEnum = pgEnum("commission_status", [
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
]);

export const agents = pgTable("agents", {
  id: id(),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  commissionRate: rate("commission_rate").default("0").notNull(),
  /**
   * How the agent wants campaigns: EMAIL, WHATSAPP or BOTH. One campaign never
   * reaches them twice: for an agent with both, the campaign says which.
   */
  campaignChannel: text("campaign_channel").default("EMAIL").notNull(),
  /** The rest of the card: what the office needs to write them a cheque. */
  address: text("address"),
  country: text("country"),
  vatNumber: text("vat_number"),
  licenceNumber: text("licence_number"),
  website: text("website"),
  /** The birthday, as the day is written: 1985-03-14. A wish goes on the day. */
  birthDate: text("birth_date"),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * A partner on a development.
 *
 * One Eleven builds alongside other owners, and some developments are held with
 * them rather than outright. A subowner is that partner: their own card, their
 * own contact details, and the developments they hold a share of.
 */
export const subowners = pgTable("subowners", {
  id: id(),
  name: text("name").notNull(),
  company: text("company"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  country: text("country"),
  vatNumber: text("vat_number"),
  registryNumber: text("registry_number"),
  /*
   * What the company's own invoices, receipts and credit notes print. A
   * development the company holds is invoiced in its name, with its logo, its
   * numbers and its bank, and in its own running series.
   */
  tic: text("tic"),
  mobile: text("mobile"),
  fax: text("fax"),
  website: text("website"),
  bankName: text("bank_name"),
  bankBeneficiary: text("bank_beneficiary"),
  bankAccount: text("bank_account"),
  iban: text("iban"),
  bic: text("bic"),
  /** "public:brand/companies/x.png" for a shipped logo, or a stored upload's path. */
  logoPath: text("logo_path"),
  /** The colour its papers are drawn in, as #RRGGBB. */
  brandColor: text("brand_color"),
  /** Where each of its series carries on from, when its old books stopped somewhere. */
  nextInvoice: integer("next_invoice"),
  nextReceipt: integer("next_receipt"),
  nextCreditNote: integer("next_credit_note"),
  isActive: boolean("is_active").default(true).notNull(),
  /** Partners are business contacts, but a stop is still a stop. */
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * A director of a partner company.
 *
 * The partner is a company, and a company is dealt with through people. These
 * are the names the office rings, with the two email addresses some of them
 * use, because writing to the wrong one of the two is how a reply is missed.
 */
export const subownerDirectors = pgTable("subowner_directors", {
  id: id(),
  subownerId: text("subowner_id")
    .notNull()
    .references(() => subowners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  /** A second address, for the ones who use two. */
  emailAlternate: text("email_alternate"),
  phone: text("phone"),
  /** The birthday, as the day is written: 1985-03-14. A wish goes on the day. */
  birthDate: text("birth_date"),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * Who owns a partner company, and how much of it.
 *
 * Not the same question as who holds a development. A partner company has its
 * own shareholders, One Eleven usually among them, and the split differs from
 * company to company because each one was set up with different investors. The
 * holder is a plain name rather than a link to another record, since most of
 * them are companies the CRM has no other business with.
 */
export const subownerShares = pgTable("subowner_shares", {
  id: id(),
  subownerId: text("subowner_id")
    .notNull()
    .references(() => subowners.id, { onDelete: "cascade" }),
  holder: text("holder").notNull(),
  sharePercent: rate("share_percent"),
  /** One Eleven's own line, which every company has and which cannot be taken off. */
  isOneEleven: boolean("is_one_eleven").default(false).notNull(),
  /** A person or a company, and the details the office keeps for them. */
  holderKind: text("holder_kind"),
  /** Their ID or passport number, or the company's registration number. */
  idNumber: text("id_number"),
  email: text("email"),
  phone: text("phone"),
  /** The birthday of a shareholder who is a person: 1985-03-14. A wish goes on the day. */
  birthDate: text("birth_date"),
  address: text("address"),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

export const clients = pgTable("clients", {
  id: id(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  /** How the letters greet them: MR, MRS, MS, or nothing for "Dear Maria". */
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  idType: idTypeEnum("id_type"),
  /** The office's own kind of ID from the Builder, when one was picked. See choices. */
  idTypeChoice: text("id_type_choice"),
  idNumber: text("id_number"),
  /** A company buying: its VAT number, printed on the invoices it receives. */
  vatNumber: text("vat_number"),
  address: text("address"),
  country: text("country"),
  source: contactSourceEnum("source").default("BUYER").notNull(),
  sourceChoice: text("source_choice"),
  /** The agent who brought them, when they came by an agent's referral. */
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
  /**
   * The team member who looks after this client: who calls them back, who
   * their follow ups go to first. Carried over from the lead they came from.
   */
  assignedToId: text("assigned_to_id").references(() => teamMembers.id, { onDelete: "set null" }),
  // Marketing consent. The campaign module may never send to anyone without it.
  marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
  marketingOptInAt: timestamp("marketing_opt_in_at", { withTimezone: true }),
  marketingOptInSource: text("marketing_opt_in_source"),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  notes: text("notes"),
  /** The birthday, as the day is written: 1985-03-14. A wish goes on the day. */
  birthDate: text("birth_date"),
  /*
   * A second buyer: an apartment in two names. Kept on the same client, so
   * there is one record, one contract and one schedule, with both names on
   * the papers and the second person copied on the letters.
   */
  secondFirstName: text("second_first_name"),
  secondLastName: text("second_last_name"),
  secondEmail: text("second_email"),
  secondPhone: text("second_phone"),
  secondIdType: idTypeEnum("second_id_type"),
  secondIdTypeChoice: text("second_id_type_choice"),
  secondIdNumber: text("second_id_number"),
  secondAddress: text("second_address"),
  secondCountry: text("second_country"),
  secondBirthDate: text("second_birth_date"),
  /** How the two are related, in the office's words: wife, son, partner. */
  secondRelation: text("second_relation"),
  /*
   * Paying with a bank loan rather than their own money: the bank, and the
   * people there who are copied on the letters about payments.
   */
  loan: boolean("loan").default(false).notNull(),
  loanBank: text("loan_bank"),
  loanContact: text("loan_contact"),
  /** One address or several, separated by commas. */
  loanEmail: text("loan_email"),
  loanPhone: text("loan_phone"),
  loanNotes: text("loan_notes"),
  /**
   * In the recycle bin rather than gone.
   *
   * Nothing the office deletes by hand is destroyed on the spot: the record is
   * dated here, disappears from every list, and can be put back for thirty days.
   */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /**
   * Closed: the client walked away, and the office has put them to one side.
   *
   * Not deleted, because they paid money and the record of it has to stay. The
   * apartment they held goes back on the market, their contract is marked
   * cancelled, and they move to the Closed list with the reason written down,
   * so the office can find them again if they come back.
   */
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedReason: text("closed_reason"),
  createdAt: created(),
  updatedAt: updated(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").default("ADMIN").notNull(),
  locale: text("locale").default("en").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  agentId: text("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * The company a development is built with.
 *
 * One Eleven builds alongside investors, so a project belongs to one of them and
 * the office needs to know which at a glance.
 */
export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull().unique(),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  slug: text("slug").notNull().unique(),
  location: text("location"),
  /**
   * The development on Google Maps, as the link the office copies from Maps.
   *
   * The location above is words for people; this is where the building is. Every
   * email that sends somebody to the building carries it, so nobody is sent to
   * whatever an address typed from memory happens to find.
   */
  mapsUrl: text("maps_url"),
  description: text("description"),
  status: projectStatusEnum("status").default("UNDER_CONSTRUCTION").notNull(),
  statusChoice: text("status_choice"),
  /**
   * When somebody set the status by hand, and who.
   *
   * The status normally follows the apartments: once every one of them is
   * delivered the development is delivered too. A status chosen by a person
   * outranks that, and these two columns are how the rule knows to keep its
   * hands off. Clearing them hands the status back to the apartments.
   */
  statusByHandAt: timestamp("status_by_hand_at", { withTimezone: true }),
  statusByHandById: text("status_by_hand_by").references(() => users.id, {
    onDelete: "set null",
  }),
  completionBy: text("completion_by"),
  /** When somebody last went over the record and confirmed it is still right. */
  recordCheckedAt: timestamp("record_checked_at", { withTimezone: true }),
  recordCheckedBy: text("record_checked_by"),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * Who holds a development with us, and for how much of it.
 *
 * A project can be held with one partner or several. The share is what they hold
 * of the development, so the office can see at a glance whose building this is.
 */
export const projectPartners = pgTable(
  "project_partners",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    subownerId: text("subowner_id")
      .notNull()
      .references(() => subowners.id, { onDelete: "cascade" }),
    sharePercent: rate("share_percent"),
    role: text("role"),
    notes: text("notes"),
    createdAt: created(),
  },
  (t) => ({
    partnerOnce: unique("project_partners_project_subowner").on(t.projectId, t.subownerId),
  }),
);

export const units = pgTable(
  "units",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    floor: text("floor"),
    bedrooms: integer("bedrooms"),
    coveredArea: numeric("covered_area", { precision: 10, scale: 2 }),
    verandaArea: numeric("veranda_area", { precision: 10, scale: 2 }),
    roofGardenArea: numeric("roof_garden_area", { precision: 10, scale: 2 }),
    parkingSpaces: integer("parking_spaces").default(0).notNull(),
    netPrice: money("net_price").default("0").notNull(),
    /**
     * The VAT the apartment is priced at.
     *
     * Cyprus charges five per cent on a buyer's first home and nineteen on
     * everything else, so the rate belongs to the apartment as it is offered
     * and is settled for good on the contract. Without it a price list can only
     * show the price before VAT, which is not the figure a buyer asks for.
     */
    vatRate: rate("vat_rate").default("19").notNull(),
    status: unitStatusEnum("status").default("AVAILABLE").notNull(),
    statusChoice: text("status_choice"),
    /**
     * When somebody set this apartment's status by hand, and who.
     *
     * Left empty, the status follows the contract: sold on the first payment
     * received, delivered once the contract is paid in full. Set, the person's
     * choice stands and the money leaves it alone.
     */
    statusByHandAt: timestamp("status_by_hand_at", { withTimezone: true }),
    statusByHandById: text("status_by_hand_by").references(() => users.id, {
      onDelete: "set null",
    }),
    // The client who has reserved or bought this apartment. Assigned from the
    // client record, and independent of the contract, which comes later and
    // carries its own agreed price and payment schedule.
    clientId: text("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    floorPlanPath: text("floor_plan_path"),
    notes: text("notes"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => ({
    unitCodePerProject: unique("units_project_code").on(t.projectId, t.code),
  }),
);

/**
 * A contract: one client, one apartment, one agreed price with its VAT rate and
 * its payment schedule.
 *
 * Two sales are never the same agreement even when the terms match, so each one
 * is its own contract with its own dates and its own money. Reuse happens by
 * copying a contract rather than by sharing one, which is why a reference can
 * never be used twice.
 */
export const contracts = pgTable("contracts", {
  id: id(),
  reference: text("reference").notNull().unique(),
  /**
   * The apartment and the buyer. Required by the form that creates a contract,
   * left nullable in the database so an older record is never thrown away and a
   * draft can exist for a moment without one.
   */
  /*
   * One live contract per apartment. A cancelled one keeps the apartment it
   * was for, as a record, and no longer stands in the way of the next buyer.
   */
  unitId: text("unit_id").references(() => units.id),
  clientId: text("client_id").references(() => clients.id),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
  commissionRate: rate("commission_rate"),
  contractDate: timestamp("contract_date", { withTimezone: true }),
  /** A sale, or land given in exchange for apartments. */
  kind: contractKindEnum("kind").default("SALE").notNull(),
  /** The office's own kind of contract from the Builder, counting as a sale or a land exchange. */
  kindChoice: text("kind_choice"),
  netPrice: money("net_price").notNull(),
  /**
   * The rate the whole price is at. Every sale starts at the standard 19% and
   * stays there until the buyer's reduced rate is approved; after approval it
   * is the blended rate of the two parts below, kept for anything that needs
   * one figure.
   */
  vatRate: rate("vat_rate").default("19").notNull(),
  /**
   * The reduced rate, once approved. The part of the price before VAT that
   * qualifies is at reducedVatRate and the rest at standardVatRate. Empty
   * until the approval, and the whole price is then at vatRate.
   */
  reducedVatNet: money("reduced_vat_net"),
  reducedVatRate: rate("reduced_vat_rate"),
  standardVatRate: rate("standard_vat_rate"),
  reducedVatApprovedOn: timestamp("reduced_vat_approved_on", { withTimezone: true }),
  /** The approval itself, as the buyer sent it, uploaded with the approval. */
  reducedVatDocumentId: text("reduced_vat_document_id"),
  /**
   * Cash changing hands alongside the apartments.
   *
   * On a sale it is the part of the agreed price paid in cash rather than
   * written on the contract, and the agent's commission is worked out on the
   * two together. On a land exchange it is the sum that settles the difference
   * between the land and the apartments, in either direction. Kept apart from
   * the price so the contract can say plainly what was agreed.
   */
  cashAmount: money("cash_amount"),
  /**
   * The figure written on the contract itself.
   *
   * Usually the same as the price above, and then this is left empty. It exists
   * for antiparochi, where the value of the agreement and the value the deed
   * states are two different numbers and the office needs to be able to record
   * both without one quietly overwriting the other.
   */
  contractValue: money("contract_value"),
  /*
   * What a land exchange is actually made of.
   *
   * On antiparochi nobody buys anything. The owner of a plot hands it to the
   * developer and is paid in apartments in the building that goes up on it,
   * usually an agreed share of the finished units, sometimes with money
   * settling the difference. So the record has to hold three things a sale
   * never needs: which plot came in, what share of the building was promised,
   * and which apartments that share turned into.
   *
   * The apartments are the join table below rather than the single unit column
   * above, because a land exchange is almost never one apartment.
   */
  /** The plot the owner gave: where it is, in the office's own words. */
  plotDescription: text("plot_description"),
  /** Its registration or plot number, the way the land registry has it. */
  plotReference: text("plot_reference"),
  /** Its area, in square metres. */
  plotArea: numeric("plot_area", { precision: 12, scale: 2 }),
  /** The share of the finished units the owner was promised. */
  sharePercent: rate("share_percent"),
  scheduleType: scheduleTypeEnum("schedule_type").default("STANDARD").notNull(),
  /** 1 for monthly, 3 for quarterly. Only meaningful for a periodic schedule. */
  periodMonths: integer("period_months"),
  status: contractStatusEnum("status").default("DRAFT").notNull(),
  statusChoice: text("status_choice"),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => ({
  unitOpenOnce: uniqueIndex("contracts_unit_open").on(t.unitId).where(sql`status <> 'CANCELLED'`),
}));

/**
 * The apartments a contract covers when one is not enough.
 *
 * A sale is one apartment and says so on the contract itself. A land exchange
 * gives the landowner several, and they arrive one at a time as the building is
 * designed, so they are their own lines and can be added and taken off without
 * touching the agreement they belong to.
 */
export const contractUnits = pgTable(
  "contract_units",
  {
    id: id(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: created(),
  },
  (t) => ({
    unitOncePerContract: unique("contract_units_contract_unit").on(t.contractId, t.unitId),
  }),
);

/** A line of a contract's payment schedule, with its own due date. */
export const installments = pgTable(
  "installments",
  {
    id: id(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    label: text("label").notNull(),
    labelEl: text("label_el"),
    percentage: numeric("percentage", { precision: 7, scale: 4 }).notNull(),
    netAmount: money("net_amount").notNull(),
    vatAmount: money("vat_amount").notNull(),
    totalAmount: money("total_amount").notNull(),
    vatRateApplied: rate("vat_rate_applied").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    trigger: text("trigger"),
    status: installmentStatusEnum("status").default("PENDING").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    /** When the invoice for this stage was sent to the buyer, before the money. */
    invoiceSentAt: timestamp("invoice_sent_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => ({
    seqPerContract: unique("installments_contract_seq").on(t.contractId, t.seq),
  }),
);

export const payments = pgTable("payments", {
  id: id(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  installmentId: text("installment_id").references(() => installments.id, {
    onDelete: "set null",
  }),
  amount: money("amount").notNull(),
  paidOn: timestamp("paid_on", { withTimezone: true }).notNull(),
  method: text("method"),
  /** What "Something else" was, in the office's words. */
  methodOther: text("method_other"),
  receiptNumber: text("receipt_number"),
  /** The cheque number or the bank's reference, printed on the receipt. */
  reference: text("reference"),
  /**
   * PAYMENT is money that arrived. CREDIT is a credit moved from one stage to
   * another, in pairs that add up to nothing: taken off a stage the buyer
   * overpaid and put on the next one, so every total of money received stays
   * the real cash while each stage shows what covers it.
   */
  kind: text("kind").default("PAYMENT").notNull(),
  /** On a credit put on a stage: the invoice that has billed it, once one has. */
  invoicedById: text("invoiced_by_id"),
  notes: text("notes"),
  /*
   * A stage paid in parts: how many parts it was split into and which one
   * this is. The first part issues the invoice for the whole stage, and every
   * part gets its own receipt saying what remains on that invoice.
   */
  partsTotal: integer("parts_total"),
  partNumber: integer("part_number"),
  /** Who else the letter about this payment was copied to, commas between. */
  ccEmails: text("cc_emails"),
  recordedById: text("recorded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: created(),
});

/**
 * The invoices and receipts the CRM issues to buyers.
 *
 * One row per paper, numbered in the office's own running series, with every
 * figure and name as it stood on the day it was issued, because an invoice is
 * never rewritten afterwards. The PDF is kept as a document. A payment taken
 * off again does not take its papers with it: they are marked void and keep
 * their numbers, so the series never has a gap an auditor has to ask about.
 */
export const issuedDocuments = pgTable(
  "issued_documents",
  {
    id: id(),
    /** INVOICE or RECEIPT. */
    kind: text("kind").notNull(),
    number: text("number").notNull(),
    issuedOn: timestamp("issued_on", { withTimezone: true }).notNull(),
    paymentId: text("payment_id").references(() => payments.id, { onDelete: "set null" }),
    contractId: text("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    /**
     * On an invoice issued for a stage before the money came in, the stage. The
     * receipts for the money then name this invoice rather than issuing another.
     */
    installmentId: text("installment_id"),
    /** On a receipt, the invoice it settles. */
    invoiceId: text("invoice_id"),
    netAmount: money("net_amount").notNull(),
    vatAmount: money("vat_amount").notNull(),
    vatRate: rate("vat_rate").notNull(),
    totalAmount: money("total_amount").notNull(),
    /** Everything printed on it, as it was, so it can be read back exactly. */
    snapshot: text("snapshot").notNull(),
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    /** On a credit note: VAT_CHANGE, REFUND or PENALTY. */
    purpose: text("purpose"),
    reason: text("reason"),
    /** On an invoice that was credited: the credit note, and the invoice that replaced it. */
    creditedById: text("credited_by_id"),
    replacedById: text("replaced_by_id"),
    /** The same invoice with CANCELLED stamped across it, kept beside the original. */
    stampedDocumentId: text("stamped_document_id"),
    /** On an invoice to a partner, the company invoice it was issued for. */
    expenseId: text("expense_id"),
    /**
     * The company that issued it, which has its own series: empty for One
     * Eleven, a company's id for a development that company holds.
     */
    issuerId: text("issuer_id").default("").notNull(),
    createdAt: created(),
  },
  (t) => ({
    numberOnce: unique("issued_documents_issuer_kind_number").on(t.issuerId, t.kind, t.number),
  }),
);

/**
 * Money paid back to a buyer: a goodwill refund or a penalty for late delivery.
 *
 * Never a change to the contract: its price and its stages stay exactly as
 * signed. Each one carries its credit note, the acknowledgement the buyer
 * signs, and, once it comes back, the signed copy.
 */
export const refunds = pgTable("refunds", {
  id: id(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  /** REFUND or PENALTY. */
  purpose: text("purpose").notNull(),
  amount: money("amount").notNull(),
  paidOn: timestamp("paid_on", { withTimezone: true }).notNull(),
  method: text("method"),
  reference: text("reference"),
  note: text("note"),
  /** Whether the reservation was cancelled with it. */
  cancelledContract: boolean("cancelled_contract").default(false).notNull(),
  creditNoteId: text("credit_note_id"),
  acknowledgementDocumentId: text("acknowledgement_document_id"),
  signedDocumentId: text("signed_document_id"),
  recordedById: text("recorded_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

export const vatChanges = pgTable("vat_changes", {
  id: id(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  changedByEmail: text("changed_by_email").notNull(),
  fromSummary: text("from_summary").notNull(),
  toSummary: text("to_summary").notNull(),
  appliedToSeqs: text("applied_to_seqs").notNull(),
  createdAt: created(),
});

export const changeRequests = pgTable("change_requests", {
  id: id(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  requestedOn: timestamp("requested_on", { withTimezone: true }).defaultNow().notNull(),
  status: changeRequestStatusEnum("status").default("SUBMITTED").notNull(),
  costImpact: money("cost_impact"),
  createdAt: created(),
  updatedAt: updated(),
});

export const documents = pgTable("documents", {
  id: id(),
  category: documentCategoryEnum("category").default("OTHER").notNull(),
  title: text("title").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  contractId: text("contract_id").references(() => contracts.id, {
    onDelete: "cascade",
  }),
  unitId: text("unit_id").references(() => units.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  changeRequestId: text("change_request_id").references(() => changeRequests.id, {
    onDelete: "cascade",
  }),
  /** An invoice or a receipt filed against one payment. */
  paymentId: text("payment_id").references(() => payments.id, { onDelete: "cascade" }),
  /** The agent's invoice, or the receipt for the commission we paid them. */
  commissionId: text("commission_id"),
  /** The invoice paper behind a company cost. */
  expenseId: text("expense_id"),
  originalName: text("original_name"),
  uploadedById: text("uploaded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  visibleToBuyer: boolean("visible_to_buyer").default(false).notNull(),
  /** The second buyer's paper, their ID say, rather than the main buyer's. */
  secondBuyer: boolean("second_buyer").default(false).notNull(),
  /** The constructor's invoice or receipt for one of their payments. */
  constructorPaymentId: text("constructor_payment_id"),
  /** A stage of the building: its architect's certificate and its photographs. */
  installmentId: text("installment_id"),
  createdAt: created(),
});

/**
 * What an agent earns on one sale.
 *
 * A sale has one RATE line, the percentage on the agreed price, kept in step
 * with the contract automatically. Anything else the office decides to give is
 * an EXTRA line with its own amount and its own name, typically the difference
 * when an apartment went for more than it was priced at. Every line is paid on
 * its own, so the commission generated is the sum of the lines and the
 * commission paid is the sum of what has been settled.
 */
export const commissions = pgTable("commissions", {
  id: id(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
  kind: commissionKindEnum("kind").default("RATE").notNull(),
  label: text("label"),
  baseAmount: money("base_amount").notNull(),
  rate: rate("rate").notNull(),
  amount: money("amount").notNull(),
  status: commissionStatusEnum("status").default("PENDING").notNull(),
  /**
   * When the paperwork was complete, which is when the agent was settled.
   *
   * The office's own rule: the agent's invoice comes in, the office pays and
   * files the receipt, and at that moment the commission is finished. Both
   * papers on the record is the evidence, so this is stamped by the second
   * upload rather than by somebody remembering to press a button, and cleared
   * again if either paper is taken off.
   */
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

export const commissionPayments = pgTable("commission_payments", {
  id: id(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
  commissionId: text("commission_id").references(() => commissions.id, {
    onDelete: "set null",
  }),
  amount: money("amount").notNull(),
  paidOn: timestamp("paid_on", { withTimezone: true }).notNull(),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: created(),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detail: text("detail"),
  createdAt: created(),
});

/**
 * A list, filtered the way somebody keeps needing it.
 *
 * A saved view is nothing but a name on a set of filters, which is why it is
 * stored as the address the list already understands. A view with no owner
 * belongs to the whole office; one with an owner is that person's own.
 */
export const savedViews = pgTable("saved_views", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  /** Which list it belongs to: clients, contracts, leads or projects. */
  list: text("list").notNull(),
  name: text("name").notNull(),
  /** The query string, exactly as the list reads it: status=NEW&source=WEBSITE */
  query: text("query").notNull(),
  pinned: boolean("pinned").default(true).notNull(),
  position: integer("position").default(0).notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

/** Which columns one person wants to see on one list. */
export const listSettings = pgTable(
  "list_settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    list: text("list").notNull(),
    /** A JSON list of the column keys this person has put away. */
    hidden: text("hidden").default("[]").notNull(),
    updatedAt: updated(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.list] })],
);

/**
 * How one person wants their dashboard.
 *
 * The panels in the order they like them, each with a width and a switch for
 * whether it is on show at all. It is stored against the person rather than the
 * company, because the woman chasing payments and the man watching stock do not
 * want the same screen, and it follows them from the office to a laptop at home.
 */
export const dashboardLayouts = pgTable("dashboard_layouts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** A JSON list of { key, width, shown }, in the order they appear. */
  panels: text("panels").notNull(),
  updatedAt: updated(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updated(),
});

/* ---------------------------------------------------------------------------
   Messaging.

   Nothing is ever sent to somebody who is not opted in and not suppressed.
   The suppression list is the hard stop: it is checked on every single send and
   it can only ever grow. Inbound stop keywords and email unsubscribes write to
   it, and nothing in the interface removes a row from it.
   --------------------------------------------------------------------------- */

export const messageChannelEnum = pgEnum("message_channel", ["EMAIL", "SMS", "WHATSAPP", "VIBER"]);

export const messageStatusEnum = pgEnum("message_status", [
  "QUEUED",
  "SENT",
  "FAILED",
  "SUPPRESSED",
  "SIMULATED",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "DRAFT",
  "SENDING",
  "SENT",
  "PARTLY_FAILED",
  "FAILED",
]);

export const campaignAudienceEnum = pgEnum("campaign_audience", [
  "CLIENTS_CONSENTED",
  "AGENTS",
  "SUBOWNERS",
]);

export const suppressionChannelEnum = pgEnum("suppression_channel", ["EMAIL", "PHONE"]);

export const shareLinkKindEnum = pgEnum("share_link_kind", ["PRICE_LIST", "CAMPAIGN_FILES"]);

export const suppressions = pgTable(
  "suppressions",
  {
    id: id(),
    channel: suppressionChannelEnum("channel").notNull(),
    value: text("value").notNull(),
    reason: text("reason"),
    source: text("source"),
    createdAt: created(),
  },
  (t) => ({
    suppressionUnique: unique("suppressions_channel_value").on(t.channel, t.value),
  }),
);

export const campaigns = pgTable("campaigns", {
  id: id(),
  title: text("title").notNull(),
  /** Kept for the message log and for older campaigns; the two flags below decide what goes out. */
  channel: messageChannelEnum("channel").notNull(),
  viaEmail: boolean("via_email").default(true).notNull(),
  viaWhatsapp: boolean("via_whatsapp").default(false).notNull(),
  /** For the agents who want campaigns both ways, the one way this campaign reaches them. */
  agentsBothVia: text("agents_both_via"),
  /** Kept for older campaigns; the three flags below are what the send reads. */
  audience: campaignAudienceEnum("audience").notNull(),
  toClients: boolean("to_clients").default(false).notNull(),
  toAgents: boolean("to_agents").default(false).notNull(),
  toSubowners: boolean("to_subowners").default(false).notNull(),
  /** Leads, all of them or only the ones chosen below. */
  toLeads: boolean("to_leads").default(false).notNull(),
  /** The leads chosen by hand, as a JSON list of ids. Empty means every lead. */
  leadIds: text("lead_ids"),
  /**
   * The buyers of what the campaign is about: the clients holding a reserved,
   * sold or delivered apartment there. Service letters about their own home,
   * so they are not limited to the clients who accepted marketing.
   */
  toBuyers: boolean("to_buyers").default(false).notNull(),
  /** The buyers chosen by hand, as a JSON list of client ids. Empty means every buyer. */
  buyerIds: text("buyer_ids"),
  /** The developments a campaign shows, for {{projects}}, as a JSON list of ids. */
  projectIds: text("project_ids"),
  /** The template this was written from, when it came from one. */
  templateKey: text("template_key"),
  subject: text("subject"),
  /** The email body. */
  body: text("body").notNull(),
  /** The WhatsApp body, which carries a link to the files rather than the files. */
  bodyWhatsapp: text("body_whatsapp"),
  status: campaignStatusEnum("status").default("DRAFT").notNull(),
  shareLinkId: text("share_link_id"),
  /**
   * What the campaign is about, a development or one apartment in it. Fills
   * {{project}}, {{unit}}, {{location}}, {{details}}, {{price}} and
   * {{completion}} when it is tested and when it is sent.
   */
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
  /**
   * Everything the campaign is about, when it is more than one: a JSON list of
   * "project:<id>" and "unit:<id>". The two columns above keep the first of
   * each, for what reads only one.
   */
  aboutIds: text("about_ids"),
  createdByEmail: text("created_by_email"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});

export const campaignDocuments = pgTable(
  "campaign_documents",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
  },
  (t) => ({
    campaignDocumentUnique: unique("campaign_documents_unique").on(t.campaignId, t.documentId),
  }),
);

export const messages = pgTable("messages", {
  id: id(),
  campaignId: text("campaign_id").references(() => campaigns.id, {
    onDelete: "set null",
  }),
  channel: messageChannelEnum("channel").notNull(),
  toAddress: text("to_address").notNull(),
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  agentId: text("agent_id").references(() => agents.id, {
    onDelete: "set null",
  }),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  subownerId: text("subowner_id").references(() => subowners.id, {
    onDelete: "set null",
  }),
  subject: text("subject"),
  body: text("body").notNull(),
  status: messageStatusEnum("status").default("QUEUED").notNull(),
  providerId: text("provider_id"),
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: created(),
});

export const shareLinks = pgTable("share_links", {
  id: id(),
  token: text("token").notNull().unique(),
  kind: shareLinkKindEnum("kind").notNull(),
  /** The campaign whose files this link opens, for a CAMPAIGN_FILES link. */
  campaignId: text("campaign_id"),
  /**
   * Which apartments a PRICE_LIST link shows. Both empty is everything
   * available; a development is its available apartments; an apartment is that
   * one, and the rest of its development once it has gone. A campaign's own
   * link follows what the campaign is about.
   */
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  unitId: text("unit_id").references(() => units.id, { onDelete: "set null" }),
  /** Several developments, as a JSON list of ids, for a campaign that shows more than one. */
  projectIds: text("project_ids"),
  note: text("note"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdByEmail: text("created_by_email"),
  createdAt: created(),
});

/* ---------------------------------------------------------------------------
   Leads from the website.

   The website posts a lead to the CRM the moment somebody fills a form. A
   lead is kept exactly as it arrived, is never a client until the office says
   so, and carries no consent of its own: ticking a box on a website form is
   recorded on the lead, and it only becomes marketing consent when the office
   turns the lead into a client.
   --------------------------------------------------------------------------- */

/**
 * Where a lead came to us.
 *
 * The office's own list, in the office's own words. WEBSITE is the lead form
 * on the website, which is what the API posts; everything else is typed in by
 * whoever took the lead. ENQUIRY is kept because older leads carry it and
 * nothing the office recorded is rewritten to suit a newer list.
 */
export const leadSourceEnum = pgEnum("lead_source_kind", [
  "WEBSITE",
  "ENQUIRY",
  "AGENT",
  "WHATSAPP",
  "OTHER",
  "INSTAGRAM",
  "FACEBOOK",
  "SOCIAL_MEDIA",
  "PHONE",
  "EMAIL",
  "REFERRAL",
]);

/**
 * Where a lead stands.
 *
 * NEW is written by the CRM the moment a lead arrives and is never chosen
 * by hand. The rest are the office's own words: contacted, no response, not
 * interested, on hold, active, became a client, closed. ACTIVE is the old
 * word for ACTIVE and stays in the type so leads recorded under it are not
 * lost, but it is not offered any more.
 */
export const leadStatusEnum = pgEnum("lead_status", [
  "NEW",
  "CONTACTED",
  "ACTIVE",
  "CONVERTED",
  "CLOSED",
  "NO_RESPONSE",
  "NOT_INTERESTED",
  "ON_HOLD",
]);

export const leads = pgTable("leads", {
  id: id(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  message: text("message"),
  /** What the lead is about, in the website's own words. */
  interest: text("interest"),
  /** The project the form was about, matched by name or by code where it was given. */
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  projectName: text("project_name"),
  unitCode: text("unit_code"),
  budget: text("budget"),
  language: text("language"),
  country: text("country"),
  /** Where it came from, as one of the office's own categories. */
  sourceKind: leadSourceEnum("source_kind").default("WEBSITE").notNull(),
  sourceChoice: text("source_choice"),
  /** The free text behind OTHER, or whatever the website called itself. */
  source: text("source"),
  formName: text("form_name"),
  pageUrl: text("page_url"),
  referrer: text("referrer"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  /** What the form's consent box said, if it had one. Never consent on its own. */
  consent: boolean("consent").default(false).notNull(),
  consentText: text("consent_text"),
  status: leadStatusEnum("status").default("NEW").notNull(),
  statusChoice: text("status_choice"),
  /**
   * The agent who brought this lead, when one did.
   *
   * Written on the lead rather than worked out later, because the person
   * taking the telephone call is the one who knows. It travels to the contract
   * when the sale is written, which is where the commission is calculated from,
   * so nobody has to remember who introduced a buyer six months ago.
   */
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
  /**
   * Whose lead this is.
   *
   * One person in the office owns every lead, by name, and it is the same
   * list of people who go to the appointments, so nobody has to keep two ideas
   * of who works here. The follow ups on this lead are theirs, and the
   * evening email that lists tomorrow's follow ups goes to them.
   */
  assignedToId: text("assigned_to_id").references(() => teamMembers.id, {
    onDelete: "set null",
  }),
  /** The client this lead became, once the office accepted it. */
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  notes: text("notes"),
  /** The whole payload as it arrived, so nothing the website sends is ever lost. */
  payload: text("payload"),
  apiKeyId: text("api_key_id"),
  remoteIp: text("remote_ip"),
  /** In the recycle bin rather than gone. See the note on clients. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * One note on a lead, with the day it was written.
 *
 * The office does not keep one note on a lead, it keeps a running record:
 * contacted, contacted again, meeting agreed, came to the show flat. A single
 * box loses all of that the moment somebody types over it, so each note is its
 * own row with its own date and its own author, and the lead reads as a
 * history rather than as a last known state.
 */
export const leadNotes = pgTable("lead_notes", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  writtenById: text("written_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

/** A follow up is either still to be done or it has been done. */
export const followUpStatusEnum = pgEnum("follow_up_status", ["PENDING", "DONE", "CANCELLED"]);

/**
 * The next time somebody is going back to this lead.
 *
 * A note on a lead says what happened. A follow up says what happens next, and
 * when, and it does not go quiet: it sits in the notifications from the evening
 * before until somebody marks it done, and it is in the email the assigned
 * person gets the night before. That is the whole difference between a CRM and
 * a notebook, and it is why the date is a column of its own rather than a
 * sentence somebody wrote inside a note.
 */
export const leadFollowUps = pgTable("lead_follow_ups", {
  id: id(),
  /* Who it is with, the same four ways as an appointment: a lead, a client,
     an agent, or somebody the CRM has no record of. */
  leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  otherName: text("other_name"),
  otherEmail: text("other_email"),
  otherPhone: text("other_phone"),
  /** Who in the office follows it up; for a lead it is the lead's own person unless said. */
  assignedToId: text("assigned_to_id").references(() => teamMembers.id, { onDelete: "set null" }),
  /** The day and time of the next meeting or call. */
  at: timestamp("at", { withTimezone: true }).notNull(),
  note: text("note"),
  status: followUpStatusEnum("status").default("PENDING").notNull(),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * A key the website uses to post leads.
 *
 * Only the hash is kept. The key itself is shown once, when it is made, and
 * after that nobody, the office included, can read it back.
 */
export const apiKeys = pgTable("api_keys", {
  id: id(),
  name: text("name").notNull(),
  /** The first characters, so a key can be recognised in a list. */
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  scope: text("scope").default("LEADS").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  useCount: integer("use_count").default(0).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdByEmail: text("created_by_email"),
  createdAt: created(),
});

/* ---------------------------------------------------------------------------
   Ready made emails.

   The office writes the same message often: a new apartment released, a price
   list, an invitation. A template is that message kept once, with the places
   where the details go, so a campaign starts written rather than blank.
   --------------------------------------------------------------------------- */

export const emailTemplates = pgTable("email_templates", {
  id: id(),
  /** Short name used in links, for example new_property. */
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  subject: text("subject"),
  body: text("body").notNull(),
  bodyWhatsapp: text("body_whatsapp"),
  subjectEl: text("subject_el"),
  bodyEl: text("body_el"),
  bodyWhatsappEl: text("body_whatsapp_el"),
  /** Which groups this one is normally sent to. */
  toClients: boolean("to_clients").default(false).notNull(),
  toAgents: boolean("to_agents").default(false).notNull(),
  toSubowners: boolean("to_subowners").default(false).notNull(),
  toLeads: boolean("to_leads").default(false).notNull(),
  toBuyers: boolean("to_buyers").default(false).notNull(),
  /** A template the CRM ships with. It can be edited but not deleted. */
  isSystem: boolean("is_system").default(false).notNull(),
  /**
   * The CRM sends this one by itself, when something happens.
   *
   * A campaign template is chosen by a person and sent by a person. An
   * automatic one goes out on its own, the moment a payment is receipted, so it
   * lives in its own section with a switch beside it and the office can read
   * exactly what will leave the building before it does.
   */
  isAutomatic: boolean("is_automatic").default(false).notNull(),
  /** Off means the CRM stops sending it. The wording is kept either way. */
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

/** Where an automatic email got to. */
export const automaticEmailStatusEnum = pgEnum("automatic_email_status", [
  "SENT",
  "WAITING",
  "FAILED",
  "SKIPPED",
]);

/**
 * One automatic email, and what became of it.
 *
 * Two jobs. It stops the same letter going twice, which is the thing that makes
 * a buyer doubt everything else the office sends. And it holds the one that
 * cannot go yet: the signing letter carries the contract, so if the money is
 * receipted before the contract is filed, the letter waits here, marked
 * waiting, and goes the moment somebody attaches it.
 */
export const automaticEmails = pgTable("automatic_emails", {
  id: id(),
  /** Which letter: paid_reservation, paid_signing, paid_installment, paid_final. */
  templateKey: text("template_key").notNull(),
  contractId: text("contract_id").references(() => contracts.id, { onDelete: "cascade" }),
  paymentId: text("payment_id").references(() => payments.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  /** The appointment a confirmation, a change, a cancellation or a reminder is about. */
  appointmentId: text("appointment_id").references(() => appointments.id, {
    onDelete: "cascade",
  }),
  /** The agent a commission letter went to. */
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
  status: automaticEmailStatusEnum("status").default("SENT").notNull(),
  /** Why it is waiting, or why it did not go, in plain words. */
  reason: text("reason"),
  /** The letter to an agent about a potential client: which lead. */
  leadId: text("lead_id"),
  /** A birthday wish: the year it was for, so it goes once a year. */
  forYear: integer("for_year"),
  /** It went to the second buyer rather than the main one. */
  secondBuyer: boolean("second_buyer").default(false).notNull(),
  /** A birthday wish to somebody who is not a client: "agent:<id>", "team:<id>", "holder:<id>", "director:<id>". */
  personKey: text("person_key"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});

/* ---------------------------------------------------------------------------
   What the company pays.

   Marketing, the office, the rent, the bills. Every invoice the company is
   billed for, with the paper behind it and whether it has been paid.
   --------------------------------------------------------------------------- */

export const expenseCategoryEnum = pgEnum("expense_category", [
  "MARKETING",
  "OFFICE",
  "RENT",
  "BILLS",
  "LEGAL",
  "CONSTRUCTION",
  "MANAGEMENT_FEES",
  "SERVICES",
  "OTHER",
]);

export const expenseStatusEnum = pgEnum("expense_status", ["UNPAID", "PARTIALLY_PAID", "PAID"]);

export const expenses = pgTable("expenses", {
  id: id(),
  supplier: text("supplier").notNull(),
  category: expenseCategoryEnum("category").default("OTHER").notNull(),
  categoryChoice: text("category_choice"),
  reference: text("reference"),
  description: text("description"),
  issueDate: timestamp("issue_date", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  netAmount: money("net_amount").default("0").notNull(),
  vatAmount: money("vat_amount").default("0").notNull(),
  totalAmount: money("total_amount").default("0").notNull(),
  paidAmount: money("paid_amount").default("0").notNull(),
  status: expenseStatusEnum("status").default("UNPAID").notNull(),
  paidOn: timestamp("paid_on", { withTimezone: true }),
  /** The development it belongs to, when it belongs to one. */
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  notes: text("notes"),
  recordedByEmail: text("recorded_by_email"),
  /**
   * Which way the money goes. IN is an invoice One Eleven received and pays.
   * OUT is One Eleven charging a partner: the CRM numbers and draws that
   * invoice in the company's own series and emails it to them.
   */
  direction: text("direction").default("IN").notNull(),
  /** What Other means, in the office's words, when the category is Other. */
  categoryOther: text("category_other"),
  /** The partner company on either side of it, when it is one of ours. */
  subownerId: text("subowner_id").references(() => subowners.id, { onDelete: "set null" }),
  vatRate: rate("vat_rate"),
  /** On an invoice we issued, the numbered paper in the invoice series. */
  issuedDocumentId: text("issued_document_id"),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  /**
   * Which of our companies the invoice is from (OUT) or to (IN). Empty is One
   * Eleven itself, from Settings; otherwise a company's id, with its own series.
   */
  ourCompanyId: text("our_company_id").default(""),
  /** The other side: COMPANY, CLIENT, AGENT, CONSTRUCTOR, TEAM or OTHER (typed by name). */
  partyKind: text("party_kind"),
  partyId: text("party_id"),
  partyEmail: text("party_email"),
  partyAddress: text("party_address"),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * A line of an invoice under Company that covers more than one development:
 * management fees for Uno and for Due, say, each with its own amount. The
 * invoice prints one line each, and the reports count each amount against
 * its own development. An invoice for one development has no lines.
 */
export const expenseLines = pgTable("expense_lines", {
  id: id(),
  expenseId: text("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  description: text("description"),
  netAmount: money("net_amount").default("0").notNull(),
  vatAmount: money("vat_amount").default("0").notNull(),
  totalAmount: money("total_amount").default("0").notNull(),
  seq: integer("seq").default(0).notNull(),
  /** What this line is for: the category, the office's own one, or Other in words. */
  category: text("category"),
  categoryChoice: text("category_choice"),
  categoryOther: text("category_other"),
  vatRate: rate("vat_rate"),
  createdAt: created(),
});

/**
 * Every payment on an invoice under Company.
 *
 * Money we received on an invoice we issued: our receipt is numbered, drawn and
 * emailed the moment it is recorded. Money we paid on an invoice we received:
 * their receipt is filed on it, and until it is, the invoice says so.
 */
export const expensePayments = pgTable("expense_payments", {
  id: id(),
  expenseId: text("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  paidOn: timestamp("paid_on", { withTimezone: true }).notNull(),
  amount: money("amount").notNull(),
  method: text("method"),
  /** What "Something else" was, in the office's words. */
  methodOther: text("method_other"),
  reference: text("reference"),
  /** Our receipt, on money we received. */
  issuedDocumentId: text("issued_document_id"),
  /** Their receipt, on money we paid: the file. */
  receiptDocumentId: text("receipt_document_id"),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  emailError: text("email_error"),
  recordedByEmail: text("recorded_by_email"),
  createdAt: created(),
});

/* ---------------------------------------------------------------------------
   APPOINTMENTS

   Where somebody from the office is going, and who they are meeting.

   The office keeps these on paper and in their heads, which is why a viewing
   gets double booked and why nobody can say afterwards whether it happened. So
   an appointment is a record: a place, a day, a time, and the person it is
   with, who may be a client or still only a lead, since most first viewings
   happen before anybody is a client.

   The day after, it is either done or it did not happen, and until somebody
   says which, the CRM asks. That is the whole point of keeping them: an
   appointment nobody answered for is a viewing nobody followed up.
   --------------------------------------------------------------------------- */

export const appointmentStatusEnum = pgEnum("appointment_status", ["PLANNED", "DONE", "MISSED"]);

/**
 * What kind of appointment it is.
 *
 * The office's own six, in their own words. Two of them are visits to a
 * supplier and carry that supplier's name with them, which is why the type is
 * worth having at all: "Studio Bagno" typed into a place field twenty times is
 * twenty different spellings, and the office wants to be able to ask how often
 * somebody is at the tile shop.
 */
export const appointmentTypeEnum = pgEnum("appointment_type", [
  "TIMBER",
  "BATHROOMS_TILES",
  "OFFICE",
  "PHONE_CALL",
  "BUILDING",
  "OTHER",
]);

/**
 * The people in the office who go to the appointments.
 *
 * Not users: Panayiotis does not need a login to be the man going to the tile
 * shop on Thursday, and asking the office to make a password before they can
 * write his name down is how a feature goes unused. A name and an email
 * address is the whole record, the email because the day's summary is sent to
 * him.
 */
export const teamMembers = pgTable("team_members", {
  id: id(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  /** The birthday, as the day is written: 1985-03-14. A wish goes on the day. */
  birthDate: text("birth_date"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

export const appointments = pgTable("appointments", {
  id: id(),
  /** Where it is, in the office's own words: "Studio Bagno", "the site office". */
  place: text("place").notNull(),
  /** Which of the office's six kinds of appointment this is. */
  type: appointmentTypeEnum("type").default("OTHER").notNull(),
  typeChoice: text("type_choice"),
  /**
   * What Other was.
   *
   * Five of the six kinds say what they are. Other says nothing, which is the
   * one that needed a line of its own: the valuer, the bank, the lawyer. Asked
   * for when Other is chosen and shown wherever the kind is shown.
   */
  typeOther: text("type_other"),
  /** Who is going. Nothing happens without somebody's name on it. */
  assignedToId: text("assigned_to_id").references(() => teamMembers.id, {
    onDelete: "set null",
  }),
  /** The day and the time in one, so the two can never disagree. */
  at: timestamp("at", { withTimezone: true }).notNull(),
  /** Who it is with: a client, a lead who is not one yet, an agent, or somebody else. */
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  /**
   * Somebody the CRM has no record of: the valuer, the bank, a supplier.
   * Named here, with the address the confirmation goes to.
   */
  otherName: text("other_name"),
  otherEmail: text("other_email"),
  otherPhone: text("other_phone"),
  /** Which development, when the appointment is at a building. */
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  /** Anything added to the place: the meeting room, the floor. The place above is written from it. */
  placeDetail: text("place_detail"),
  status: appointmentStatusEnum("status").default("PLANNED").notNull(),
  /** When somebody said whether it happened, and who. */
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  answeredById: text("answered_by_id").references(() => users.id, { onDelete: "set null" }),
  createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * Cash received against the cash part of a sale.
 *
 * The contract says how much of the price is paid in cash beside the figure on
 * the contract. This is the money as it actually arrives, a line at a time, so
 * the office can see what has come in and what is still to come. It is kept
 * apart from the payments on purpose: it carries no VAT, no invoice and no
 * receipt, and no automatic email goes out for it.
 */
export const cashReceipts = pgTable("cash_receipts", {
  id: id(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  receivedOn: timestamp("received_on", { withTimezone: true }).notNull(),
  note: text("note"),
  recordedById: text("recorded_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});

/* ---------------------------------------------------------------------------
   The office's own lists, from the Builder.

   One row for every value the office has touched: a built in one it renamed,
   moved or switched off, or one it added itself. A built in value nobody has
   touched has no row and reads as the CRM ships it. A value the office added
   has a code that starts with the built in value it counts as, which is what
   the record's own column holds, so the money and the reports never need to
   know the office's words. See src/lib/choices.
   --------------------------------------------------------------------------- */
export const choices = pgTable(
  "choices",
  {
    id: id(),
    list: text("list").notNull(),
    code: text("code").notNull(),
    labelEn: text("label_en"),
    labelEl: text("label_el"),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    builtin: boolean("builtin").default(false).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => ({ listCode: uniqueIndex("choices_list_code_idx").on(table.list, table.code) }),
);

/* ---------------------------------------------------------------------------
   Constructors
   --------------------------------------------------------------------------- */

/** Who builds a development: their details, kept like an agent's or a company's. */
export const constructors = pgTable("constructors", {
  id: id(),
  name: text("name").notNull(),
  company: text("company"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  vatNumber: text("vat_number"),
  registryNumber: text("registry_number"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * The office's partners and collaborators outside the company: architects, 3D
 * visualisation studios, kitchens, bathrooms, marketing. A directory of who to
 * call, nothing more: no money and no papers hang on a partner.
 *
 * The category is a code from the Builder's "Partner categories" list, so the
 * office can rename the categories and add its own.
 */
export const partners = pgTable("partners", {
  id: id(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  email: text("email"),
  mobile: text("mobile"),
  /** A Google Maps link to their showroom or office. */
  locationUrl: text("location_url"),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

/** A development a constructor builds, and the amount agreed for building it. One constructor a development. */
export const constructorProjects = pgTable(
  "constructor_projects",
  {
    id: id(),
    constructorId: text("constructor_id")
      .notNull()
      .references(() => constructors.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    agreedAmount: money("agreed_amount").default("0").notNull(),
    notes: text("notes"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => ({
    projectOnce: unique("constructor_projects_project_once").on(t.projectId),
  }),
);

/**
 * A payment to the constructor for a development: Pending when it is written
 * down, then Paid once the constructor's invoice and receipt are in, or
 * Cancelled. What kind of payment it is, the office writes in its own words.
 */
export const constructorPayments = pgTable("constructor_payments", {
  id: id(),
  constructorProjectId: text("constructor_project_id")
    .notNull()
    .references(() => constructorProjects.id, { onDelete: "cascade" }),
  paidOn: timestamp("paid_on", { withTimezone: true }).notNull(),
  kind: text("kind"),
  amount: money("amount").default("0").notNull(),
  /** PENDING, PAID or CANCELLED. */
  status: text("status").default("PENDING").notNull(),
  notes: text("notes"),
  recordedByEmail: text("recorded_by_email"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * The two papers a buyer signs: the Reservation and the Contract of Sale.
 *
 * Each goes the same way. The draft is uploaded and sent to the buyer to check;
 * if they want a change the draft is replaced and sent again. When they are
 * happy and want to go ahead, the invoice for the stage it is paid with is
 * issued and sent, so they come to sign with it in hand. The signed copy then
 * takes the draft's place, and the letter with the receipt for the money goes
 * with the signed copy attached.
 */
export const signingPapers = pgTable(
  "signing_papers",
  {
    id: id(),
    contractId: text("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    /** RESERVATION or SALE. */
    kind: text("kind").notNull(),
    /** The stage of the schedule this paper is paid with, chosen when its invoice is issued. */
    installmentId: text("installment_id"),
    draftDocumentId: text("draft_document_id").references(() => documents.id, { onDelete: "set null" }),
    signedDocumentId: text("signed_document_id").references(() => documents.id, { onDelete: "set null" }),
    /** The invoice issued for the stage before the money came in. */
    invoiceId: text("invoice_id"),
    sentForReviewAt: timestamp("sent_for_review_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    invoiceSentAt: timestamp("invoice_sent_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** When the signed copy went to the buyer, with the letter for the money or on its own. */
    signedSentAt: timestamp("signed_sent_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => ({
    paperOnce: uniqueIndex("signing_papers_contract_kind").on(t.contractId, t.kind),
  }),
);
