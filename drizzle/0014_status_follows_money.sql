ALTER TYPE "public"."project_status" ADD VALUE 'DELIVERED';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status_by_hand_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status_by_hand_by" text;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "status_by_hand_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "status_by_hand_by" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_by_hand_by_users_id_fk" FOREIGN KEY ("status_by_hand_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_status_by_hand_by_users_id_fk" FOREIGN KEY ("status_by_hand_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;