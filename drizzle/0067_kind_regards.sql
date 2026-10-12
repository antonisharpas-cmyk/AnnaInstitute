-- Letters that ended with only "One Eleven" now close with "Kind Regards," ("Με εκτίμηση," in Greek) above it.
-- Changed only where the text still reads as the CRM shipped it, so a letter the office rewrote is left alone.
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

We would like to invite you to {{project}} in {{location}}.

{{details}}

Find it on the map: {{maps_url}}

Reply to this message and we will keep a time for you.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'viewing_invitation' AND "body" = $tpl$Dear {{first_name}},

We would like to invite you to {{project}} in {{location}}.

{{details}}

Find it on the map: {{maps_url}}

Reply to this message and we will keep a time for you.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Θα θέλαμε να σας προσκαλέσουμε στο {{project}} στη {{location}}.

{{details}}

Στον χάρτη: {{maps_url}}

Απαντήστε και κρατάμε μια ώρα για εσάς.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'viewing_invitation' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Θα θέλαμε να σας προσκαλέσουμε στο {{project}} στη {{location}}.

{{details}}

Στον χάρτη: {{maps_url}}

Απαντήστε και κρατάμε μια ώρα για εσάς.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Thank you. We have received your reservation of {{amount}} for {{unit}} at {{project}}, and the apartment is now held for you.

Your receipt is attached.

What happens next is the contract. We will be in touch to arrange the signing, and everything you have paid is set against the price.

Welcome to {{project}}.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paid_reservation' AND "body" = $tpl$Dear {{first_name}},

Thank you. We have received your reservation of {{amount}} for {{unit}} at {{project}}, and the apartment is now held for you.

Your receipt is attached.

What happens next is the contract. We will be in touch to arrange the signing, and everything you have paid is set against the price.

Welcome to {{project}}.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε την κράτηση {{amount}} για το {{unit}} στο {{project}} και το διαμέρισμα κρατείται για εσάς.

Η απόδειξή σας επισυνάπτεται.

Ακολουθεί το συμβόλαιο. Θα επικοινωνήσουμε για να κανονίσουμε την υπογραφή, και ό,τι έχετε πληρώσει αφαιρείται από την τιμή.

Καλώς ήρθατε στο {{project}}.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paid_reservation' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε την κράτηση {{amount}} για το {{unit}} στο {{project}} και το διαμέρισμα κρατείται για εσάς.

Η απόδειξή σας επισυνάπτεται.

Ακολουθεί το συμβόλαιο. Θα επικοινωνήσουμε για να κανονίσουμε την υπογραφή, και ό,τι έχετε πληρώσει αφαιρείται από την τιμή.

Καλώς ήρθατε στο {{project}}.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Thank you. We have received {{amount}} on the signing of your contract for {{unit}} at {{project}}.

Your contract is attached, together with the receipt for this payment. Please keep them both.

The remaining installments are as set out in the contract, and we will write to you each time one is received.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paid_signing' AND "body" = $tpl$Dear {{first_name}},

Thank you. We have received {{amount}} on the signing of your contract for {{unit}} at {{project}}.

Your contract is attached, together with the receipt for this payment. Please keep them both.

The remaining installments are as set out in the contract, and we will write to you each time one is received.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε {{amount}} με την υπογραφή του συμβολαίου σας για το {{unit}} στο {{project}}.

Επισυνάπτεται το συμβόλαιό σας μαζί με την απόδειξη της πληρωμής. Παρακαλούμε κρατήστε και τα δύο.

Οι υπόλοιπες δόσεις είναι όπως ορίζονται στο συμβόλαιο, και θα σας γράφουμε κάθε φορά που εισπράττεται μία.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paid_signing' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε {{amount}} με την υπογραφή του συμβολαίου σας για το {{unit}} στο {{project}}.

Επισυνάπτεται το συμβόλαιό σας μαζί με την απόδειξη της πληρωμής. Παρακαλούμε κρατήστε και τα δύο.

