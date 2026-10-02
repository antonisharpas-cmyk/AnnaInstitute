-- The client's birthday, as the day it is written, 1985-03-14.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "birth_date" text;--> statement-breakpoint
-- A second buyer: an apartment in two names.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_first_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_last_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_email" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_phone" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_id_type" "id_type";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_id_type_choice" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_id_number" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_address" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_country" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_birth_date" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "second_relation" text;--> statement-breakpoint
-- Whose paper a document is, when the apartment is in two names.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "second_buyer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- A birthday wish goes once a year to each of them.
ALTER TABLE "automatic_emails" ADD COLUMN IF NOT EXISTS "for_year" integer;--> statement-breakpoint
ALTER TABLE "automatic_emails" ADD COLUMN IF NOT EXISTS "second_buyer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Paying with a bank loan: the bank and the people there to copy.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "loan" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "loan_bank" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "loan_contact" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "loan_email" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "loan_phone" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "loan_notes" text;--> statement-breakpoint
-- A stage paid in parts, and who else the letter about a payment is copied to.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "parts_total" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "part_number" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cc_emails" text;
