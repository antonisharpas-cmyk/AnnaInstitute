-- How an agent wants campaigns: EMAIL, WHATSAPP or BOTH.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "campaign_channel" text DEFAULT 'EMAIL' NOT NULL;--> statement-breakpoint
-- A campaign to agents: for those who want both, the one way it goes to them.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "agents_both_via" text;--> statement-breakpoint
-- An invoice issued for a stage before the money comes in.
ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "installment_id" text;--> statement-breakpoint
ALTER TYPE "document_category" ADD VALUE IF NOT EXISTS 'RESERVATION' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "document_category" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'OTHER';--> statement-breakpoint
-- The Reservation and the Contract of Sale of a contract, from draft to signed.
CREATE TABLE IF NOT EXISTS "signing_papers" (
  "id" text PRIMARY KEY NOT NULL,
  "contract_id" text NOT NULL,
  "kind" text NOT NULL,
  "installment_id" text,
  "draft_document_id" text,
  "signed_document_id" text,
  "invoice_id" text,
  "sent_for_review_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "invoice_sent_at" timestamp with time zone,
  "signed_at" timestamp with time zone,
  "signed_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signing_papers" ADD CONSTRAINT "signing_papers_contract_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signing_papers" ADD CONSTRAINT "signing_papers_draft_fk" FOREIGN KEY ("draft_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signing_papers" ADD CONSTRAINT "signing_papers_signed_fk" FOREIGN KEY ("signed_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signing_papers_contract_kind" ON "signing_papers" ("contract_id", "kind");
