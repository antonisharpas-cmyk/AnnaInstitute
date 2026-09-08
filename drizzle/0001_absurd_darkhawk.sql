CREATE TYPE "public"."campaign_audience" AS ENUM('CLIENTS_CONSENTED', 'AGENTS');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'SENDING', 'SENT', 'PARTLY_FAILED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('EMAIL', 'SMS', 'WHATSAPP', 'VIBER');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED', 'SIMULATED');--> statement-breakpoint
CREATE TYPE "public"."share_link_kind" AS ENUM('PRICE_LIST');--> statement-breakpoint
CREATE TYPE "public"."suppression_channel" AS ENUM('EMAIL', 'PHONE');--> statement-breakpoint
ALTER TYPE "public"."document_category" ADD VALUE 'PROGRESS_PHOTO' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "public"."document_category" ADD VALUE 'PRICE_LIST' BEFORE 'OTHER';--> statement-breakpoint
CREATE TABLE "campaign_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"document_id" text NOT NULL,
	CONSTRAINT "campaign_documents_unique" UNIQUE("campaign_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"channel" "message_channel" NOT NULL,
	"audience" "campaign_audience" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"share_link_id" text,
	"created_by_email" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text,
	"channel" "message_channel" NOT NULL,
	"to_address" text NOT NULL,
	"client_id" text,
	"agent_id" text,
	"subject" text,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'QUEUED' NOT NULL,
	"provider_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"kind" "share_link_kind" NOT NULL,
	"note" text,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" "suppression_channel" NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppressions_channel_value" UNIQUE("channel","value")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "campaign_documents" ADD CONSTRAINT "campaign_documents_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_documents" ADD CONSTRAINT "campaign_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;