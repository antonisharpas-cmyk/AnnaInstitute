-- A partner's offers: an item, its price and its pictures or PDFs, kept for the office to quote from.
CREATE TABLE IF NOT EXISTS "partner_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(14, 2),
	"notes" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "partner_offers" ADD CONSTRAINT "partner_offers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "partner_offers_partner_idx" ON "partner_offers" USING btree ("partner_id");
--> statement-breakpoint
-- Files filed on a partner's offer, and on a constructor (their contractor licence, say).
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "partner_offer_id" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "constructor_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_partner_offer_idx" ON "documents" USING btree ("partner_offer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_constructor_idx" ON "documents" USING btree ("constructor_id");
