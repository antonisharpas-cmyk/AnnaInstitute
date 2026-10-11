-- The letter to leads about the developments, in the office's new words. Replaced
-- only where it still reads as the CRM shipped it, so a message the office rewrote is left alone.
UPDATE "email_templates" SET "description" = $tpl$To leads: the price list of the developments you tick, as a live link. Their brochures and drawings go with it as attachments.$tpl$, "subject" = $tpl$Price list | {{project_names}}$tpl$, "body" = $tpl$Dear {{title}} {{first_name}},

Thank you for your interest in One Eleven.

You will find our price list regarding {{project_names}} here: {{price_list_url}}

Please let us know which apartments you’re interested in, and we’ll be happy to arrange an appointment or viewing at your convenience.

Kind Regards,
One Eleven$tpl$, "body_whatsapp" = $tpl$Hello {{first_name}}, thank you for your interest in One Eleven. Our price list for {{project_names}}: {{price_list_url}} Let us know which apartments interest you and we will be happy to arrange a viewing. One Eleven$tpl$, "subject_el" = $tpl$Τιμοκατάλογος | {{project_names}}$tpl$, "body_el" = $tpl$Αγαπητέ/ή {{first_name}},

Σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven.

Θα βρείτε τον τιμοκατάλογό μας για το {{project_names}} εδώ: {{price_list_url}}

Ενημερώστε μας για ποια διαμερίσματα ενδιαφέρεστε και θα χαρούμε να κανονίσουμε ένα ραντεβού ή μια επίσκεψη όποτε σας βολεύει.

Με εκτίμηση,
One Eleven$tpl$, "body_whatsapp_el" = $tpl$Γεια σας {{first_name}}, σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven. Ο τιμοκατάλογός μας για το {{project_names}}: {{price_list_url}} Ενημερώστε μας ποια διαμερίσματα σας ενδιαφέρουν για να κανονίσουμε επίσκεψη. One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase' AND "body" = $tpl$Dear {{first_name}},

Thank you for your interest in One Eleven. This is what we have available today.

{{projects}}

The brochures, the specifications and the architectural drawings are attached. The pictures are here: {{files_url}}

The price list, always up to date: {{price_list_url}}

Tell us which apartment you would like to see and we will arrange a viewing.

One Eleven$tpl$;
