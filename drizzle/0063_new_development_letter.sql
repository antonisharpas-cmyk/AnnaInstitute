-- "A new development" becomes the launch letter to the partner agents. It is
-- replaced only where it still reads as the CRM shipped it, so a message the
-- office already rewrote is left alone.
UPDATE "email_templates" SET "name" = 'A new development, to the agents', "description" = $tpl$Introduces a new development to the partner agents, with the sales package attached and the launch commission. {{project}}, {{location}} and {{residences}} (how many apartments it has) fill in from the development chosen; attach the brochure, renders, plans and price list to the campaign.$tpl$, "subject" = $tpl$Introducing {{project}} | Launch Commission 7%$tpl$, "body" = $tpl$Dear Partners,

We are excited to introduce {{project}}, our newest boutique development in the highly sought after {{location}}, just 500m from the sea.

The planning permit application has already been submitted, and the project is now progressing through the approval process.

With only {{residences}} exclusive residences, this is a limited collection designed for clients looking for modern architecture, quality and privacy. The development offers a carefully selected mix of 1, 2, 2+1 and 3 bedroom apartments, including a unique 2 bedroom residence with its own private garden and courtyard.

Your complete sales package is attached:

• Project Brochure
• 3D Renders
• Architectural Plans
• Location
• Price List
• Technical Specifications, including air conditioning units

Launch Commission: 7%

To support the launch of {{project}}, we are offering our partner agents an enhanced 7% commission until the start of construction. After construction begins, the commission will return to the standard 5%.

With only {{residences}} residences available, we encourage you to review the attached material and introduce the project to your clients at this early stage.

We look forward to working together on {{project}}.

Kind regards,
One Eleven$tpl$, "body_whatsapp" = $tpl$Hello {{first_name}}, we are excited to introduce {{project}}, our newest boutique development in the {{location}}, with only {{residences}} residences. Launch commission 7% until construction starts. The sales package is in your email. One Eleven$tpl$, "subject_el" = $tpl$Σας παρουσιάζουμε το {{project}} | Προμήθεια έναρξης 7%$tpl$, "body_el" = $tpl$Αγαπητοί Συνεργάτες,

Με ενθουσιασμό σας παρουσιάζουμε το {{project}}, το νεότερο boutique έργο μας στην ιδιαίτερα περιζήτητη τοποθεσία {{location}}, μόλις 500μ. από τη θάλασσα.

Η αίτηση για την πολεοδομική άδεια έχει ήδη υποβληθεί και το έργο προχωρά στη διαδικασία έγκρισης.

Με μόνο {{residences}} αποκλειστικές κατοικίες, πρόκειται για μια περιορισμένη συλλογή για πελάτες που αναζητούν σύγχρονη αρχιτεκτονική, ποιότητα και ιδιωτικότητα. Το έργο προσφέρει προσεκτικά επιλεγμένο συνδυασμό διαμερισμάτων 1, 2, 2+1 και 3 υπνοδωματίων, μεταξύ των οποίων μια μοναδική κατοικία 2 υπνοδωματίων με δικό της ιδιωτικό κήπο και αυλή.

Το πλήρες πακέτο πωλήσεων επισυνάπτεται:

• Φυλλάδιο του έργου
• Τρισδιάστατες απεικονίσεις
• Αρχιτεκτονικά σχέδια
• Τοποθεσία
• Τιμοκατάλογος
• Τεχνικές προδιαγραφές, μαζί με τις μονάδες κλιματισμού

Προμήθεια έναρξης: 7%

Για την έναρξη του {{project}}, προσφέρουμε στους συνεργαζόμενους μεσίτες αυξημένη προμήθεια 7% μέχρι την έναρξη της κατασκευής. Μετά την έναρξη της κατασκευής, η προμήθεια επιστρέφει στο συνηθισμένο 5%.

Με μόνο {{residences}} διαθέσιμες κατοικίες, σας προτείνουμε να μελετήσετε το συνημμένο υλικό και να παρουσιάσετε το έργο στους πελάτες σας από αυτό το πρώιμο στάδιο.

Ανυπομονούμε να συνεργαστούμε στο {{project}}.

Με εκτίμηση,
One Eleven$tpl$, "body_whatsapp_el" = $tpl$Γεια σας {{first_name}}, σας παρουσιάζουμε το {{project}}, το νεότερο boutique έργο μας στην τοποθεσία {{location}}, με μόνο {{residences}} κατοικίες. Προμήθεια έναρξης 7% μέχρι την έναρξη της κατασκευής. Το πακέτο πωλήσεων είναι στο email σας. One Eleven$tpl$, "to_clients" = false, "to_agents" = true, "to_subowners" = false, "updated_at" = now() WHERE "key" = 'new_project' AND "body" = $tpl$Dear {{first_name}},

We are pleased to introduce {{project}} in {{location}}.

{{details}}

{{completion}}

The full price list is here: {{price_list_url}}

One Eleven$tpl$;
