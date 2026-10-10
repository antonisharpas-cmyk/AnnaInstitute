-- Partners: the office's directory of outside partners and collaborators.
CREATE TABLE IF NOT EXISTS "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"email" text,
	"mobile" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
