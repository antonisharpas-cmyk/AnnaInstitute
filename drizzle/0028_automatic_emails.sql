-- The letters the CRM sends by itself, and the record of what became of each.
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "is_automatic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."automatic_email_status" AS ENUM('SENT', 'WAITING', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automatic_emails" (
  "id" text PRIMARY KEY NOT NULL,
  "template_key" text NOT NULL,
  "contract_id" text,
  "payment_id" text,
  "client_id" text,
  "status" "automatic_email_status" DEFAULT 'SENT' NOT NULL,
  "reason" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "automatic_emails" ADD CONSTRAINT "automatic_emails_contract_id_contracts_id_fk"
    FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "automatic_emails" ADD CONSTRAINT "automatic_emails_payment_id_payments_id_fk"
    FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "automatic_emails" ADD CONSTRAINT "automatic_emails_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
