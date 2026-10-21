-- Signing everybody out of one login: a session made before this moment is no longer accepted.
-- Set when a password is reset or changed, so the old password's sessions end with it.
ALTER TABLE "users" ADD COLUMN "sessions_valid_from" timestamp with time zone;
