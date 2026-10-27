-- WhatsApp is no longer used: every text goes by SMS. Whoever was texted by
-- WhatsApp is texted by SMS from now on; whoever chose no texts keeps that.
UPDATE "clients" SET "text_channel" = 'SMS' WHERE "text_channel" = 'WHATSAPP';
--> statement-breakpoint
UPDATE "leads" SET "text_channel" = 'SMS' WHERE "text_channel" = 'WHATSAPP';
--> statement-breakpoint
UPDATE "agents" SET "campaign_channel" = 'SMS' WHERE "campaign_channel" = 'WHATSAPP';
--> statement-breakpoint
UPDATE "campaigns" SET "agents_both_via" = 'SMS' WHERE "agents_both_via" = 'WHATSAPP' AND "status" = 'DRAFT';
