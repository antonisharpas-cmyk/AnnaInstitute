CREATE TYPE "public"."id_type" AS ENUM('ID_CARD', 'PASSPORT', 'YELLOW_SLIP');--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "id_type" "id_type";