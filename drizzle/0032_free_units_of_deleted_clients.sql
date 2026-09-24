-- Apartments still held by a client who is in the bin go back on the market,
-- unless a live contract still stands on them.
UPDATE "units" u SET
  "status" = 'AVAILABLE',
  "status_by_hand_at" = NULL,
  "status_by_hand_by" = NULL,
  "client_id" = NULL,
  "updated_at" = now()
WHERE u."client_id" IN (SELECT "id" FROM "clients" WHERE "deleted_at" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "contracts" c WHERE c."unit_id" = u."id" AND c."status" <> 'CANCELLED')
  AND NOT EXISTS (SELECT 1 FROM "contract_units" cu JOIN "contracts" c ON c."id" = cu."contract_id" WHERE cu."unit_id" = u."id" AND c."status" <> 'CANCELLED');--> statement-breakpoint
-- Whatever is left keeps its status, and simply names nobody in the bin.
UPDATE "units" SET "client_id" = NULL, "updated_at" = now()
WHERE "client_id" IN (SELECT "id" FROM "clients" WHERE "deleted_at" IS NOT NULL);
