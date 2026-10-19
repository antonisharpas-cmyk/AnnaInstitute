-- The clients with consent and the partner companies a campaign goes to when the office ticks them
-- one by one, as JSON lists of ids. Empty means every one, as before.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "client_ids" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "subowner_ids" text;
