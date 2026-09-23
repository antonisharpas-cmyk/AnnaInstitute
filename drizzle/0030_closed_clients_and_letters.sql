-- A client who walked away, put to one side rather than deleted.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "closed_reason" text;--> statement-breakpoint
-- Which appointment, and which agent, an automatic letter was about.
ALTER TABLE "automatic_emails" ADD COLUMN IF NOT EXISTS "appointment_id" text;--> statement-breakpoint
ALTER TABLE "automatic_emails" ADD COLUMN IF NOT EXISTS "agent_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "automatic_emails" ADD CONSTRAINT "automatic_emails_appointment_id_appointments_id_fk"
    FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "automatic_emails" ADD CONSTRAINT "automatic_emails_agent_id_agents_id_fk"
    FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
