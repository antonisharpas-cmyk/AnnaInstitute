-- What "Something else" was, for a payment on a contract.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "method_other" text;
