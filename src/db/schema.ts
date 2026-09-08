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
  isActive: boolean("is_active").default(true).notNull(),
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

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  location: text("location"),
  description: text("description"),
  status: projectStatusEnum("status").default("UNDER_CONSTRUCTION").notNull(),
  completionBy: text("completion_by"),
  createdAt: created(),
  updatedAt: updated(),
});

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
 * A contract is the agreement itself: a price, a VAT rate and a payment
 * schedule. It stands on its own, with no apartment and no client on it, so the
 * same contract can be put on several apartments across different buildings
 * (see contractUnits). That is also what makes copying one worth doing.
 */
export const contracts = pgTable("contracts", {
  id: id(),
  reference: text("reference").notNull().unique(),
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

/**
 * One apartment put on one contract: the sale.
 *
 * An apartment can only be on one contract at a time, which the unique key
 * enforces. The buyer and the agent belong here rather than on the contract,
 * because the same contract can serve different buyers in different buildings.
 * Payments are recorded against this row, so apartment 101 can be at
 * installment three while apartment 205 is still at the first one.
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
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    commissionRate: rate("commission_rate"),
    notes: text("notes"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => ({
    oneContractPerUnit: unique("contract_units_unit").on(t.unitId),
  }),
);

/**
 * A line of a payment schedule.
 *
 * There are two kinds. A line with no assignment is part of the contract's own
 * plan: the shape the office reuses, with amounts but no dates. A line with an
 * assignment belongs to one apartment on that contract, and that is the one
 * that carries dates and takes payments. Putting a contract on an apartment
 * copies the plan across, so a buyer who signed six months later has the same
 * stages on his own dates and can be at a different stage entirely.
 */
export const installments = pgTable("installments", {
  id: id(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  /** Null on the contract's own plan, set on an apartment's schedule. */
  assignmentId: text("assignment_id").references(() => contractUnits.id, {
    onDelete: "cascade",
  }),
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
});

export const payments = pgTable("payments", {
  id: id(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  /** Which apartment on the contract paid. */
  assignmentId: text("assignment_id").references(() => contractUnits.id, {
    onDelete: "cascade",
  }),
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
  originalName: text("original_name"),
  uploadedById: text("uploaded_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  visibleToBuyer: boolean("visible_to_buyer").default(false).notNull(),
  createdAt: created(),
});

export const commissions = pgTable("commissions", {
  id: id(),
  /** The sale the commission is earned on: one apartment on one contract. */
  assignmentId: text("assignment_id").references(() => contractUnits.id, {
    onDelete: "cascade",
  }),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id),
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

export const campaignAudienceEnum = pgEnum("campaign_audience", ["CLIENTS_CONSENTED", "AGENTS"]);

export const suppressionChannelEnum = pgEnum("suppression_channel", ["EMAIL", "PHONE"]);

export const shareLinkKindEnum = pgEnum("share_link_kind", ["PRICE_LIST"]);

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
  channel: messageChannelEnum("channel").notNull(),
  audience: campaignAudienceEnum("audience").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
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
  note: text("note"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdByEmail: text("created_by_email"),
  createdAt: created(),
});
