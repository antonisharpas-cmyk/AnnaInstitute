CREATE TABLE IF NOT EXISTS "choices" (
	"id" text PRIMARY KEY NOT NULL,
	"list" text NOT NULL,
	"code" text NOT NULL,
	"label_en" text,
	"label_el" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "choices_list_code_idx" ON "choices" USING btree ("list","code");--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "status_choice" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source_choice" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "source_choice" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "id_type_choice" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status_choice" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "status_choice" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "status_choice" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "type_choice" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "category_choice" text;
