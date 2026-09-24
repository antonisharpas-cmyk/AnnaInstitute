ALTER TYPE "document_category" ADD VALUE IF NOT EXISTS 'INVOICE' BEFORE 'OTHER';--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "vat_number" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "reference" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issued_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"issued_on" timestamp with time zone NOT NULL,
	"payment_id" text,
	"contract_id" text,
	"client_id" text,
	"invoice_id" text,
	"net_amount" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) NOT NULL,
	"vat_rate" numeric(6, 3) NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"snapshot" text NOT NULL,
	"document_id" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issued_documents_kind_number" UNIQUE("kind","number")
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issued_documents_payment" ON "issued_documents" ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issued_documents_client" ON "issued_documents" ("client_id");
