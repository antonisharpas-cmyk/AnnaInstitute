-- Agents can be greeted with Mr, Mrs or Ms, like clients.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "title" text;
--> statement-breakpoint
-- The letter to an agent about a potential client, in the office's new words.
-- Each part is replaced only where it still reads as the CRM shipped it, so a
-- letter the office already rewrote is left alone.
UPDATE "email_templates" SET "body" = $tpl$Dear {{title}} {{first_name}},

This is to confirm that your client's registration has been received and successfully recorded on our end.

Thank you for the submission, no further action is needed at this time. If you have any questions, feel free to reach out.

Kind regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'agent_new_lead' AND "body" = $tpl$Dear {{first_name}},

Thank you. We have recorded {{name}} as a potential client you brought to us.

Interested in: {{interest}}
Looked after by: {{who}}

We will keep you up to date as things move.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ/ή {{first_name}},

Σας επιβεβαιώνουμε ότι η εγγραφή του πελάτη σας παραλήφθηκε και καταχωρήθηκε επιτυχώς από εμάς.

Σας ευχαριστούμε για την υποβολή, δεν απαιτείται καμία περαιτέρω ενέργεια αυτή τη στιγμή. Αν έχετε οποιαδήποτε απορία, μη διστάσετε να επικοινωνήσετε μαζί μας.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'agent_new_lead' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Καταγράψαμε τον/την {{name}} ως πιθανό πελάτη που μας φέρατε.

Ενδιαφέρεται για: {{interest}}
Υπεύθυνος: {{who}}

Θα σας ενημερώνουμε για την πορεία.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_whatsapp" = $tpl$Hello {{first_name}}, your client {{name}} has been registered with us. Thank you for the submission, no further action is needed at this time.$tpl$, "updated_at" = now() WHERE "key" = 'agent_new_lead' AND "body_whatsapp" = $tpl$Hello {{first_name}}, we have recorded {{name}} as your potential client, interested in {{interest}}. Thank you.$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_whatsapp_el" = $tpl$Γεια σας {{first_name}}, ο πελάτης σας {{name}} καταχωρήθηκε. Σας ευχαριστούμε για την υποβολή, δεν απαιτείται καμία περαιτέρω ενέργεια.$tpl$, "updated_at" = now() WHERE "key" = 'agent_new_lead' AND "body_whatsapp_el" = $tpl$Γεια σας {{first_name}}, καταγράψαμε τον/την {{name}} ως πιθανό πελάτη σας, με ενδιαφέρον για {{interest}}. Ευχαριστούμε.$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "description" = $tpl$Goes to the agent when a lead is written down with them as the agent who brought it. Once for each agent and lead. It confirms the registration of their client, named in the subject, and asks nothing of them.$tpl$ WHERE "key" = 'agent_new_lead' AND "description" = $tpl$Goes to the agent when a lead is written down with them as the agent who brought it. Once for each agent and lead. It names the person and what they are interested in, and nothing more, since the agent brought them.$tpl$;
