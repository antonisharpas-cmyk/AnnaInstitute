-- The letter to an agent about their potential client: which lead it was about.
ALTER TABLE "automatic_emails" ADD COLUMN IF NOT EXISTS "lead_id" text;--> statement-breakpoint
-- Constructors: who builds a development, for how much, and what was paid.
CREATE TABLE IF NOT EXISTS "constructors" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "company" text,
  "contact_name" text,
  "email" text,
  "phone" text,
  "address" text,
  "vat_number" text,
  "registry_number" text,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "constructor_projects" (
  "id" text PRIMARY KEY NOT NULL,
  "constructor_id" text NOT NULL,
  "project_id" text NOT NULL,
  "agreed_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "constructor_projects" ADD CONSTRAINT "constructor_projects_constructor_fk" FOREIGN KEY ("constructor_id") REFERENCES "public"."constructors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "constructor_projects" ADD CONSTRAINT "constructor_projects_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "constructor_projects" ADD CONSTRAINT "constructor_projects_project_once" UNIQUE ("project_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "constructor_payments" (
  "id" text PRIMARY KEY NOT NULL,
  "constructor_project_id" text NOT NULL,
  "paid_on" timestamp with time zone NOT NULL,
  "kind" text,
  "amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "notes" text,
  "recorded_by_email" text,
  "status_changed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "constructor_payments" ADD CONSTRAINT "constructor_payments_project_fk" FOREIGN KEY ("constructor_project_id") REFERENCES "public"."constructor_projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
-- The constructor's invoice and receipt for a payment, kept with the documents.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "constructor_payment_id" text;
