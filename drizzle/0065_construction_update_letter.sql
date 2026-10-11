-- The construction update, in the office's new words, to the buyers of the
-- development and its companies. Replaced only where it still reads as the CRM
-- shipped it, so a message the office rewrote is left alone.
UPDATE "email_templates" SET "name" = 'Construction progress update', "description" = $tpl$To the buyers of a development and its companies, with the photographs of the site attached. {{project}} fills in from the development; the works in progress and the works coming are typed for each update, so change them in the campaign before sending.$tpl$, "subject" = $tpl$Construction progress update | {{project}}$tpl$, "body" = $tpl$Dear All,

We are pleased to share the latest construction progress update for {{project}}, along with photographs illustrating the current stage of the works.

Works Currently in Progress:
Aluminium frame installation.
Ground floor works, including the finishing of the ground floor verandas.

Upcoming Works:
Elevator installation.
Kitchen installation, as the project progresses towards the completion of the internal finishes.

Please find attached the latest photographs from the construction site, showcasing the progress achieved to date.

The One Eleven supervision team continues to monitor the project on a daily basis, ensuring that the works are carried out in accordance with the agreed quality specifications.

Should you require any further information, please do not hesitate to contact us.

Kind Regards,
One Eleven$tpl$, "body_whatsapp" = $tpl$Hello {{first_name}}, the latest construction progress update for {{project}}: aluminium frames and the ground floor in progress, the elevator and the kitchens next. Photographs here: {{files_url}} One Eleven$tpl$, "subject_el" = $tpl$Ενημέρωση προόδου κατασκευής | {{project}}$tpl$, "body_el" = $tpl$Αγαπητοί όλοι,

Με χαρά σας στέλνουμε την τελευταία ενημέρωση για την πρόοδο της κατασκευής του {{project}}, μαζί με φωτογραφίες που δείχνουν το τρέχον στάδιο των εργασιών.

Εργασίες σε εξέλιξη:
Τοποθέτηση των αλουμινίων.
Εργασίες στο ισόγειο, μαζί με το φινίρισμα των βεραντών του ισογείου.

Επόμενες εργασίες:
Τοποθέτηση του ανελκυστήρα.
Τοποθέτηση των κουζινών, καθώς το έργο προχωρά προς την ολοκλήρωση των εσωτερικών τελειωμάτων.

Επισυνάπτονται οι πιο πρόσφατες φωτογραφίες από το εργοτάξιο, που δείχνουν την πρόοδο μέχρι σήμερα.

Η ομάδα επίβλεψης της One Eleven συνεχίζει να παρακολουθεί το έργο καθημερινά, ώστε οι εργασίες να γίνονται σύμφωνα με τις συμφωνημένες προδιαγραφές ποιότητας.

Για οποιαδήποτε περαιτέρω πληροφορία, μη διστάσετε να επικοινωνήσετε μαζί μας.

Με εκτίμηση,
One Eleven$tpl$, "body_whatsapp_el" = $tpl$Γεια σας {{first_name}}, η τελευταία ενημέρωση για την κατασκευή του {{project}}: σε εξέλιξη τα αλουμίνια και το ισόγειο, ακολουθούν ο ανελκυστήρας και οι κουζίνες. Φωτογραφίες: {{files_url}} One Eleven$tpl$, "to_clients" = false, "to_agents" = false, "to_subowners" = true, "to_buyers" = true, "updated_at" = now() WHERE "key" = 'construction_update' AND "body" = $tpl$Dear {{first_name}},

A short update on {{project}}.

{{details}}

{{completion}}

The photographs are attached.

One Eleven$tpl$;