Οι υπόλοιπες δόσεις είναι όπως ορίζονται στο συμβόλαιο, και θα σας γράφουμε κάθε φορά που εισπράττεται μία.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Thank you. We have received {{amount}} for {{stage}} on {{unit}} at {{project}}.

Your receipt is attached. The balance on your contract is now {{outstanding}}.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paid_installment' AND "body" = $tpl$Dear {{first_name}},

Thank you. We have received {{amount}} for {{stage}} on {{unit}} at {{project}}.

Your receipt is attached. The balance on your contract is now {{outstanding}}.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε {{amount}} για {{stage}} στο {{unit}} στο {{project}}.

Η απόδειξή σας επισυνάπτεται. Το υπόλοιπο του συμβολαίου σας είναι {{outstanding}}.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paid_installment' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε {{amount}} για {{stage}} στο {{unit}} στο {{project}}.

Η απόδειξή σας επισυνάπτεται. Το υπόλοιπο του συμβολαίου σας είναι {{outstanding}}.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Thank you. With {{amount}} we have received the last installment for {{unit}} at {{project}}, and your contract is paid in full.

Your receipt is attached.

Congratulations. It has been a pleasure to have you with us, and we will be in touch about the handover and the keys.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paid_final' AND "body" = $tpl$Dear {{first_name}},

Thank you. With {{amount}} we have received the last installment for {{unit}} at {{project}}, and your contract is paid in full.

Your receipt is attached.

Congratulations. It has been a pleasure to have you with us, and we will be in touch about the handover and the keys.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Με {{amount}} λάβαμε την τελευταία δόση για το {{unit}} στο {{project}}, και το συμβόλαιό σας εξοφλήθηκε.

Η απόδειξή σας επισυνάπτεται.

Συγχαρητήρια. Χαρήκαμε πολύ που σας είχαμε μαζί μας, και θα επικοινωνήσουμε για την παράδοση και τα κλειδιά.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paid_final' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Με {{amount}} λάβαμε την τελευταία δόση για το {{unit}} στο {{project}}, και το συμβόλαιό σας εξοφλήθηκε.

Η απόδειξή σας επισυνάπτεται.

Συγχαρητήρια. Χαρήκαμε πολύ που σας είχαμε μαζί μας, και θα επικοινωνήσουμε για την παράδοση και τα κλειδιά.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

This is to confirm your appointment.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

If the day or the time does not suit you, reply to this email and we will move it.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'appointment_made' AND "body" = $tpl$Dear {{first_name}},

This is to confirm your appointment.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

If the day or the time does not suit you, reply to this email and we will move it.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Επιβεβαιώνουμε το ραντεβού σας.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Αν η ημέρα ή η ώρα δεν σας εξυπηρετεί, απαντήστε σε αυτό το email και το μετακινούμε.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'appointment_made' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Επιβεβαιώνουμε το ραντεβού σας.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Αν η ημέρα ή η ώρα δεν σας εξυπηρετεί, απαντήστε σε αυτό το email και το μετακινούμε.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Your appointment has been changed. These are the new details.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

Reply to this email if the new time does not suit you.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'appointment_moved' AND "body" = $tpl$Dear {{first_name}},

Your appointment has been changed. These are the new details.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

Reply to this email if the new time does not suit you.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Το ραντεβού σας άλλαξε. Αυτά είναι τα νέα στοιχεία.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Απαντήστε αν η νέα ώρα δεν σας εξυπηρετεί.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'appointment_moved' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Το ραντεβού σας άλλαξε. Αυτά είναι τα νέα στοιχεία.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Απαντήστε αν η νέα ώρα δεν σας εξυπηρετεί.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Your appointment at {{place}} on {{day}} at {{time}} has been cancelled.

Reply to this email and we will arrange another one whenever suits you.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'appointment_cancelled' AND "body" = $tpl$Dear {{first_name}},

Your appointment at {{place}} on {{day}} at {{time}} has been cancelled.

Reply to this email and we will arrange another one whenever suits you.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Το ραντεβού σας στο {{place}} στις {{day}} στις {{time}} ακυρώθηκε.

