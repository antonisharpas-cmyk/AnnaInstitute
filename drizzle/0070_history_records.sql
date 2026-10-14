-- Recording the office's history: payments, contracts, commissions and the rest entered while
-- "Recording history" is switched on in Settings carry this mark, so no invoice, receipt, letter
-- or alert is expected of them.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "history" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "history" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_receipts" ADD COLUMN IF NOT EXISTS "history" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "history" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "commission_payments" ADD COLUMN IF NOT EXISTS "history" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "constructor_payments" ADD COLUMN IF NOT EXISTS "history" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "history" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "expense_payments" ADD COLUMN IF NOT EXISTS "history" boolean DEFAULT false NOT NULL;
