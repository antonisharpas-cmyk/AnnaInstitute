-- The agreement signed with an agent: one file or several, kept on the agent's page.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "agent_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_agent_idx" ON "documents" USING btree ("agent_id");
