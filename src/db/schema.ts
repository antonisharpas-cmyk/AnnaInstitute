import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
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
]);
export const unitStatusEnum = pgEnum("unit_status", ["AVAILABLE", "RESERVED", "SOLD", "DELIVERED"]);
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
  "OTHER",
]);
export const documentCategoryEnum = pgEnum("document_category", [
  "IDENTIFICATION",
  "CONTRACT",
  "RECEIPT",
  "FLOOR_PLAN",
  "CHANGE_REQUEST",
  "PROGRESS_PHOTO",
  "PRICE_LIST",
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
  /** The rest of the card: what the office needs to write them a cheque. */
  address: text("address"),
  country: text("country"),
  vatNumber: text("vat_number"),
  licenceNumber: text("licence_number"),
  website: text("website"),
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
  isActive: boolean("is_active").default(true).notNull(),
  /** Partners are business contacts, but a stop is still a stop. */
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

export const clients = pgTable("clients", {
  id: id(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  idType: idTypeEnum("id_type"),
  idNumber: text("id_number"),
  address: text("address"),
  country: text("country"),
  source: contactSourceEnum("source").default("BUYER").notNull(),
  // Marketing consent. The campaign module may never send to anyone without it.
  marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
  marketingOptInAt: timestamp("marketing_opt_in_at", { withTimezone: true }),
  marketingOptInSource: text("marketing_opt_in_source"),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  notes: text("notes"),
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
  description: text("description"),
  status: projectStatusEnum("status").default("UNDER_CONSTRUCTION").notNull(),
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
    status: unitStatusEnum("status").default("AVAILABLE").notNull(),
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
  unitId: text("unit_id")
    .references(() => units.id)
    .unique(),
  clientId: text("client_id").references(() => clients.id),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
  commissionRate: rate("commission_rate"),
  contractDate: timestamp("contract_date", { withTimezone: true }),
  netPrice: money("net_price").notNull(),
  /** One rate for the whole price. Editable, because the law changes. */
  vatRate: rate("vat_rate").default("5").notNull(),
  scheduleType: scheduleTypeEnum("schedule_type").default("STANDARD").notNull(),
  /** 1 for monthly, 3 for quarterly. Only meaningful for a periodic schedule. */
  periodMonths: integer("period_months"),
  status: contractStatusEnum("status").default("DRAFT").notNull(),
  notes: text("notes"),
  createdAt: created(),
  updatedAt: updated(),
});

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
  receiptNumber: text("receipt_number"),
  notes: text("notes"),
  recordedById: text("recorded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
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
  /** The invoice paper behind a company cost. */
  expenseId: text("expense_id"),
  originalName: text("original_name"),
  uploadedById: text("uploaded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  visibleToBuyer: boolean("visible_to_buyer").default(false).notNull(),
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
  /** Kept for older campaigns; the three flags below are what the send reads. */
  audience: campaignAudienceEnum("audience").notNull(),
  toClients: boolean("to_clients").default(false).notNull(),
  toAgents: boolean("to_agents").default(false).notNull(),
  toSubowners: boolean("to_subowners").default(false).notNull(),
  /** The template this was written from, when it came from one. */
  templateKey: text("template_key"),
  subject: text("subject"),
  /** The email body. */
  body: text("body").notNull(),
  /** The WhatsApp body, which carries a link to the files rather than the files. */
  bodyWhatsapp: text("body_whatsapp"),
  status: campaignStatusEnum("status").default("DRAFT").notNull(),
  shareLinkId: text("share_link_id"),
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
  note: text("note"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdByEmail: text("created_by_email"),
  createdAt: created(),
});

/* ---------------------------------------------------------------------------
   Leads from the website.

   The website posts an enquiry to the CRM the moment somebody fills a form. A
   lead is kept exactly as it arrived, is never a client until the office says
   so, and carries no consent of its own: ticking a box on a website form is
   recorded on the lead, and it only becomes marketing consent when the office
   turns the lead into a client.
   --------------------------------------------------------------------------- */

/** Where a lead came to us. WEBSITE is what the API posts; the rest are typed in. */
export const leadSourceEnum = pgEnum("lead_source_kind", [
  "WEBSITE",
  "ENQUIRY",
  "AGENT",
  "WHATSAPP",
  "OTHER",
]);

export const leadStatusEnum = pgEnum("lead_status", [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "CONVERTED",
  "CLOSED",
]);

export const leads = pgTable("leads", {
  id: id(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  message: text("message"),
  /** What the enquiry is about, in the website's own words. */
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
  /** The client this lead became, once the office accepted it. */
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  notes: text("notes"),
  /** The whole payload as it arrived, so nothing the website sends is ever lost. */
  payload: text("payload"),
  apiKeyId: text("api_key_id"),
  remoteIp: text("remote_ip"),
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
  /** A template the CRM ships with. It can be edited but not deleted. */
  isSystem: boolean("is_system").default(false).notNull(),
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
  "OTHER",
]);

export const expenseStatusEnum = pgEnum("expense_status", ["UNPAID", "PARTIALLY_PAID", "PAID"]);

export const expenses = pgTable("expenses", {
  id: id(),
  supplier: text("supplier").notNull(),
  category: expenseCategoryEnum("category").default("OTHER").notNull(),
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
  createdAt: created(),
  updatedAt: updated(),
});
