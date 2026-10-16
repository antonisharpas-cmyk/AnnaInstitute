-- A partner's company beside the person the office speaks to, and the agents a campaign was sent to when
-- the office chose them one by one.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "company" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "agent_ids" text;
