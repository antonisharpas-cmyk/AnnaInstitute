-- The Reservation and the Contract of Sale: the agreed paper now goes to the buyer with its invoice in one letter,
-- so the letter asking the buyer to check a draft is no longer sent. What it already sent stays in the history.
DELETE FROM "email_templates" WHERE "key" = 'paper_review';
--> statement-breakpoint
UPDATE "email_templates" SET "name" = 'The agreed paper, with its invoice', "description" = $tpl$Goes to the buyer when the office presses Send on the agreed Reservation or Contract of Sale, before it is signed. The agreed paper and the invoice for its stage are attached, so they can pay it on the day they sign. The receipt follows with the signed copy when the money comes in.$tpl$, "updated_at" = now() WHERE "key" = 'paper_invoice' AND "name" = 'Invoice before signing';
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Attached is the {{paper}} for {{unit}} at {{project}}, as agreed, together with invoice {{invoice_number}} for {{stage}}, {{amount}}, to pay when you come to sign.

Your receipt and the signed {{paper}} will follow once it is signed and paid.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paper_invoice' AND "body" = $tpl$Dear {{first_name}},

Thank you for confirming the {{paper}} for {{unit}} at {{project}}.

Attached is invoice {{invoice_number}} for {{stage}}, {{amount}}, to pay when you come to sign. Your receipt and the signed {{paper}} will follow once it is signed and paid.

Kind Regards,
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το {{paper}} για το {{unit}} στο {{project}}, όπως συμφωνήθηκε, μαζί με το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}, για να το πληρώσετε όταν έρθετε να υπογράψετε.

Η απόδειξη και το υπογεγραμμένο {{paper}} θα ακολουθήσουν μόλις υπογραφεί και πληρωθεί.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paper_invoice' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε που επιβεβαιώσατε το {{paper}} για το {{unit}} στο {{project}}.

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}, για να το πληρώσετε όταν έρθετε να υπογράψετε. Η απόδειξη και το υπογεγραμμένο {{paper}} θα ακολουθήσουν μόλις υπογραφεί και πληρωθεί.

Με εκτίμηση,
One Eleven$tpl$;
