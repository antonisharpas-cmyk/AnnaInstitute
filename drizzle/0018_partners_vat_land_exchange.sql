CREATE TYPE "public"."contract_kind" AS ENUM('SALE', 'LAND_EXCHANGE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subowner_directors" (
	"id" text PRIMARY KEY NOT NULL,
	"subowner_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"email_alternate" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subowner_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"subowner_id" text NOT NULL,
	"holder" text NOT NULL,
	"share_percent" numeric(6, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "subowner_directors" ADD CONSTRAINT "subowner_directors_subowner_id_subowners_id_fk" FOREIGN KEY ("subowner_id") REFERENCES "public"."subowners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subowner_shares" ADD CONSTRAINT "subowner_shares_subowner_id_subowners_id_fk" FOREIGN KEY ("subowner_id") REFERENCES "public"."subowners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "kind" "contract_kind" DEFAULT 'SALE' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "cash_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "vat_rate" numeric(6, 3) DEFAULT '19' NOT NULL;
