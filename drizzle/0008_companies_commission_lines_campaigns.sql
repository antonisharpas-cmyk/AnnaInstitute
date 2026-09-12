-- Three things at once.
--
-- 1. A development belongs to a company, since One Eleven builds alongside
--    investors. Everything that exists today is Trivest.
-- 2. A sale earns commission as lines: the rate on the price, plus anything the
--    office adds, each paid on its own.
-- 3. A campaign can go out on email and on WhatsApp at the same time, with its
--    own body for each, and the files reach WhatsApp as a link.

CREATE TYPE "public"."commission_kind" AS ENUM('RATE', 'EXTRA');--> statement-breakpoint

CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);--> statement-breakpoint

ALTER TABLE "projects" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

INSERT INTO "companies" ("id", "name")
SELECT substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'Trivest'
WHERE NOT EXISTS (SELECT 1 FROM "companies" WHERE "name" = 'Trivest');--> statement-breakpoint

UPDATE "projects" SET "company_id" = (SELECT "id" FROM "companies" WHERE "name" = 'Trivest')
WHERE "company_id" IS NULL;--> statement-breakpoint

ALTER TABLE "commissions" ADD COLUMN "kind" "public"."commission_kind" DEFAULT 'RATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "label" text;--> statement-breakpoint

ALTER TABLE "campaigns" ADD COLUMN "via_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "via_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "body_whatsapp" text;--> statement-breakpoint

-- Older campaigns keep going out the way they were written.
UPDATE "campaigns" SET "via_email" = ("channel" = 'EMAIL'), "via_whatsapp" = ("channel" = 'WHATSAPP');--> statement-breakpoint

ALTER TABLE "share_links" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TYPE "public"."share_link_kind" ADD VALUE 'CAMPAIGN_FILES';
