-- A cancelled contract keeps its apartment as a record but no longer holds it.
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_unit_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_unit_open" ON "contracts" ("unit_id") WHERE status <> 'CANCELLED';
