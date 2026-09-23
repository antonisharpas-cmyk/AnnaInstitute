-- The office's own list of where an enquiry came from, on both sides, so a
-- source survives the moment a lead becomes a client.
ALTER TYPE "public"."lead_source_kind" ADD VALUE IF NOT EXISTS 'INSTAGRAM';--> statement-breakpoint
ALTER TYPE "public"."lead_source_kind" ADD VALUE IF NOT EXISTS 'FACEBOOK';--> statement-breakpoint
ALTER TYPE "public"."lead_source_kind" ADD VALUE IF NOT EXISTS 'SOCIAL_MEDIA';--> statement-breakpoint
ALTER TYPE "public"."lead_source_kind" ADD VALUE IF NOT EXISTS 'PHONE';--> statement-breakpoint
ALTER TYPE "public"."lead_source_kind" ADD VALUE IF NOT EXISTS 'EMAIL';--> statement-breakpoint
ALTER TYPE "public"."lead_source_kind" ADD VALUE IF NOT EXISTS 'REFERRAL';--> statement-breakpoint
ALTER TYPE "public"."contact_source" ADD VALUE IF NOT EXISTS 'INSTAGRAM';--> statement-breakpoint
ALTER TYPE "public"."contact_source" ADD VALUE IF NOT EXISTS 'FACEBOOK';--> statement-breakpoint
ALTER TYPE "public"."contact_source" ADD VALUE IF NOT EXISTS 'SOCIAL_MEDIA';--> statement-breakpoint
ALTER TYPE "public"."contact_source" ADD VALUE IF NOT EXISTS 'PHONE';--> statement-breakpoint
ALTER TYPE "public"."contact_source" ADD VALUE IF NOT EXISTS 'EMAIL';--> statement-breakpoint
ALTER TYPE "public"."contact_source" ADD VALUE IF NOT EXISTS 'REFERRAL';--> statement-breakpoint
-- Where an enquiry stands, in the words the office uses on the telephone.
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'NO_RESPONSE';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'NOT_INTERESTED';--> statement-breakpoint
ALTER TYPE "public"."lead_status" ADD VALUE IF NOT EXISTS 'ON_HOLD';--> statement-breakpoint
-- Qualified was the old word for an enquiry that is alive and being worked on.
-- The office says Active, so the value itself is renamed rather than a second
-- one added beside it: every lead that held it reads as Active from this moment
-- and nothing has to be moved.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'lead_status' AND e.enumlabel = 'QUALIFIED'
  ) THEN
    ALTER TYPE "public"."lead_status" RENAME VALUE 'QUALIFIED' TO 'ACTIVE';
  END IF;
END $$;--> statement-breakpoint
-- Whose enquiry this is: the same people who go to the appointments.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assigned_to_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_team_members_id_fk"
    FOREIGN KEY ("assigned_to_id") REFERENCES "public"."team_members"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
-- What happens next on an enquiry, and when.
DO $$ BEGIN
  CREATE TYPE "public"."follow_up_status" AS ENUM('PENDING', 'DONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_follow_ups" (
  "id" text PRIMARY KEY NOT NULL,
  "lead_id" text NOT NULL,
  "at" timestamp with time zone NOT NULL,
  "note" text,
  "status" "follow_up_status" DEFAULT 'PENDING' NOT NULL,
  "done_at" timestamp with time zone,
  "created_by_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_lead_id_leads_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_created_by_id_users_id_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
