-- Negotiation: an apartment a client is discussing, before the Reservation Agreement is signed.
ALTER TYPE "public"."unit_status" ADD VALUE IF NOT EXISTS 'NEGOTIATION' BEFORE 'RESERVED';
