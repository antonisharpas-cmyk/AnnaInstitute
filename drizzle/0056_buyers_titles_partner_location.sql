-- Mr, Mrs or Ms for the letters.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
-- Campaigns to the buyers of a development or an apartment.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "to_buyers" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "buyer_ids" text;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "to_buyers" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Where a partner's showroom is.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "location_url" text;