Απαντήστε σε αυτό το email και κανονίζουμε άλλο όποτε σας εξυπηρετεί.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'appointment_cancelled' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Το ραντεβού σας στο {{place}} στις {{day}} στις {{time}} ακυρώθηκε.

Απαντήστε σε αυτό το email και κανονίζουμε άλλο όποτε σας εξυπηρετεί.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

A reminder of your appointment tomorrow.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

If something has come up, reply to this email and we will find another time.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'appointment_reminder' AND "body" = $tpl$Dear {{first_name}},

A reminder of your appointment tomorrow.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

If something has come up, reply to this email and we will find another time.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας υπενθυμίζουμε το αυριανό σας ραντεβού.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Αν προέκυψε κάτι, απαντήστε σε αυτό το email και βρίσκουμε άλλη ώρα.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'appointment_reminder' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας υπενθυμίζουμε το αυριανό σας ραντεβού.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Αν προέκυψε κάτι, απαντήστε σε αυτό το email και βρίσκουμε άλλη ώρα.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

{{buyer}} has paid the signing of the contract for {{unit}} at {{project}}, and your commission on the sale has been generated.

Commission: {{amount}}
Worked out on: {{base}}

Please send us the invoice for it and we will proceed with the payment accordingly.

Please issue the invoice under the company name: Dex-ino

Thank you for the sale.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'agent_commission' AND "body" = $tpl$Dear {{first_name}},

{{buyer}} has paid the signing of the contract for {{unit}} at {{project}}, and your commission on the sale has been generated.

Commission: {{amount}}
Worked out on: {{base}}

Please send us the invoice for it and we will proceed with the payment accordingly.

Please issue the invoice under the company name: Dex-ino

Thank you for the sale.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Ο/Η {{buyer}} πλήρωσε την υπογραφή του συμβολαίου για το {{unit}} στο {{project}}, και η προμήθειά σας για την πώληση δημιουργήθηκε.

Προμήθεια: {{amount}}
Υπολογισμένη επί: {{base}}

Παρακαλούμε στείλτε μας το τιμολόγιο και θα προχωρήσουμε με την πληρωμή αναλόγως.

Παρακαλούμε εκδώστε το τιμολόγιο στο όνομα της εταιρείας: Dex-ino

Σας ευχαριστούμε για την πώληση.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'agent_commission' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Ο/Η {{buyer}} πλήρωσε την υπογραφή του συμβολαίου για το {{unit}} στο {{project}}, και η προμήθειά σας για την πώληση δημιουργήθηκε.

Προμήθεια: {{amount}}
Υπολογισμένη επί: {{base}}

Παρακαλούμε στείλτε μας το τιμολόγιο και θα προχωρήσουμε με την πληρωμή αναλόγως.

Παρακαλούμε εκδώστε το τιμολόγιο στο όνομα της εταιρείας: Dex-ino

Σας ευχαριστούμε για την πώληση.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Attached is the {{paper}} for {{unit}} at {{project}}.

Please read it and tell us if you would like anything changed. When it is as you want it, reply to let us know and we will send you the invoice, so you have it with you when you come to sign.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paper_review' AND "body" = $tpl$Dear {{first_name}},

Attached is the {{paper}} for {{unit}} at {{project}}.

Please read it and tell us if you would like anything changed. When it is as you want it, reply to let us know and we will send you the invoice, so you have it with you when you come to sign.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το {{paper}} για το {{unit}} στο {{project}}.

Παρακαλούμε διαβάστε το και πείτε μας αν θέλετε κάποια αλλαγή. Όταν είναι όπως το θέλετε, απαντήστε μας και θα σας στείλουμε το τιμολόγιο, ώστε να το έχετε μαζί σας όταν έρθετε να υπογράψετε.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paper_review' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το {{paper}} για το {{unit}} στο {{project}}.

