ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "tic" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "mobile" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "fax" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "bank_name" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "bank_beneficiary" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "bank_account" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "iban" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "bic" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "logo_path" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "brand_color" text;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "next_invoice" integer;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "next_receipt" integer;--> statement-breakpoint
ALTER TABLE "subowners" ADD COLUMN IF NOT EXISTS "next_credit_note" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "agent_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
UPDATE "clients" SET "agent_id" = l."agent_id" FROM "leads" l WHERE l."client_id" = "clients"."id" AND l."agent_id" IS NOT NULL AND "clients"."agent_id" IS NULL;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "issuer_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "issued_documents" DROP CONSTRAINT IF EXISTS "issued_documents_kind_number";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_issuer_kind_number" UNIQUE ("issuer_id", "kind", "number");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD COLUMN IF NOT EXISTS "client_id" text;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD COLUMN IF NOT EXISTS "agent_id" text;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD COLUMN IF NOT EXISTS "other_name" text;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD COLUMN IF NOT EXISTS "other_email" text;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD COLUMN IF NOT EXISTS "other_phone" text;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD COLUMN IF NOT EXISTS "assigned_to_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_assigned_to_id_team_members_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
UPDATE "subowners" SET
  "registry_number" = coalesce(nullif("registry_number", ''), 'HE 449137'),
  "tic" = coalesce(nullif("tic", ''), '60046592L'),
  "bank_name" = coalesce(nullif("bank_name", ''), 'Bank of Cyprus'),
  "bank_beneficiary" = coalesce(nullif("bank_beneficiary", ''), 'DEX-INNO GREEN PROPERTIES LTD'),
  "bank_account" = coalesce(nullif("bank_account", ''), '357039852026'),
  "iban" = coalesce(nullif("iban", ''), 'CY58002001950000357039852026'),
  "bic" = coalesce(nullif("bic", ''), 'BCYPCY2N'),
  "logo_path" = coalesce(nullif("logo_path", ''), 'public:brand/companies/dex-inno.png'),
  "brand_color" = coalesce(nullif("brand_color", ''), '#2B2B2B'),
  "company" = coalesce(nullif("company", ''), 'DEX-INNO GREEN PROPERTIES LTD')
WHERE upper(regexp_replace(coalesce("company", '') || ' ' || "name", '[^A-Za-z]', '', 'g')) LIKE '%DEXINNO%';--> statement-breakpoint
UPDATE "subowners" SET
  "registry_number" = coalesce(nullif("registry_number", ''), 'HE 476522'),
  "tic" = coalesce(nullif("tic", ''), '60181173S'),
  "bank_name" = coalesce(nullif("bank_name", ''), 'Bank of Cyprus'),
  "bank_beneficiary" = coalesce(nullif("bank_beneficiary", ''), 'TRIVEST PROPERTY DEVELOPMENT LIMITED'),
  "bank_account" = coalesce(nullif("bank_account", ''), '357044417362'),
  "iban" = coalesce(nullif("iban", ''), 'CY94002001950000357044417362'),
  "bic" = coalesce(nullif("bic", ''), 'BCYPCY2N'),
  "logo_path" = coalesce(nullif("logo_path", ''), 'public:brand/companies/trivest.png'),
  "brand_color" = coalesce(nullif("brand_color", ''), '#3F4796'),
  "company" = coalesce(nullif("company", ''), 'TRIVEST PROPERTY DEVELOPMENT LIMITED')
