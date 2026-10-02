-- The team member who looks after a client.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "assigned_to_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_assigned_to_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- What a campaign is about: any number of developments and apartments, as a JSON list.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "about_ids" text;
