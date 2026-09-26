ALTER TYPE "expense_category" ADD VALUE IF NOT EXISTS 'MANAGEMENT_FEES' BEFORE 'OTHER';--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "direction" text DEFAULT 'IN' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "category_other" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "subowner_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "issued_document_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "emailed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "expense_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_subowner_id_subowners_id_fk" FOREIGN KEY ("subowner_id") REFERENCES "public"."subowners"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
