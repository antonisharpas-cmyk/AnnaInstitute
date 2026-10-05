-- The architect's certificate and the photographs of a stage of the building, filed on its installment.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "installment_id" text;--> statement-breakpoint
-- When the invoice of a stage was sent to the buyer, before the money.
ALTER TABLE "installments" ADD COLUMN IF NOT EXISTS "invoice_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TYPE "document_category" ADD VALUE IF NOT EXISTS 'STAGE_CERTIFICATE' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "document_category" ADD VALUE IF NOT EXISTS 'STAGE_PHOTO' BEFORE 'OTHER';
