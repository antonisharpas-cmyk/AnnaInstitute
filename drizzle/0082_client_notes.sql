-- The office's running notes on a client, one row per note, the same as on a lead.
CREATE TABLE IF NOT EXISTS "client_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"body" text NOT NULL,
	"written_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_written_by_id_users_id_fk" FOREIGN KEY ("written_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_notes_client_idx" ON "client_notes" USING btree ("client_id");
