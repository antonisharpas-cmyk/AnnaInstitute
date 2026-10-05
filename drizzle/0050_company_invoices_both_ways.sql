-- Invoices under Company, both ways: who is on each side, a line for each thing charged, and every payment with its receipt.
-- Which of our companies the invoice is from (money we charge) or to (an invoice we received). Empty is One Eleven.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "our_company_id" text;--> statement-breakpoint
-- The other side: a company, a client, an agent, a constructor, a team member, or somebody typed by name.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "party_kind" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "party_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "party_email" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "party_address" text;--> statement-breakpoint
-- Each line says what it is for and carries its own VAT rate.
ALTER TABLE "expense_lines" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD COLUMN IF NOT EXISTS "category_choice" text;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD COLUMN IF NOT EXISTS "category_other" text;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(6, 3);--> statement-breakpoint
-- Every payment on an invoice: the money we received with our receipt, or the money we paid with theirs.
CREATE TABLE IF NOT EXISTS "expense_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"expense_id" text NOT NULL,
	"paid_on" timestamp with time zone NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text,
	"reference" text,
	"issued_document_id" text,
	"receipt_document_id" text,
	"emailed_at" timestamp with time zone,
	"email_error" text,
	"recorded_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- The invoices already there: the company on the other side, as it was chosen.
UPDATE "expenses" SET "party_kind" = 'COMPANY', "party_id" = "subowner_id" WHERE "party_kind" IS NULL AND "subowner_id" IS NOT NULL;--> statement-breakpoint
UPDATE "expenses" SET "party_kind" = 'OTHER' WHERE "party_kind" IS NULL;--> statement-breakpoint
UPDATE "expenses" SET "our_company_id" = '' WHERE "our_company_id" IS NULL;--> statement-breakpoint
-- Lines already there say what their invoice was for.
UPDATE "expense_lines" l SET "category" = e."category"::text, "category_choice" = e."category_choice", "category_other" = e."category_other", "vat_rate" = e."vat_rate"
  FROM "expenses" e WHERE e."id" = l."expense_id" AND l."category" IS NULL;--> statement-breakpoint
-- An invoice without lines gets the one line it always was.
INSERT INTO "expense_lines" ("id", "expense_id", "project_id", "description", "net_amount", "vat_amount", "total_amount", "seq", "category", "category_choice", "category_other", "vat_rate")
  SELECT 'l' || substr(md5(e."id" || 'line'), 1, 23), e."id", e."project_id", NULL, e."net_amount", e."vat_amount", e."total_amount", 0, e."category"::text, e."category_choice", e."category_other", e."vat_rate"
  FROM "expenses" e WHERE NOT EXISTS (SELECT 1 FROM "expense_lines" x WHERE x."expense_id" = e."id");--> statement-breakpoint
-- What was paid already becomes one payment, with the receipt filed on the invoice when there is one.
INSERT INTO "expense_payments" ("id", "expense_id", "paid_on", "amount", "receipt_document_id", "recorded_by_email")
  SELECT 'p' || substr(md5(e."id" || 'paid'), 1, 23), e."id", coalesce(e."paid_on", e."updated_at"), e."paid_amount",
    (SELECT d."id" FROM "documents" d WHERE d."expense_id" = e."id" AND d."category" = 'RECEIPT' ORDER BY d."created_at" LIMIT 1),
    e."recorded_by_email"
  FROM "expenses" e WHERE e."paid_amount" > 0 AND NOT EXISTS (SELECT 1 FROM "expense_payments" x WHERE x."expense_id" = e."id");
