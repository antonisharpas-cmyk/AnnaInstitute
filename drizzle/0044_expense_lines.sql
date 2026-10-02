-- An invoice under Company that covers more than one development: a line per
-- development, each with its own amount.
CREATE TABLE IF NOT EXISTS "expense_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "expense_id" text NOT NULL,
  "project_id" text,
  "description" text,
  "net_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "vat_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
  "seq" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_lines_expense" ON "expense_lines" ("expense_id");
