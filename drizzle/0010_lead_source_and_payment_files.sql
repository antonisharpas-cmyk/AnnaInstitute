CREATE TYPE "public"."lead_source_kind" AS ENUM('WEBSITE', 'ENQUIRY', 'AGENT', 'WHATSAPP', 'OTHER');--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "payment_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_kind" "lead_source_kind" DEFAULT 'WEBSITE' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;