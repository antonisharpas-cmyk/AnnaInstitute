-- How each client and lead is texted: SMS or WHATSAPP. Appointment messages and the text part of a
-- campaign go the way it says. Everyone starts on SMS.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "text_channel" text DEFAULT 'SMS' NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "text_channel" text DEFAULT 'SMS' NOT NULL;
