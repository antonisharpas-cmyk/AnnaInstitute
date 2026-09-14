CREATE TYPE "public"."expense_category" AS ENUM('MARKETING', 'OFFICE', 'RENT', 'BILLS', 'LEGAL', 'CONSTRUCTION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID');--> statement-breakpoint
ALTER TYPE "public"."campaign_audience" ADD VALUE 'SUBOWNERS';--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text,
	"body" text NOT NULL,
	"body_whatsapp" text,
	"subject_el" text,
	"body_el" text,
	"body_whatsapp_el" text,
	"to_clients" boolean DEFAULT false NOT NULL,
	"to_agents" boolean DEFAULT false NOT NULL,
	"to_subowners" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier" text NOT NULL,
	"category" "expense_category" DEFAULT 'OTHER' NOT NULL,
	"reference" text,
	"description" text,
	"issue_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"net_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "expense_status" DEFAULT 'UNPAID' NOT NULL,
	"paid_on" timestamp with time zone,
	"project_id" text,
	"notes" text,
	"recorded_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"subowner_id" text NOT NULL,
	"share_percent" numeric(6, 3),
	"role" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_partners_project_subowner" UNIQUE("project_id","subowner_id")
);
--> statement-breakpoint
CREATE TABLE "subowners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"country" text,
	"vat_number" text,
	"registry_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "vat_number" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "licence_number" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "to_clients" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "to_agents" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "to_subowners" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "template_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "expense_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "subowner_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "record_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "record_checked_by" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_partners" ADD CONSTRAINT "project_partners_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_partners" ADD CONSTRAINT "project_partners_subowner_id_subowners_id_fk" FOREIGN KEY ("subowner_id") REFERENCES "public"."subowners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_subowner_id_subowners_id_fk" FOREIGN KEY ("subowner_id") REFERENCES "public"."subowners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Older campaigns carried one audience. The three flags are filled from it, so
-- nothing that was already sent changes who it went to.
UPDATE "campaigns" SET "to_clients" = true WHERE "audience" = 'CLIENTS_CONSENTED';--> statement-breakpoint
UPDATE "campaigns" SET "to_agents" = true WHERE "audience" = 'AGENTS';
