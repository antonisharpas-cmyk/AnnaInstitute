CREATE TABLE IF NOT EXISTS "contract_units" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_units_contract_unit" UNIQUE("contract_id","unit_id")
);--> statement-breakpoint
ALTER TABLE "contract_units" ADD CONSTRAINT "contract_units_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_units" ADD CONSTRAINT "contract_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "plot_description" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "plot_reference" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "plot_area" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "share_percent" numeric(6, 3);
