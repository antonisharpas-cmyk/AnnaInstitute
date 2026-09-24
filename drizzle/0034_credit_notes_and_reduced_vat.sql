ALTER TYPE "document_category" ADD VALUE IF NOT EXISTS 'CREDIT_NOTE' BEFORE 'OTHER';--> statement-breakpoint
ALTER TYPE "document_category" ADD VALUE IF NOT EXISTS 'REFUND_ACK' BEFORE 'OTHER';--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "vat_rate" SET DEFAULT '19';--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "reduced_vat_net" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "reduced_vat_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "standard_vat_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "reduced_vat_approved_on" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'PAYMENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoiced_by_id" text;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "purpose" text;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "reason" text;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "credited_by_id" text;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "replaced_by_id" text;--> statement-breakpoint
ALTER TABLE "issued_documents" ADD COLUMN IF NOT EXISTS "stamped_document_id" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"client_id" text,
	"purpose" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_on" timestamp with time zone NOT NULL,
	"method" text,
	"reference" text,
	"note" text,
	"cancelled_contract" boolean DEFAULT false NOT NULL,
	"credit_note_id" text,
	"acknowledgement_document_id" text,
	"signed_document_id" text,
	"recorded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refunds" ADD CONSTRAINT "refunds_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
