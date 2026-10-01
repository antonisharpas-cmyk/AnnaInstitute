ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "maps_url" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "agent_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "other_name" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "other_email" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "other_phone" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "project_id" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "place_detail" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"received_on" timestamp with time zone NOT NULL,
	"note" text,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "subowner_shares" ADD COLUMN IF NOT EXISTS "is_one_eleven" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subowner_shares" ADD COLUMN IF NOT EXISTS "holder_kind" text;--> statement-breakpoint
ALTER TABLE "subowner_shares" ADD COLUMN IF NOT EXISTS "id_number" text;--> statement-breakpoint
ALTER TABLE "subowner_shares" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "subowner_shares" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "subowner_shares" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
UPDATE "subowner_shares" SET "is_one_eleven" = true, "holder_kind" = coalesce("holder_kind", 'COMPANY') WHERE "holder" ILIKE 'one eleven%' AND "is_one_eleven" = false;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "to_leads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "lead_ids" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "project_ids" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "to_leads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "lead_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "project_ids" text;--> statement-breakpoint
INSERT INTO "subowners" ("id", "name", "is_active", "created_at", "updated_at")
SELECT substr(md5(random()::text || c."id"), 1, 16), c."name", true, now(), now()
FROM "companies" c
WHERE EXISTS (SELECT 1 FROM "projects" p WHERE p."company_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "subowners" s WHERE lower(trim(s."name")) = lower(trim(c."name")));--> statement-breakpoint
INSERT INTO "project_partners" ("id", "project_id", "subowner_id", "share_percent", "created_at")
SELECT substr(md5(random()::text || p."id"), 1, 16), p."id", s."id", NULL, now()
FROM "projects" p
JOIN "companies" c ON c."id" = p."company_id"
JOIN "subowners" s ON lower(trim(s."name")) = lower(trim(c."name"))
WHERE NOT EXISTS (SELECT 1 FROM "project_partners" pp WHERE pp."project_id" = p."id" AND pp."subowner_id" = s."id");
