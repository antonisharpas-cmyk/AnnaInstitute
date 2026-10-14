-- The two letters that carry the Reservation Agreement or the Contract of Sale lead with the paper, not the invoice:
-- "Your Reservation Agreement and invoice 0024, apartment 302 at MAGNUM OPUS UNO". A subject the office changed is left alone.
UPDATE "email_templates" SET "subject" = 'Your {{paper}} and invoice {{invoice_number}}, apartment {{unit}} at {{project}}', "updated_at" = now() WHERE "key" = 'paper_invoice' AND "subject" = 'Invoice {{invoice_number}} for your {{paper}}, {{unit}} at {{project}}';
--> statement-breakpoint
UPDATE "email_templates" SET "subject_el" = 'Το {{paper}} σας και το τιμολόγιο {{invoice_number}}, διαμέρισμα {{unit}} στο {{project}}', "updated_at" = now() WHERE "key" = 'paper_invoice' AND "subject_el" = 'Τιμολόγιο {{invoice_number}} για το {{paper}} σας, {{unit}} στο {{project}}';
--> statement-breakpoint
UPDATE "email_templates" SET "subject" = 'Your signed {{paper}} and invoice {{invoice_number}}, apartment {{unit}} at {{project}}', "updated_at" = now() WHERE "key" = 'stage_invoice_signed' AND "subject" = 'Invoice {{invoice_number}} and your signed {{paper}}, {{unit}} at {{project}}';
--> statement-breakpoint
UPDATE "email_templates" SET "subject_el" = 'Το υπογεγραμμένο {{paper}} σας και το τιμολόγιο {{invoice_number}}, διαμέρισμα {{unit}} στο {{project}}', "updated_at" = now() WHERE "key" = 'stage_invoice_signed' AND "subject_el" = 'Τιμολόγιο {{invoice_number}} και το υπογεγραμμένο {{paper}}, {{unit}} στο {{project}}';
