-- The schedule moves onto the apartment.
--
-- A line with no assignment is the contract's own plan, the shape the office
-- reuses. A line with an assignment belongs to one apartment on that contract
-- and carries the dates and the payments, so two buyers of the same plan can be
-- at different stages on different months.

ALTER TABLE "installments" ADD COLUMN "assignment_id" text;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_assignment_id_contract_units_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."contract_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" DROP CONSTRAINT IF EXISTS "installments_contract_seq";--> statement-breakpoint

-- Give every apartment already on a contract its own copy of that plan.
INSERT INTO "installments" (
	"id", "contract_id", "assignment_id", "seq", "label", "label_el", "percentage",
	"net_amount", "vat_amount", "total_amount", "vat_rate_applied", "due_date",
	"trigger", "status", "locked_at", "created_at", "updated_at"
)
SELECT
	substr(md5(random()::text || clock_timestamp()::text || i."id" || cu."id"), 1, 16),
	i."contract_id", cu."id", i."seq", i."label", i."label_el", i."percentage",
	i."net_amount", i."vat_amount", i."total_amount", i."vat_rate_applied", i."due_date",
	i."trigger", i."status", i."locked_at", now(), now()
FROM "installments" i
JOIN "contract_units" cu ON cu."contract_id" = i."contract_id"
WHERE i."assignment_id" IS NULL;--> statement-breakpoint

-- Point the payments at the apartment's own line rather than the plan.
UPDATE "payments" p
SET "installment_id" = copy."id"
FROM "installments" plan
JOIN "installments" copy
	ON copy."assignment_id" IS NOT NULL
	AND copy."contract_id" = plan."contract_id"
	AND copy."seq" = plan."seq"
WHERE p."installment_id" = plan."id"
	AND plan."assignment_id" IS NULL
	AND copy."assignment_id" = p."assignment_id";
