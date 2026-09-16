CREATE TABLE "lead_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"body" text NOT NULL,
	"written_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_written_by_id_users_id_fk" FOREIGN KEY ("written_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Nothing already written is lost: a note that was typed into the old single
-- box becomes the first entry of the record, dated the day the enquiry arrived.
INSERT INTO "lead_notes" ("id", "lead_id", "body", "created_at")
SELECT substr(md5(random()::text || l."id"), 1, 16), l."id", trim(l."notes"), l."created_at"
  FROM "leads" l
 WHERE l."notes" IS NOT NULL AND trim(l."notes") <> '';
