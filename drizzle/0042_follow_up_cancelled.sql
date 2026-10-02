-- A follow up can be called off, like an appointment: Cancelled, beside
-- Pending and Done, so the calendar can show it in red.
ALTER TYPE "public"."follow_up_status" ADD VALUE IF NOT EXISTS 'CANCELLED';
