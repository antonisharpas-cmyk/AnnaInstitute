-- One contract, one client, one apartment.
--
-- The assignment table folds back into the contract. A contract that was put on
-- several apartments is split into one contract per apartment, each keeping the
-- schedule, the dates and the payments that apartment already had, so nothing is
-- lost and no reference is used twice.

ALTER TABLE "contracts" ADD COLUMN "unit_id" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "commission_rate" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "contract_id" text;--> statement-breakpoint

-- Number the apartments on each contract. The first one stays on the contract,
-- the rest each get a contract of their own.
CREATE TEMP TABLE "split" AS
SELECT
	cu."id"          AS assignment_id,
	cu."contract_id" AS old_contract_id,
	cu."unit_id",
	cu."client_id",
	cu."agent_id",
	cu."commission_rate",
	row_number() OVER (PARTITION BY cu."contract_id" ORDER BY cu."created_at", cu."id") AS n,
	substr(md5(random()::text || clock_timestamp()::text || cu."id"), 1, 16) AS new_contract_id,
	u."code" AS unit_code
FROM "contract_units" cu
JOIN "units" u ON u."id" = cu."unit_id";--> statement-breakpoint

-- The extra apartments become contracts in their own right.
INSERT INTO "contracts" (
	"id", "reference", "unit_id", "client_id", "agent_id", "commission_rate",
	"contract_date", "net_price", "vat_rate", "schedule_type", "period_months",
	"status", "notes", "created_at", "updated_at"
)
SELECT
	s."new_contract_id",
	c."reference" || ' (' || s."unit_code" || ')',
	s."unit_id",
	coalesce(s."client_id", (select u2."client_id" from "units" u2 where u2."id" = s."unit_id")),
	s."agent_id", s."commission_rate",
	c."contract_date", c."net_price", c."vat_rate", c."schedule_type", c."period_months",
	c."status", c."notes", now(), now()
FROM "split" s
JOIN "contracts" c ON c."id" = s."old_contract_id"
WHERE s."n" > 1;--> statement-breakpoint

-- Move their schedules and their payments across.
UPDATE "installments" i
SET "contract_id" = s."new_contract_id"
FROM "split" s
WHERE i."assignment_id" = s."assignment_id" AND s."n" > 1;--> statement-breakpoint

UPDATE "payments" p
SET "contract_id" = s."new_contract_id"
FROM "split" s
WHERE p."assignment_id" = s."assignment_id" AND s."n" > 1;--> statement-breakpoint

UPDATE "commissions" cm
SET "contract_id" = s."new_contract_id"
FROM "split" s
WHERE cm."assignment_id" = s."assignment_id" AND s."n" > 1;--> statement-breakpoint

-- The first apartment stays where it is. A sale with no buyer recorded against
-- it takes the one held on the apartment itself, if there is one.
UPDATE "contracts" c
SET "unit_id" = s."unit_id",
	"client_id" = coalesce(s."client_id", (select u."client_id" from "units" u where u."id" = s."unit_id")),
	"agent_id" = s."agent_id",
	"commission_rate" = s."commission_rate"
FROM "split" s
WHERE c."id" = s."old_contract_id" AND s."n" = 1;--> statement-breakpoint

UPDATE "commissions" cm
SET "contract_id" = s."old_contract_id"
FROM "split" s
WHERE cm."assignment_id" = s."assignment_id" AND s."n" = 1;--> statement-breakpoint

-- The shape a contract used to hold, with no dates and no money on it, has no
-- place any more: every schedule now belongs to a sale.
DELETE FROM "installments" WHERE "assignment_id" IS NULL;--> statement-breakpoint

-- A commission with no sale behind it is orphaned; a contract with no apartment
-- is simply one nobody finished, and it stays for the office to complete.
DELETE FROM "commissions" WHERE "contract_id" IS NULL;--> statement-breakpoint

DROP TABLE "split";--> statement-breakpoint

ALTER TABLE "installments" DROP CONSTRAINT IF EXISTS "installments_assignment_id_contract_units_id_fk";--> statement-breakpoint
ALTER TABLE "installments" DROP COLUMN IF EXISTS "assignment_id";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_assignment_id_contract_units_id_fk";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN IF EXISTS "assignment_id";--> statement-breakpoint
ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "commissions_assignment_id_contract_units_id_fk";--> statement-breakpoint
ALTER TABLE "commissions" DROP COLUMN IF EXISTS "assignment_id";--> statement-breakpoint

DROP TABLE IF EXISTS "contract_units";--> statement-breakpoint

ALTER TABLE "commissions" ALTER COLUMN "contract_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_unit_id_unique" UNIQUE("unit_id");--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "installments" ADD CONSTRAINT "installments_contract_seq" UNIQUE("contract_id","seq");
