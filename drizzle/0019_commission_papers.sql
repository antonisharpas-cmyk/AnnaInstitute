ALTER TYPE "public"."document_category" ADD VALUE 'AGENT_INVOICE';--> statement-breakpoint
ALTER TYPE "public"."document_category" ADD VALUE 'AGENT_RECEIPT';--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "commission_id" text;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "completed_at" timestamp with time zone;
