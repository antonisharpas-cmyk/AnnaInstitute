-- The agent's commission agreed for one contract: a fixed amount before VAT instead of a rate,
-- and paid in cash, which asks for no invoice, no receipt and no letter to the agent.
ALTER TABLE "contracts" ADD COLUMN "commission_fixed" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "commission_in_cash" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "in_cash" boolean DEFAULT false NOT NULL;