WHERE upper(coalesce("company", '') || ' ' || "name") LIKE '%TRIVEST%';--> statement-breakpoint
UPDATE "settings" SET "value" = 'HE 463268' WHERE "key" = 'company.registration' AND "value" IN ('HE 476522', '');--> statement-breakpoint
UPDATE "settings" SET "value" = '75 Ermou Street, Larnaca 6022, Cyprus' WHERE "key" = 'company.address' AND ("value" LIKE '4 Konstantinou Palaiologou%' OR "value" = '');--> statement-breakpoint
UPDATE "settings" SET "value" = '+357 24 342720' WHERE "key" = 'company.phone' AND "value" IN ('+357 99658784, 70003396', '');--> statement-breakpoint
UPDATE "settings" SET "value" = '' WHERE "key" = 'company.fax' AND "value" = '+357 24817905';--> statement-breakpoint
UPDATE "settings" SET "value" = 'www.oneeleven.com.cy' WHERE "key" = 'company.website' AND "value" = '';--> statement-breakpoint
UPDATE "settings" SET "value" = 'Alpha Bank' WHERE "key" = 'company.bankName' AND "value" = '';--> statement-breakpoint
UPDATE "settings" SET "value" = 'CY53009004340004341010132490' WHERE "key" = 'company.iban' AND "value" = '';--> statement-breakpoint
UPDATE "settings" SET "value" = 'ABKLCY2N' WHERE "key" = 'company.swift' AND "value" = '';
--> statement-breakpoint
UPDATE "settings" SET "value" = 'ONE ELEVEN INVESTMENT AND DEVELOPING LTD' WHERE "key" = 'company.name' AND "value" IN ('ONE ELEVEN INVESTMENT & DEVELOPING LTD', '');
--> statement-breakpoint
WITH "named" AS (
  SELECT c."id", c."created_at",
    upper(left(trim(coalesce(cl."first_name", '')), 1) || left(trim(coalesce(cl."last_name", '')), 1))
    || '-' || coalesce((
      SELECT string_agg(upper(left(w, 1)), '' ORDER BY n)
      FROM regexp_split_to_table(trim(p."name"), '[\s_/-]+') WITH ORDINALITY AS parts(w, n)
      WHERE w <> ''
    ), '')
    || '-' || upper(regexp_replace(u."code", '\s+', '', 'g')) AS "base"
  FROM "contracts" c
  JOIN "clients" cl ON cl."id" = c."client_id"
  JOIN "units" u ON u."id" = c."unit_id"
  JOIN "projects" p ON p."id" = u."project_id"
), "numbered" AS (
  SELECT "id", "base", row_number() OVER (PARTITION BY "base" ORDER BY "created_at", "id") AS "rn" FROM "named"
)
UPDATE "contracts" SET "reference" = CASE WHEN "numbered"."rn" = 1 THEN "numbered"."base" ELSE "numbered"."base" || '-' || "numbered"."rn" END
FROM "numbered" WHERE "contracts"."id" = "numbered"."id" AND "contracts"."reference" IS DISTINCT FROM CASE WHEN "numbered"."rn" = 1 THEN "numbered"."base" ELSE "numbered"."base" || '-' || "numbered"."rn" END;

--> statement-breakpoint
UPDATE "email_templates" SET "name" = regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace("name", E'\\mAn enquiry\\M', 'A lead', 'g'), E'\\man enquiry\\M', 'a lead', 'g'), E'\\mEnquiries\\M', 'Leads', 'g'), E'\\menquiries\\M', 'leads', 'g'), E'\\mEnquiry\\M', 'Lead', 'g'), E'\\menquiry\\M', 'lead', 'g'), "description" = regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace("description", E'\\mAn enquiry\\M', 'A lead', 'g'), E'\\man enquiry\\M', 'a lead', 'g'), E'\\mEnquiries\\M', 'Leads', 'g'), E'\\menquiries\\M', 'leads', 'g'), E'\\mEnquiry\\M', 'Lead', 'g'), E'\\menquiry\\M', 'lead', 'g'), "subject" = regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace("subject", E'\\mAn enquiry\\M', 'A lead', 'g'), E'\\man enquiry\\M', 'a lead', 'g'), E'\\mEnquiries\\M', 'Leads', 'g'), E'\\menquiries\\M', 'leads', 'g'), E'\\mEnquiry\\M', 'Lead', 'g'), E'\\menquiry\\M', 'lead', 'g'), "body" = regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace("body", E'\\mAn enquiry\\M', 'A lead', 'g'), E'\\man enquiry\\M', 'a lead', 'g'), E'\\mEnquiries\\M', 'Leads', 'g'), E'\\menquiries\\M', 'leads', 'g'), E'\\mEnquiry\\M', 'Lead', 'g'), E'\\menquiry\\M', 'lead', 'g'), "body_whatsapp" = regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace("body_whatsapp", E'\\mAn enquiry\\M', 'A lead', 'g'), E'\\man enquiry\\M', 'a lead', 'g'), E'\\mEnquiries\\M', 'Leads', 'g'), E'\\menquiries\\M', 'leads', 'g'), E'\\mEnquiry\\M', 'Lead', 'g'), E'\\menquiry\\M', 'lead', 'g') WHERE "name" ILIKE '%enquir%' OR "description" ILIKE '%enquir%' OR "subject" ILIKE '%enquir%' OR "body" ILIKE '%enquir%' OR "body_whatsapp" ILIKE '%enquir%';
