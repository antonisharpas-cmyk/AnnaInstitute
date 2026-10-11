-- The moved and cancelled appointment letters no longer apologise. Only the
-- exact sentence is taken out, so any other wording the office changed stays.
UPDATE "email_templates" SET "body" = replace("body", 'Our apologies for the change. ', ''), "body_el" = replace("body_el", 'Συγγνώμη για την αλλαγή. ', ''), "updated_at" = now() WHERE "key" = 'appointment_moved';
--> statement-breakpoint
UPDATE "email_templates" SET "body" = replace("body", 'Our apologies. ', ''), "body_el" = replace("body_el", 'Συγγνώμη. ', ''), "updated_at" = now() WHERE "key" = 'appointment_cancelled';