Παρακαλούμε διαβάστε το και πείτε μας αν θέλετε κάποια αλλαγή. Όταν είναι όπως το θέλετε, απαντήστε μας και θα σας στείλουμε το τιμολόγιο, ώστε να το έχετε μαζί σας όταν έρθετε να υπογράψετε.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Thank you for confirming the {{paper}} for {{unit}} at {{project}}.

Attached is invoice {{invoice_number}} for {{stage}}, {{amount}}, to pay when you come to sign. Your receipt and the signed {{paper}} will follow once it is signed and paid.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paper_invoice' AND "body" = $tpl$Dear {{first_name}},

Thank you for confirming the {{paper}} for {{unit}} at {{project}}.

Attached is invoice {{invoice_number}} for {{stage}}, {{amount}}, to pay when you come to sign. Your receipt and the signed {{paper}} will follow once it is signed and paid.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε που επιβεβαιώσατε το {{paper}} για το {{unit}} στο {{project}}.

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}, για να το πληρώσετε όταν έρθετε να υπογράψετε. Η απόδειξη και το υπογεγραμμένο {{paper}} θα ακολουθήσουν μόλις υπογραφεί και πληρωθεί.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paper_invoice' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Σας ευχαριστούμε που επιβεβαιώσατε το {{paper}} για το {{unit}} στο {{project}}.

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}, για να το πληρώσετε όταν έρθετε να υπογράψετε. Η απόδειξη και το υπογεγραμμένο {{paper}} θα ακολουθήσουν μόλις υπογραφεί και πληρωθεί.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Attached is your signed {{paper}} for {{unit}} at {{project}}, with the receipt for your payment.

Thank you.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paper_signed' AND "body" = $tpl$Dear {{first_name}},

Attached is your signed {{paper}} for {{unit}} at {{project}}, with the receipt for your payment.

Thank you.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το υπογεγραμμένο {{paper}} σας για το {{unit}} στο {{project}}, μαζί με την απόδειξη της πληρωμής σας.

Σας ευχαριστούμε.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'paper_signed' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το υπογεγραμμένο {{paper}} σας για το {{unit}} στο {{project}}, μαζί με την απόδειξη της πληρωμής σας.

Σας ευχαριστούμε.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Attached is your signed {{paper}} for {{unit}} at {{project}}, together with invoice {{invoice_number}} for {{stage}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'stage_invoice_signed' AND "body" = $tpl$Dear {{first_name}},

Attached is your signed {{paper}} for {{unit}} at {{project}}, together with invoice {{invoice_number}} for {{stage}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το υπογεγραμμένο {{paper}} για το {{unit}} στο {{project}}, μαζί με το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'stage_invoice_signed' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το υπογεγραμμένο {{paper}} για το {{unit}} στο {{project}}, μαζί με το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

{{stage}} at {{project}} has been reached, as the architect's certificate and the photographs attached show.

Attached is invoice {{invoice_number}} for {{stage}} on {{unit}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'stage_invoice_works' AND "body" = $tpl$Dear {{first_name}},

{{stage}} at {{project}} has been reached, as the architect's certificate and the photographs attached show.

Attached is invoice {{invoice_number}} for {{stage}} on {{unit}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Ολοκληρώθηκε το στάδιο {{stage}} στο {{project}}, όπως δείχνουν το πιστοποιητικό του αρχιτέκτονα και οι φωτογραφίες που επισυνάπτονται.

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}} στο {{unit}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'stage_invoice_works' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Ολοκληρώθηκε το στάδιο {{stage}} στο {{project}}, όπως δείχνουν το πιστοποιητικό του αρχιτέκτονα και οι φωτογραφίες που επισυνάπτονται.

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}} στο {{unit}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Attached is invoice {{invoice_number}} for {{stage}} on {{unit}} at {{project}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'stage_invoice' AND "body" = $tpl$Dear {{first_name}},

Attached is invoice {{invoice_number}} for {{stage}} on {{unit}} at {{project}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}} στο {{unit}} στο {{project}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'stage_invoice' AND "body_el" = $tpl$Αγαπητέ {{first_name}},

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}} στο {{unit}} στο {{project}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

One Eleven$tpl$;
