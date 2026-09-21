DO $$ BEGIN
 CREATE TYPE "public"."appointment_type" AS ENUM('TIMBER', 'BATHROOMS_TILES', 'OFFICE', 'PHONE_CALL', 'BUILDING', 'OTHER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "type" "appointment_type" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "assigned_to_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_to_id_team_members_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
