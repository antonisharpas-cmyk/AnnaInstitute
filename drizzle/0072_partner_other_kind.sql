-- A partner under Others says what kind of partner they are, typed by the office, so the
-- directory can tell a notary from a surveyor without a category for each.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "category_other" text;
