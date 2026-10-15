-- VAT on every payment the office makes. Agents charge 19% unless the office changes it, constructors 0%.
-- Each commission and each payment keeps its own rate; the VAT and the total with it are worked out by
-- the database from the amount before VAT, so they can never disagree with it.
--
-- Records already in the CRM keep the figures the reports showed for them: an agent with a VAT number
-- charges 19% and one without charges none, which is how the Shareholders report already read them,
-- and every constructor payment stays at 0%, so its total is the amount as it was entered.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(6, 3) DEFAULT '19' NOT NULL;
--> statement-breakpoint
UPDATE "agents" SET "vat_rate" = 0 WHERE coalesce(trim("vat_number"), '') = '';
--> statement-breakpoint
ALTER TABLE "constructors" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(6, 3) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(6, 3) DEFAULT '19' NOT NULL;
--> statement-breakpoint
UPDATE "commissions" SET "vat_rate" = "agents"."vat_rate" FROM "agents" WHERE "agents"."id" = "commissions"."agent_id";
--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "vat_amount" numeric(14, 2) GENERATED ALWAYS AS (round(amount * vat_rate / 100, 2)) STORED;
--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "total_amount" numeric(14, 2) GENERATED ALWAYS AS (amount + round(amount * vat_rate / 100, 2)) STORED;
--> statement-breakpoint
ALTER TABLE "commission_payments" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(6, 3) DEFAULT '19' NOT NULL;
--> statement-breakpoint
UPDATE "commission_payments" SET "vat_rate" = coalesce(
  (SELECT "commissions"."vat_rate" FROM "commissions" WHERE "commissions"."id" = "commission_payments"."commission_id"),
  (SELECT "agents"."vat_rate" FROM "agents" WHERE "agents"."id" = "commission_payments"."agent_id"),
  19);
--> statement-breakpoint
ALTER TABLE "commission_payments" ADD COLUMN IF NOT EXISTS "vat_amount" numeric(14, 2) GENERATED ALWAYS AS (round(amount * vat_rate / 100, 2)) STORED;
--> statement-breakpoint
ALTER TABLE "commission_payments" ADD COLUMN IF NOT EXISTS "total_amount" numeric(14, 2) GENERATED ALWAYS AS (amount + round(amount * vat_rate / 100, 2)) STORED;
--> statement-breakpoint
ALTER TABLE "constructor_payments" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(6, 3) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "constructor_payments" ADD COLUMN IF NOT EXISTS "vat_amount" numeric(14, 2) GENERATED ALWAYS AS (round(amount * vat_rate / 100, 2)) STORED;
--> statement-breakpoint
ALTER TABLE "constructor_payments" ADD COLUMN IF NOT EXISTS "total_amount" numeric(14, 2) GENERATED ALWAYS AS (amount + round(amount * vat_rate / 100, 2)) STORED;
