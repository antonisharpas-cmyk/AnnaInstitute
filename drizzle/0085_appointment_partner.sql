-- An appointment can be with one of the office's partners, who hears about it by email.
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "partner_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
