-- Birthdays for everybody the CRM wishes: agents, the team, shareholders and directors.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "birth_date" text;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "birth_date" text;--> statement-breakpoint
ALTER TABLE "subowner_shares" ADD COLUMN IF NOT EXISTS "birth_date" text;--> statement-breakpoint
ALTER TABLE "subowner_directors" ADD COLUMN IF NOT EXISTS "birth_date" text;--> statement-breakpoint
-- Who a birthday wish that is not to a client went to, so it goes once a year.
ALTER TABLE "automatic_emails" ADD COLUMN IF NOT EXISTS "person_key" text;--> statement-breakpoint
-- The paper that approves the reduced VAT, uploaded with the approval.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "reduced_vat_document_id" text;--> statement-breakpoint
ALTER TYPE "document_category" ADD VALUE IF NOT EXISTS 'VAT_APPROVAL' BEFORE 'OTHER';
