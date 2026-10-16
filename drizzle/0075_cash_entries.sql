-- Cash paid or received outside the invoices: a record only, with no invoice, receipt or VAT, and never
-- sent to the accountant. It counts in the Income and expenses and the Shareholders reports.
CREATE TABLE IF NOT EXISTS "cash_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "direction" text NOT NULL,
  "entry_date" timestamp with time zone NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "party" text NOT NULL,
  "category" text DEFAULT 'OTHER' NOT NULL,
  "category_choice" text,
  "category_other" text,
  "project_id" text REFERENCES "projects"("id") ON DELETE SET NULL,
  "our_company_id" text DEFAULT '' NOT NULL,
  "description" text,
  "notes" text,
  "recorded_by_email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_entries_date_idx" ON "cash_entries" ("entry_date");
