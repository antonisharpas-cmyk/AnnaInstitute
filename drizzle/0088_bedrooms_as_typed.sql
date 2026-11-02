-- Bedrooms as the office writes them: 2, or 2+1 for two bedrooms and a room that can become a third.
ALTER TABLE "units" ALTER COLUMN "bedrooms" SET DATA TYPE text USING "bedrooms"::text;
