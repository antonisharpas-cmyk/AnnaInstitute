-- What "Something else" was, for a payment on an invoice under Income and expenses.
ALTER TABLE "expense_payments" ADD COLUMN IF NOT EXISTS "method_other" text;
