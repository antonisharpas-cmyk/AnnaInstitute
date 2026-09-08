-- A contract stands on its own: a price, one VAT rate and a schedule.
-- The apartment, the buyer and the agent move to contract_units, so the same
-- contract can be put on several apartments across different buildings, with
-- the money tracked per apartment.

CREATE TYPE "public"."schedule_type" AS ENUM('STANDARD', 'PERIODIC');--> statement-breakpoint

CREATE TABLE "contract_units" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"client_id" text,
	"agent_id" text,
	"commission_rate" numeric(6, 3),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_units_unit" UNIQUE("unit_id")
);--> statement-breakpoint

ALTER TABLE "contract_units" ADD CONSTRAINT "contract_units_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_units" ADD CONSTRAINT "contract_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_units" ADD CONSTRAINT "contract_units_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_units" ADD CONSTRAINT "contract_units_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "contracts" ADD COLUMN "vat_rate" numeric(6, 3) DEFAULT '5' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "schedule_type" "public"."schedule_type" DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "period_months" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "assignment_id" text;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "assignment_id" text;--> statement-breakpoint

-- Carry the existing data across before the old columns go.
UPDATE "contracts" SET "vat_rate" = CASE
	WHEN "vat_base_standard" > 0 AND "vat_base_reduced" = 0 THEN "vat_rate_standard"
	ELSE "vat_rate_reduced"
END;--> statement-breakpoint

INSERT INTO "contract_units" ("id", "contract_id", "unit_id", "client_id", "agent_id", "commission_rate")
SELECT "id", "id", "unit_id", "client_id", "agent_id", "commission_rate" FROM "contracts";--> statement-breakpoint

UPDATE "payments" SET "assignment_id" = "cu"."id"
FROM "contract_units" "cu" WHERE "cu"."contract_id" = "payments"."contract_id";--> statement-breakpoint

UPDATE "commissions" SET "assignment_id" = "cu"."id"
FROM "contract_units" "cu" WHERE "cu"."contract_id" = "commissions"."contract_id";--> statement-breakpoint

ALTER TABLE "payments" ADD CONSTRAINT "payments_assignment_id_contract_units_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."contract_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_assignment_id_contract_units_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."contract_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "commissions_contract_id_contracts_id_fk";--> statement-breakpoint
ALTER TABLE "commissions" DROP COLUMN IF EXISTS "contract_id";--> statement-breakpoint

ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_unit_id_units_id_fk";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_client_id_clients_id_fk";--> statement-breakpoint
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "unit_id";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "client_id";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "agent_id";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "vat_base_reduced";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "vat_rate_reduced";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "vat_base_standard";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "vat_rate_standard";--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "commission_rate";
