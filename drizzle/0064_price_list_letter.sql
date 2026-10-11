-- The price list letter to the agents, in the office's new words. Replaced only
-- where it still reads as the CRM shipped it, so a message the office rewrote is left alone.
UPDATE "email_templates" SET "subject" = $tpl$Updated price list, {{month}}$tpl$, "body" = $tpl$Dear Partners,

We hope this email finds you well.

We are pleased to inform you that the price list for our projects has been updated. Please find the updated price list for your reference here: {{price_list_url}}

Thank you for your continued collaboration and trust.

Kind regards,
One Eleven$tpl$, "body_whatsapp" = $tpl$Hello {{first_name}}, the price list for our projects has been updated. Here it is: {{price_list_url}} Thank you for your continued collaboration. One Eleven$tpl$, "subject_el" = $tpl$Ενημερωμένος τιμοκατάλογος, {{month}}$tpl$, "body_el" = $tpl$Αγαπητοί Συνεργάτες,

Ελπίζουμε να είστε καλά.

Με χαρά σας ενημερώνουμε ότι ο τιμοκατάλογος των έργων μας ενημερώθηκε. Θα βρείτε τον ενημερωμένο τιμοκατάλογο εδώ: {{price_list_url}}

Σας ευχαριστούμε για τη συνεχή συνεργασία και την εμπιστοσύνη σας.

Με εκτίμηση,
One Eleven$tpl$, "body_whatsapp_el" = $tpl$Γεια σας {{first_name}}, ο τιμοκατάλογος των έργων μας ενημερώθηκε. Θα τον βρείτε εδώ: {{price_list_url}} Σας ευχαριστούμε για τη συνεργασία. One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'price_list' AND "body" = $tpl$Dear {{first_name}},

Here is our current availability: {{price_list_url}}

The page is live, so the prices you quote from it are the prices in our system on the day you look.

One Eleven$tpl$;
