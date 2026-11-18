-- What a client wants with the apartment: appliances and air conditioning, YES, NO or UNDECIDED. Empty until asked.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "wants_appliances" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "wants_air_condition" text;
--> statement-breakpoint
-- Campaigns can go to the partners of the Partners directory.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "to_partners" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "partner_ids" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "partner_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Invoices typed in from a partner by name are linked to that partner, where exactly one partner has that name.
UPDATE "expenses" e SET "party_kind" = 'PARTNER', "party_id" = m."partner_id"
FROM (
  SELECT e2."id" AS "expense_id", min(p."id") AS "partner_id", count(*) AS "n"
  FROM "expenses" e2
  JOIN "partners" p ON lower(trim(e2."supplier")) IN (lower(trim(p."name")), lower(trim(coalesce(p."company", ''))))
  WHERE coalesce(e2."party_kind", 'OTHER') = 'OTHER' AND e2."subowner_id" IS NULL
  GROUP BY e2."id"
) m
WHERE e."id" = m."expense_id" AND m."n" = 1;
--> statement-breakpoint
-- Price lists and campaign files are open for 60 days from the day the link was made; those made before stop 60 days after.
UPDATE "share_links" SET "expires_at" = "created_at" + interval '60 days'
WHERE "kind" IN ('PRICE_LIST', 'CAMPAIGN_FILES') AND "expires_at" IS NULL;
