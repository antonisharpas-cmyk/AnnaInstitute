-- The letter to leads about the developments now says what it carries: the brochure,
-- drawings and specifications attached, and the pictures and 3D renders by the files link.
-- Each part is replaced only where it still reads as the CRM shipped it, so text the office rewrote is left alone.
UPDATE "email_templates" SET "description" = $tpl$To leads: the price list of the developments you tick, as a live link. Their brochures, architectural drawings and technical specifications go with it as attachments, and their pictures and 3D renders by a link.$tpl$, "body" = $tpl$Dear {{title}} {{first_name}},

Thank you for your interest in One Eleven.

You will find our price list for {{project_names}} here: {{price_list_url}}

The brochure, architectural drawings and technical specifications are attached. Pictures and 3D renders are here: {{files_url}}

Please let us know which apartments you are interested in, and we will be happy to arrange an appointment or viewing at your convenience.

Kind regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase' AND "body" = $tpl$Dear {{title}} {{first_name}},

Thank you for your interest in One Eleven.

You will find our price list regarding {{project_names}} here: {{price_list_url}}

Please let us know which apartments you’re interested in, and we’ll be happy to arrange an appointment or viewing at your convenience.

Kind Regards,
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_whatsapp" = $tpl$Hello {{first_name}}, thank you for your interest in One Eleven. Our price list for {{project_names}}: {{price_list_url}} Brochure, drawings, specifications and pictures: {{files_url}} Let us know which apartments interest you and we will be happy to arrange a viewing. One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase' AND "body_whatsapp" = $tpl$Hello {{first_name}}, thank you for your interest in One Eleven. Our price list for {{project_names}}: {{price_list_url}} Let us know which apartments interest you and we will be happy to arrange a viewing. One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ/ή {{first_name}},

Σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven.

Θα βρείτε τον τιμοκατάλογό μας για το {{project_names}} εδώ: {{price_list_url}}

Το φυλλάδιο, τα αρχιτεκτονικά σχέδια και οι τεχνικές προδιαγραφές επισυνάπτονται. Φωτογραφίες και τρισδιάστατες απεικονίσεις θα βρείτε εδώ: {{files_url}}

Ενημερώστε μας για ποια διαμερίσματα ενδιαφέρεστε και θα χαρούμε να κανονίσουμε ένα ραντεβού ή μια επίσκεψη όποτε σας βολεύει.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase' AND "body_el" = $tpl$Αγαπητέ/ή {{first_name}},

Σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven.

Θα βρείτε τον τιμοκατάλογό μας για το {{project_names}} εδώ: {{price_list_url}}

Ενημερώστε μας για ποια διαμερίσματα ενδιαφέρεστε και θα χαρούμε να κανονίσουμε ένα ραντεβού ή μια επίσκεψη όποτε σας βολεύει.

Με εκτίμηση,
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_whatsapp_el" = $tpl$Γεια σας {{first_name}}, σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven. Ο τιμοκατάλογός μας για το {{project_names}}: {{price_list_url}} Φυλλάδιο, σχέδια, προδιαγραφές και φωτογραφίες: {{files_url}} Ενημερώστε μας ποια διαμερίσματα σας ενδιαφέρουν για να κανονίσουμε επίσκεψη. One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase' AND "body_whatsapp_el" = $tpl$Γεια σας {{first_name}}, σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven. Ο τιμοκατάλογός μας για το {{project_names}}: {{price_list_url}} Ενημερώστε μας ποια διαμερίσματα σας ενδιαφέρουν για να κανονίσουμε επίσκεψη. One Eleven$tpl$;
