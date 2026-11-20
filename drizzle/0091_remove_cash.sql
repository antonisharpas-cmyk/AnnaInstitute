-- Cash leaves the CRM: the cash part of a contract, the cash received against it, the cash book under Invoices, and commissions paid in cash.
-- A sale whose commission was paid in cash keeps its agent and earns no commission from now on.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "no_commission" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "contracts" SET "no_commission" = true WHERE "commission_in_cash" = true;
--> statement-breakpoint
-- The commissions paid in cash go, with any payment or paper recorded against them.
DELETE FROM "documents" WHERE "commission_id" IN (SELECT "id" FROM "commissions" WHERE "in_cash" = true);
--> statement-breakpoint
DELETE FROM "commission_payments" WHERE "commission_id" IN (SELECT "id" FROM "commissions" WHERE "in_cash" = true);
--> statement-breakpoint
DELETE FROM "commissions" WHERE "in_cash" = true;
--> statement-breakpoint
-- A commission on a rate is worked out again on the contract price alone, without the cash. A fixed amount stays as it is.
UPDATE "commissions" cm
SET "base_amount" = c."net_price",
    "amount" = round(c."net_price" * cm."rate" / 100, 2),
    "updated_at" = now()
FROM "contracts" c
WHERE cm."contract_id" = c."id"
  AND cm."kind" = 'RATE'
  AND coalesce(c."cash_amount", 0) <> 0
  AND c."commission_fixed" IS NULL;
--> statement-breakpoint
-- Its standing follows: paid in full once what was paid covers the new amount.
UPDATE "commissions" cm
SET "status" = CASE
      WHEN cm."amount" > 0 AND (SELECT coalesce(sum(p."amount"), 0) FROM "commission_payments" p WHERE p."commission_id" = cm."id") >= cm."amount" THEN 'PAID'::"commission_status"
      WHEN (SELECT coalesce(sum(p."amount"), 0) FROM "commission_payments" p WHERE p."commission_id" = cm."id") > 0 THEN 'PARTIALLY_PAID'::"commission_status"
      ELSE 'PENDING'::"commission_status"
    END
FROM "contracts" c
WHERE cm."contract_id" = c."id"
  AND cm."kind" = 'RATE'
  AND cm."status" <> 'CANCELLED'
  AND coalesce(c."cash_amount", 0) <> 0
  AND c."commission_fixed" IS NULL;
--> statement-breakpoint
-- The apartment's price is its contract's price, without the cash.
UPDATE "units" u
SET "net_price" = c."net_price", "updated_at" = now()
FROM "contracts" c
WHERE c."unit_id" = u."id"
  AND coalesce(c."cash_amount", 0) <> 0
  AND c."status" <> 'CANCELLED';
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "cash_amount";
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "commission_in_cash";
--> statement-breakpoint
ALTER TABLE "commissions" DROP COLUMN IF EXISTS "in_cash";
--> statement-breakpoint
DROP TABLE IF EXISTS "cash_receipts";
--> statement-breakpoint
DROP TABLE IF EXISTS "cash_entries";
