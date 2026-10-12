-- The commission letter to agents names the company the invoice is made out to:
-- the company that holds the development of the apartment sold, or One Eleven when none does.
-- Changed only where the text still reads as the CRM shipped it.
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

{{buyer}} has paid the signing of the contract for {{unit}} at {{project}}, and your commission on the sale has been generated.

Commission: {{amount}}
Worked out on: {{base}}

Please send us the invoice for it and we will proceed with the payment accordingly.

Please issue the invoice under the company name: {{company}}

Thank you for the sale.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'agent_commission' AND "body" = $tpl$Dear {{first_name}},

{{buyer}} has paid the signing of the contract for {{unit}} at {{project}}, and your commission on the sale has been generated.

Commission: {{amount}}
Worked out on: {{base}}

Please send us the invoice for it and we will proceed with the payment accordingly.

Please issue the invoice under the company name: Dex-ino

Thank you for the sale.

Kind Regards,
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Ο/Η {{buyer}} πλήρωσε την υπογραφή του συμβολαίου για το {{unit}} στο {{project}}, και η προμήθειά σας για την πώληση δημιουργήθηκε.

Προμήθεια: {{amount}}
Υπολογισμένη επί: {{base}}

Παρακαλούμε στείλτε μας το τιμολόγιο και θα προχωρήσουμε με την πληρωμή αναλόγως.

Παρακαλούμε εκδώστε το τιμολόγιο στο όνομα της εταιρείας: {{company}}

Σας ευχαριστούμε για την πώληση.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'agent_commission' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Ο/Η {{buyer}} πλήρωσε την υπογραφή του συμβολαίου για το {{unit}} στο {{project}}, και η προμήθειά σας για την πώληση δημιουργήθηκε.

Προμήθεια: {{amount}}
Υπολογισμένη επί: {{base}}

Παρακαλούμε στείλτε μας το τιμολόγιο και θα προχωρήσουμε με την πληρωμή αναλόγως.

Παρακαλούμε εκδώστε το τιμολόγιο στο όνομα της εταιρείας: Dex-ino

Σας ευχαριστούμε για την πώληση.

Με εκτίμηση,
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "description" = $tpl$Goes to the agent the moment their commission comes into being, which is when the buyer has paid the opening of the contract: the reservation and the signing where there are both. It says which sale, what the commission is, and that the invoice is now due from them, made out to the company that holds the development ({{company}}).$tpl$ WHERE "key" = 'agent_commission' AND "description" = $tpl$Goes to the agent the moment their commission comes into being, which is when the buyer has paid the opening of the contract: the reservation and the signing where there are both. It says which sale, what the commission is, and that the invoice is now due from them.$tpl$;
