import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailTemplates, projects, units } from "@/db/schema";
import { formatAmount, toCents } from "./money";

/**
 * Ready made messages.
 *
 * The office writes the same letter over and over: an apartment released, a
 * price list, a progress update. These are those letters kept once, with the
 * details filled in where the braces are. They are editable, and the ones the
 * CRM ships with cannot be deleted, only rewritten.
 */

export type TemplateSeed = {
  key: string;
  /** The CRM sends this one by itself when something happens. */
  isAutomatic?: boolean;
  name: string;
  description: string;
  subject: string;
  body: string;
  bodyWhatsapp: string;
  subjectEl: string;
  bodyEl: string;
  bodyWhatsappEl: string;
  toClients: boolean;
  toAgents: boolean;
  toSubowners: boolean;
  /** Goes to leads by default. */
  toLeads?: boolean;
  /** Goes to the buyers of what the campaign is about, each with their own apartment. */
  toBuyers?: boolean;
};

export const SYSTEM_TEMPLATES: TemplateSeed[] = [
  {
    key: "new_project",
    name: "A new development, to the agents",
    description:
      "Introduces a new development to the partner agents with its sales package and the launch commission. Choose the development under What it is about: its brochure, architectural plans and technical specifications are attached, and its pictures, map and live price list go as links. Change the words that belong to one development (distance to the sea, permit, apartment mix) for each new one.",
    subject: "Introducing {{project}} | Launch Commission 7%",
    body: `Dear {{first_name}},

We are excited to introduce {{project}}, our newest boutique development in the highly sought after {{location}}, just 500m from the sea.

The planning permit application has already been submitted, and the project is now progressing through the approval process.

With only {{residences}} exclusive residences, this is a limited collection designed for clients looking for modern architecture, quality and privacy. The development offers a carefully selected mix of 1, 2, 2+1 and 3 bedroom apartments, including a unique 2 bedroom residence with its own private garden and courtyard.

Your complete sales package:

• Project Brochure, Architectural Plans and Technical Specifications, including air conditioning units: attached
• 3D Renders and pictures: {{files_url}}
• Location: {{maps_url}}
• Live Price List: {{price_list_url}}

Launch Commission: 7%

To support the launch of {{project}}, we are offering our partner agents an enhanced 7% commission until the start of construction. After construction begins, the commission will return to the standard 5%.

With only {{residences}} residences available, we encourage you to review the sales package and introduce the project to your clients at this early stage.

We look forward to working together on {{project}}.

Kind regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we are excited to introduce {{project}}, our newest boutique development in {{location}}, with only {{residences}} residences. Launch commission 7% until construction starts. Brochure, plans, specifications and renders: {{files_url}} Live price list: {{price_list_url}} Location: {{maps_url}} One Eleven",
    subjectEl: "Σας παρουσιάζουμε το {{project}} | Προμήθεια έναρξης 7%",
    bodyEl: `Αγαπητοί Συνεργάτες,

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
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, σας παρουσιάζουμε το {{project}}, το νεότερο boutique έργο μας στην τοποθεσία {{location}}, με μόνο {{residences}} κατοικίες. Προμήθεια έναρξης 7% μέχρι την έναρξη της κατασκευής. Το πακέτο πωλήσεων είναι στο email σας. One Eleven",
    toClients: false,
    toAgents: true,
    toSubowners: false,
  },
  {
    key: "price_list",
    name: "The price list",
    description: "The monthly list for agents, as a link to the live page rather than a file.",
    subject: "Updated price list, {{month}}",
    body: `Dear Partners,

We hope this email finds you well.

We are pleased to inform you that the price list for our projects has been updated. Please find the updated price list for your reference here: {{price_list_url}}

Thank you for your continued collaboration and trust.

Kind regards,
One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, the price list for our projects has been updated. Here it is: {{price_list_url}} Thank you for your continued collaboration. One Eleven",
    subjectEl: "Ενημερωμένος τιμοκατάλογος, {{month}}",
    bodyEl: `Αγαπητοί Συνεργάτες,

Ελπίζουμε να είστε καλά.

Με χαρά σας ενημερώνουμε ότι ο τιμοκατάλογος των έργων μας ενημερώθηκε. Θα βρείτε τον ενημερωμένο τιμοκατάλογο εδώ: {{price_list_url}}

Σας ευχαριστούμε για τη συνεχή συνεργασία και την εμπιστοσύνη σας.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, ο τιμοκατάλογος των έργων μας ενημερώθηκε. Θα τον βρείτε εδώ: {{price_list_url}} Σας ευχαριστούμε για τη συνεργασία. One Eleven",
    toClients: false,
    toAgents: true,
    toSubowners: false,
  },
  {
    key: "construction_update",
    name: "Construction progress update",
    description:
      "To the buyers of a development and its companies, with the photographs of the site attached. {{project}} fills in from the development; the works in progress and the works coming are typed for each update, so change them in the campaign before sending.",
    subject: "Construction progress update | {{project}}",
    body: `Dear All,

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
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, the latest construction progress update for {{project}}: aluminium frames and the ground floor in progress, the elevator and the kitchens next. Photographs here: {{files_url}} One Eleven",
    subjectEl: "Ενημέρωση προόδου κατασκευής | {{project}}",
    bodyEl: `Αγαπητοί όλοι,

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
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, η τελευταία ενημέρωση για την κατασκευή του {{project}}: σε εξέλιξη τα αλουμίνια και το ισόγειο, ακολουθούν ο ανελκυστήρας και οι κουζίνες. Φωτογραφίες: {{files_url}} One Eleven",
    toClients: false,
    toAgents: false,
    toSubowners: true,
    toBuyers: true,
  },
  {
    key: "projects_showcase",
    name: "Our developments, to leads",
    description:
      "To leads: the price list of the developments you tick, as a live link. Their brochures, architectural drawings and technical specifications go with it as attachments, and their pictures and 3D renders by a link.",
    subject: "Price list | {{project_names}}",
    body: `Dear {{title}} {{first_name}},

Thank you for your interest in One Eleven.

You will find our price list for {{project_names}} here: {{price_list_url}}

The brochure, architectural drawings and technical specifications are attached. Pictures and 3D renders are here: {{files_url}}

Please let us know which apartments you are interested in, and we will be happy to arrange an appointment or viewing at your convenience.

Kind regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, thank you for your interest in One Eleven. Our price list for {{project_names}}: {{price_list_url}} Brochure, drawings, specifications and pictures: {{files_url}} Let us know which apartments interest you and we will be happy to arrange a viewing. One Eleven",
    subjectEl: "Τιμοκατάλογος | {{project_names}}",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven.

Θα βρείτε τον τιμοκατάλογό μας για το {{project_names}} εδώ: {{price_list_url}}

Το φυλλάδιο, τα αρχιτεκτονικά σχέδια και οι τεχνικές προδιαγραφές επισυνάπτονται. Φωτογραφίες και τρισδιάστατες απεικονίσεις θα βρείτε εδώ: {{files_url}}

Ενημερώστε μας για ποια διαμερίσματα ενδιαφέρεστε και θα χαρούμε να κανονίσουμε ένα ραντεβού ή μια επίσκεψη όποτε σας βολεύει.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven. Ο τιμοκατάλογός μας για το {{project_names}}: {{price_list_url}} Φυλλάδιο, σχέδια, προδιαγραφές και φωτογραφίες: {{files_url}} Ενημερώστε μας ποια διαμερίσματα σας ενδιαφέρουν για να κανονίσουμε επίσκεψη. One Eleven",
    toClients: false,
    toAgents: false,
    toSubowners: false,
    toLeads: true,
  },
  {
    key: "viewing_invitation",
    name: "An invitation to a viewing",
    description: "For an open day or a private viewing at a development.",
    subject: "Come and see {{project}}",
    body: `Dear {{first_name}},

We would like to invite you to {{project}} in {{location}}.

{{details}}

Find it on the map: {{maps_url}}

Reply to this message and we will keep a time for you.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we are inviting you to see {{project}} in {{location}}. {{details}}",
    subjectEl: "Ελάτε να δείτε το {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Θα θέλαμε να σας προσκαλέσουμε στο {{project}} στη {{location}}.

{{details}}

Στον χάρτη: {{maps_url}}

Απαντήστε και κρατάμε μια ώρα για εσάς.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, σας προσκαλούμε στο {{project}} στη {{location}}. {{details}}",
    toClients: true,
    toAgents: true,
    toSubowners: false,
  },

  /* -------------------------------------------------------------------------
     The three letters to the buyers as their home is finished.

     Sent to the buyers of a development or of one apartment, each letter with
     the buyer's own apartment in it. {{material_partners}} lists the Kitchens
     and Bathrooms partners from the Partners section, with their telephone
     and location, so changing a partner there changes the letter.
     ------------------------------------------------------------------------- */
  {
    key: "material_selection",
    name: "Material selection",
    description:
      "To the buyers of a development as the interior works begin: the partners they choose their kitchen, flooring and sanitary ware with, from the Partners section.",
    subject: "MATERIAL SELECTION | {{project}}",
    body: `Dear {{title}} {{first_name}},

As we approach the stage of the interior works, we are initiating the process of selecting the materials that will shape the character of your apartment.

At One Eleven we choose to collaborate with leading specialized partners. To ensure the best possible service and expert technical guidance, our team will contact you to arrange the first appointment with each partner on your behalf.

At this initial meeting, we will be present to present the main specifications and ensure that your selections align with the overall project design. Following our first joint visit, you will be able to visit our partners independently for any further details or changes you may wish to make.

Our Partners:

{{material_partners}}

Next Steps:

Within the next few days, we will call you to schedule a convenient date and time for your first appointment at the Kitchen and Flooring showrooms.

We remain at your disposal for any clarification you may need.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, the selection of materials for your apartment at {{project}} is starting. We will call you in the next few days to arrange your first appointments with our partners for the kitchen and the flooring. One Eleven",
    subjectEl: "ΕΠΙΛΟΓΗ ΥΛΙΚΩΝ | {{project}}",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Καθώς πλησιάζουμε στο στάδιο των εσωτερικών εργασιών, ξεκινάμε τη διαδικασία επιλογής των υλικών που θα διαμορφώσουν τον χαρακτήρα του διαμερίσματός σας.

Στη One Eleven επιλέγουμε να συνεργαζόμαστε με κορυφαίους εξειδικευμένους συνεργάτες. Για να σας εξασφαλίσουμε την καλύτερη δυνατή εξυπηρέτηση και εξειδικευμένη τεχνική καθοδήγηση, η ομάδα μας θα επικοινωνήσει μαζί σας για να κανονίσει εκ μέρους σας το πρώτο ραντεβού με κάθε συνεργάτη.

Στην πρώτη αυτή συνάντηση θα είμαστε παρόντες για να σας παρουσιάσουμε τις βασικές προδιαγραφές και να διασφαλίσουμε ότι οι επιλογές σας ταιριάζουν με τον συνολικό σχεδιασμό του έργου. Μετά την πρώτη κοινή μας επίσκεψη, θα μπορείτε να επισκέπτεστε τους συνεργάτες μας και μόνοι σας για οποιαδήποτε περαιτέρω λεπτομέρεια ή αλλαγή επιθυμείτε.

Οι συνεργάτες μας:

{{material_partners}}

Επόμενα βήματα:

Τις επόμενες ημέρες θα σας τηλεφωνήσουμε για να ορίσουμε μια βολική ημερομηνία και ώρα για το πρώτο σας ραντεβού στους εκθεσιακούς χώρους κουζίνας και δαπέδων.

Παραμένουμε στη διάθεσή σας για οποιαδήποτε διευκρίνιση χρειαστείτε.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, ξεκινά η επιλογή υλικών για το διαμέρισμά σας στο {{project}}. Τις επόμενες ημέρες θα σας τηλεφωνήσουμε για να κανονίσουμε τα πρώτα ραντεβού με τους συνεργάτες μας για την κουζίνα και τα δάπεδα. One Eleven",
    toClients: false,
    toAgents: false,
    toSubowners: false,
    toBuyers: true,
  },
  {
    key: "final_inspection",
    name: "Final inspection appointment",
    description:
      "To the buyer of an apartment whose works are finished: the invitation to walk through it before the key handover, with the Snagging List explained.",
    subject: "Final Inspection Appointment | {{project}} Apartment {{unit}}",
    body: `Dear {{title}} {{first_name}},

We are pleased to inform you that the works in your apartment have been completed and the property is ready for your first official visit prior to the key handover.

We would like to invite you to the Final Inspection appointment, a process designed to ensure that every detail of your new home meets the high quality standards we have set.

Who will be present:

1. A representative of One Eleven: To oversee the process and ensure all agreed specifications are met.
2. A representative of the Construction Company: For the immediate recording and coordination of any minor technical adjustments.

The Process:

We will walk through all areas of the apartment together. If any items requiring final adjustment are identified, they will be recorded on a joint Snagging List, which we will both sign. The contractor's technical team will then proceed promptly with the necessary corrections, ensuring the apartment is in impeccable condition for the final handover.

Please confirm your availability by replying to this email.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, the works in your apartment {{unit}} at {{project}} are complete and it is ready for the Final Inspection before the key handover. Please reply with the days and times that suit you. One Eleven",
    subjectEl: "Ραντεβού Τελικής Επιθεώρησης | {{project}} Διαμέρισμα {{unit}}",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Με χαρά σας ενημερώνουμε ότι οι εργασίες στο διαμέρισμά σας ολοκληρώθηκαν και το ακίνητο είναι έτοιμο για την πρώτη επίσημη επίσκεψή σας πριν από την παράδοση των κλειδιών.

Θα θέλαμε να σας προσκαλέσουμε στο ραντεβού Τελικής Επιθεώρησης, μια διαδικασία που διασφαλίζει ότι κάθε λεπτομέρεια του νέου σας σπιτιού ανταποκρίνεται στα υψηλά πρότυπα ποιότητας που έχουμε θέσει.

Ποιοι θα είναι παρόντες:

1. Εκπρόσωπος της One Eleven: Για να επιβλέπει τη διαδικασία και να διασφαλίσει ότι τηρούνται όλες οι συμφωνημένες προδιαγραφές.
2. Εκπρόσωπος της Κατασκευαστικής Εταιρείας: Για την άμεση καταγραφή και τον συντονισμό τυχόν μικρών τεχνικών διορθώσεων.

Η διαδικασία:

Θα περάσουμε μαζί από όλους τους χώρους του διαμερίσματος. Αν εντοπιστούν σημεία που χρειάζονται τελική διόρθωση, θα καταγραφούν σε κοινή Λίστα Παρατηρήσεων, την οποία θα υπογράψουμε από κοινού. Η τεχνική ομάδα του εργολάβου θα προχωρήσει άμεσα στις απαραίτητες διορθώσεις, ώστε το διαμέρισμα να είναι σε άψογη κατάσταση για την τελική παράδοση.

Παρακαλούμε επιβεβαιώστε τη διαθεσιμότητά σας απαντώντας σε αυτό το email.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, οι εργασίες στο διαμέρισμά σας {{unit}} στο {{project}} ολοκληρώθηκαν και είναι έτοιμο για την Τελική Επιθεώρηση πριν από την παράδοση των κλειδιών. Απαντήστε μας με τις ημέρες και ώρες που σας εξυπηρετούν. One Eleven",
    toClients: false,
    toAgents: false,
    toSubowners: false,
    toBuyers: true,
  },
  {
    key: "key_handover",
    name: "Key handover",
    description:
      "To the buyer once the Snagging List is done: the invitation to the key handover, what they receive, the utilities to transfer and the Google review.",
    subject: "Congratulations! Key Handover & Welcome to Your New Home | {{project}}",
    body: `Dear {{title}} {{first_name}},

We are delighted to inform you that all final works and adjustments recorded during our inspection have been successfully completed. Your apartment is now ready to welcome you!

We invite you at the property for the official key handover. Please let us know your availability to arrange the appointment.

What you will receive at the handover:

1. Your Home Keys: The full set of keys for the main entrance, your apartment, and the common areas.
2. Warranties & Manuals: All manufacturer warranties for appliances and systems (e.g., solar water heater, air conditioning, security door).
3. Contact List: The phone numbers of our partners for the technical support (after sales service) we provide.

Final Pending Matters:

Please ensure that the utility transfer procedures (Electricity/Water) have been completed in your name, so that your home is fully operational from your very first day of move in.

On behalf of One Eleven, we would like to thank you once again for the trust you have shown us over this journey. It has been our honor to bring your vision of a new home to life.

We wish you every happiness in your new residence!

If you are satisfied with your experience so far, we would greatly appreciate it if you could take a moment to share your feedback with us through a Google review. Your opinion is truly valuable and helps us continue to improve our services.
https://share.google/fht7QRfYaGgnATSNa

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Congratulations {{first_name}}! Your apartment {{unit}} at {{project}} is ready for the key handover. Please let us know your availability to arrange the appointment. One Eleven",
    subjectEl: "Συγχαρητήρια! Παράδοση Κλειδιών & Καλώς Ήρθατε στο Νέο σας Σπίτι | {{project}}",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Με μεγάλη χαρά σας ενημερώνουμε ότι όλες οι τελικές εργασίες και διορθώσεις που καταγράφηκαν κατά την επιθεώρηση ολοκληρώθηκαν με επιτυχία. Το διαμέρισμά σας είναι πλέον έτοιμο να σας υποδεχτεί!

Σας προσκαλούμε στο ακίνητο για την επίσημη παράδοση των κλειδιών. Παρακαλούμε ενημερώστε μας για τη διαθεσιμότητά σας ώστε να κανονίσουμε το ραντεβού.

Τι θα παραλάβετε κατά την παράδοση:

1. Τα κλειδιά του σπιτιού σας: Το πλήρες σετ κλειδιών για την κεντρική είσοδο, το διαμέρισμά σας και τους κοινόχρηστους χώρους.
2. Εγγυήσεις & Εγχειρίδια: Όλες τις εγγυήσεις των κατασκευαστών για τις συσκευές και τα συστήματα (π.χ. ηλιακό θερμοσίφωνα, κλιματισμό, πόρτα ασφαλείας).
3. Κατάλογος Επαφών: Τα τηλέφωνα των συνεργατών μας για την τεχνική υποστήριξη (εξυπηρέτηση μετά την πώληση) που παρέχουμε.

Τελευταίες εκκρεμότητες:

Παρακαλούμε βεβαιωθείτε ότι οι διαδικασίες μεταφοράς των λογαριασμών (Ρεύμα/Νερό) στο όνομά σας έχουν ολοκληρωθεί, ώστε το σπίτι σας να λειτουργεί πλήρως από την πρώτη κιόλας ημέρα της μετακόμισης.

Εκ μέρους της One Eleven, σας ευχαριστούμε ξανά για την εμπιστοσύνη που μας δείξατε σε όλη αυτή τη διαδρομή. Ήταν τιμή μας να κάνουμε πραγματικότητα το όραμά σας για ένα νέο σπίτι.

Σας ευχόμαστε κάθε ευτυχία στη νέα σας κατοικία!

Αν είστε ικανοποιημένοι από την εμπειρία σας μέχρι τώρα, θα το εκτιμούσαμε ιδιαίτερα αν αφιερώνατε λίγο χρόνο για να μοιραστείτε τη γνώμη σας μαζί μας με μια αξιολόγηση στο Google. Η γνώμη σας είναι πολύτιμη και μας βοηθά να βελτιώνουμε συνεχώς τις υπηρεσίες μας.
https://share.google/fht7QRfYaGgnATSNa

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Συγχαρητήρια {{first_name}}! Το διαμέρισμά σας {{unit}} στο {{project}} είναι έτοιμο για την παράδοση των κλειδιών. Ενημερώστε μας για τη διαθεσιμότητά σας ώστε να κανονίσουμε το ραντεβού. One Eleven",
    toClients: false,
    toAgents: false,
    toSubowners: false,
    toBuyers: true,
  },

  /* -------------------------------------------------------------------------
     The four letters the CRM sends by itself.

     They follow the money on a contract: the reservation, the signing, every
     payment after that, and the last one. Each carries what the buyer needs to
     keep, which is the receipt for their money and, on the signing, the
     contract itself. The office can rewrite every word of them and switch any
     of them off, but the keys in braces are filled in by the CRM and have to
     stay where they are, because a letter that says "Dear" with nothing after
     it is worse than no letter.
     ------------------------------------------------------------------------- */
  {
    key: "paid_reservation",
    isAutomatic: true,
    name: "Reservation received",
    description:
      "Goes to the buyer the moment the reservation is receipted, with the receipt filed against that payment attached. This is the first letter they get from us, so it is the welcome as well.",
    subject: "Welcome to {{project}}, {{first_name}}",
    body: `Dear {{first_name}},

Thank you. We have received your reservation of {{amount}} for {{unit}} at {{project}}, and the apartment is now held for you.

Your receipt is attached.

What happens next is the contract. We will be in touch to arrange the signing, and everything you have paid is set against the price.

Welcome to {{project}}.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we have received your reservation of {{amount}} for {{unit}} at {{project}}. Welcome.",
    subjectEl: "Καλώς ήρθατε στο {{project}}, {{first_name}}",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε την κράτηση {{amount}} για το {{unit}} στο {{project}} και το διαμέρισμα κρατείται για εσάς.

Η απόδειξή σας επισυνάπτεται.

Ακολουθεί το συμβόλαιο. Θα επικοινωνήσουμε για να κανονίσουμε την υπογραφή, και ό,τι έχετε πληρώσει αφαιρείται από την τιμή.

Καλώς ήρθατε στο {{project}}.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, λάβαμε την κράτηση {{amount}} για το {{unit}} στο {{project}}. Καλώς ήρθατε.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "paid_signing",
    isAutomatic: true,
    name: "Contract signed and paid",
    description:
      "Goes when the signing installment is receipted, and it carries the contract itself. If the contract has not been filed against the record yet, the letter waits and goes the moment somebody attaches it.",
    subject: "Your contract for {{unit}} at {{project}}",
    body: `Dear {{first_name}},

Thank you. We have received {{amount}} on the signing of your contract for {{unit}} at {{project}}.

Your contract is attached, together with the receipt for this payment. Please keep them both.

The remaining installments are as set out in the contract, and we will write to you each time one is received.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we have received {{amount}} on signing for {{unit}} at {{project}}. Your contract is on its way by email.",
    subjectEl: "Το συμβόλαιό σας για το {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε {{amount}} με την υπογραφή του συμβολαίου σας για το {{unit}} στο {{project}}.

Επισυνάπτεται το συμβόλαιό σας μαζί με την απόδειξη της πληρωμής. Παρακαλούμε κρατήστε και τα δύο.

Οι υπόλοιπες δόσεις είναι όπως ορίζονται στο συμβόλαιο, και θα σας γράφουμε κάθε φορά που εισπράττεται μία.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, λάβαμε {{amount}} με την υπογραφή για το {{unit}} στο {{project}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    /*
     * The welcome once the sale is real: the Contract of Sale signed and the
     * receipt for the signing installment sent. It goes once a contract, by
     * itself, the moment the second of the two happens.
     */
    key: "welcome_contract",
    isAutomatic: true,
    name: "Welcome after the Contract of Sale",
    description:
      "Goes to the buyer once, by itself, when the Contract of Sale is signed and the receipt for the signing installment has been sent, whichever of the two happens last. {{constructor}} is the contractor of the development, from Constructors.",
    subject: "Welcome to {{project}} | The Official Start of Our Collaboration",
    body: `Dear {{title}} {{first_name}},

It is with great pleasure that we welcome you to the One Eleven family. The signing of the contracts for your apartment in {{project}} marks the beginning of the journey leading to the delivery of the keys to your new home.

As the Developer of the project, our responsibility is the strategic planning, strict quality supervision, and ensuring that our vision is fully realized. For the construction of the project, we have chosen to collaborate with the experienced contracting company {{constructor}}, which carries out the works under our continuous guidance and supervision.

Thank you for choosing us for this important investment. We are by your side to make this process as smooth, transparent, and enjoyable as possible.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Welcome to the One Eleven family, {{first_name}}! The signing of the contracts for your apartment in {{project}} is the start of the journey to the keys of your new home. One Eleven",
    subjectEl: "Καλώς ήρθατε στο {{project}} | Η Επίσημη Αρχή της Συνεργασίας μας",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Με ιδιαίτερη χαρά σας καλωσορίζουμε στην οικογένεια της One Eleven. Η υπογραφή των συμβολαίων για το διαμέρισμά σας στο {{project}} σηματοδοτεί την αρχή της διαδρομής που οδηγεί στην παράδοση των κλειδιών του νέου σας σπιτιού.

Ως Developer του έργου, έχουμε την ευθύνη του στρατηγικού σχεδιασμού, της αυστηρής εποπτείας της ποιότητας και της πλήρους υλοποίησης του οράματός μας. Για την κατασκευή του έργου επιλέξαμε να συνεργαστούμε με την έμπειρη κατασκευαστική εταιρεία {{constructor}}, η οποία εκτελεί τις εργασίες υπό τη συνεχή μας καθοδήγηση και επίβλεψη.

Σας ευχαριστούμε που μας επιλέξατε για αυτή τη σημαντική επένδυση. Είμαστε δίπλα σας για να κάνουμε αυτή τη διαδικασία όσο το δυνατόν πιο ομαλή, διαφανή και ευχάριστη.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Καλώς ήρθατε στην οικογένεια της One Eleven, {{first_name}}! Η υπογραφή των συμβολαίων για το διαμέρισμά σας στο {{project}} είναι η αρχή της διαδρομής προς τα κλειδιά του νέου σας σπιτιού. One Eleven",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "paid_installment",
    isAutomatic: true,
    name: "An installment received",
    description:
      "Goes for every payment after the signing, with the receipt filed against it attached. It says what was paid, what it was for, and what is left.",
    subject: "Payment received for {{unit}} at {{project}}",
    body: `Dear {{first_name}},

Thank you. We have received {{amount}} for {{stage}} on {{unit}} at {{project}}.

Your receipt is attached. The balance on your contract is now {{outstanding}}.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we have received {{amount}} for {{unit}} at {{project}}. Balance {{outstanding}}.",
    subjectEl: "Λάβαμε την πληρωμή για το {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε {{amount}} για {{stage}} στο {{unit}} στο {{project}}.

Η απόδειξή σας επισυνάπτεται. Το υπόλοιπο του συμβολαίου σας είναι {{outstanding}}.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, λάβαμε {{amount}} για το {{unit}} στο {{project}}. Υπόλοιπο {{outstanding}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "paid_final",
    isAutomatic: true,
    name: "Paid in full",
    description:
      "Goes instead of the ordinary payment letter when the last installment is received and nothing is left owing. Congratulations rather than a statement.",
    subject: "{{unit}} at {{project}} is fully paid",
    body: `Dear {{first_name}},

Thank you. With {{amount}} we have received the last installment for {{unit}} at {{project}}, and your contract is paid in full.

Your receipt is attached.

Congratulations. It has been a pleasure to have you with us, and we will be in touch about the handover and the keys.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, {{unit}} at {{project}} is fully paid. Congratulations, and thank you.",
    subjectEl: "Το {{unit}} στο {{project}} εξοφλήθηκε",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Με {{amount}} λάβαμε την τελευταία δόση για το {{unit}} στο {{project}}, και το συμβόλαιό σας εξοφλήθηκε.

Η απόδειξή σας επισυνάπτεται.

Συγχαρητήρια. Χαρήκαμε πολύ που σας είχαμε μαζί μας, και θα επικοινωνήσουμε για την παράδοση και τα κλειδιά.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, το {{unit}} στο {{project}} εξοφλήθηκε. Συγχαρητήρια.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },

  /* -------------------------------------------------------------------------
     And the three that follow an appointment.

     A meeting somebody has agreed to is a promise on both sides, so the CRM
     writes it down for the buyer as well: where, when, what it is about and who
     they are meeting. If it moves they are told it moved, and if it is called
     off they are told that too, because the worst version of this is a buyer
     standing outside a showroom.
     ------------------------------------------------------------------------- */
  {
    key: "appointment_made",
    isAutomatic: true,
    name: "An appointment is arranged",
    description:
      "Goes the moment an appointment is written down, to the client or the lead it is with. It says where, when, what it is about and who from the office they are meeting.",
    subject: "Your appointment on {{day}} at {{time}}",
    body: `Dear {{first_name}},

This is to confirm your appointment.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

If the day or the time does not suit you, reply to this email and we will move it.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, confirming {{place}} on {{day}} at {{time}} with {{who}}.",
    subjectEl: "Το ραντεβού σας στις {{day}} στις {{time}}",
    bodyEl: `Αγαπητέ {{first_name}},

Επιβεβαιώνουμε το ραντεβού σας.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Αν η ημέρα ή η ώρα δεν σας εξυπηρετεί, απαντήστε σε αυτό το email και το μετακινούμε.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, επιβεβαιώνουμε {{place}} στις {{day}} στις {{time}} με {{who}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "appointment_moved",
    isAutomatic: true,
    name: "An appointment is moved",
    description:
      "Goes when the day, the time, the place, the kind or the person is changed on an appointment that has already been confirmed. It carries the new details, not the old ones.",
    subject: "Your appointment has moved to {{day}} at {{time}}",
    body: `Dear {{first_name}},

Your appointment has been changed. These are the new details.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

Reply to this email if the new time does not suit you.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, your appointment has moved: {{place}} on {{day}} at {{time}} with {{who}}.",
    subjectEl: "Το ραντεβού σας μετακινήθηκε στις {{day}} στις {{time}}",
    bodyEl: `Αγαπητέ {{first_name}},

Το ραντεβού σας άλλαξε. Αυτά είναι τα νέα στοιχεία.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Απαντήστε αν η νέα ώρα δεν σας εξυπηρετεί.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, το ραντεβού μετακινήθηκε: {{place}} στις {{day}} στις {{time}} με {{who}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "appointment_cancelled",
    isAutomatic: true,
    name: "An appointment is cancelled",
    description:
      "Goes when an appointment is cancelled, so nobody is left waiting somewhere for a meeting that is not happening.",
    subject: "Your appointment on {{day}} is cancelled",
    body: `Dear {{first_name}},

Your appointment at {{place}} on {{day}} at {{time}} has been cancelled.

Reply to this email and we will arrange another one whenever suits you.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, the appointment at {{place}} on {{day}} at {{time}} is cancelled. We will arrange another.",
    subjectEl: "Το ραντεβού σας στις {{day}} ακυρώθηκε",
    bodyEl: `Αγαπητέ {{first_name}},

Το ραντεβού σας στο {{place}} στις {{day}} στις {{time}} ακυρώθηκε.

Απαντήστε σε αυτό το email και κανονίζουμε άλλο όποτε σας εξυπηρετεί.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, το ραντεβού στο {{place}} στις {{day}} ακυρώθηκε.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "appointment_reminder",
    isAutomatic: true,
    name: "A reminder the day before",
    description:
      "Goes the day before every appointment that is still pending, once, in the morning at the hour set in Settings. An appointment made the afternoon before does not get one as well, because the confirmation it has just had says the same thing.",
    subject: "A reminder: your appointment tomorrow at {{time}}",
    body: `Dear {{first_name}},

A reminder of your appointment tomorrow.

Where: {{place}}
What it is about: {{kind}}
Day: {{day}}
Time: {{time}}
You will be meeting: {{who}}

If something has come up, reply to this email and we will find another time.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, a reminder: {{place}} tomorrow, {{day}}, at {{time}} with {{who}}.",
    subjectEl: "Υπενθύμιση: το ραντεβού σας αύριο στις {{time}}",
    bodyEl: `Αγαπητέ {{first_name}},

Σας υπενθυμίζουμε το αυριανό σας ραντεβού.

Πού: {{place}}
Θέμα: {{kind}}
Ημέρα: {{day}}
Ώρα: {{time}}
Θα σας δει: {{who}}

Αν προέκυψε κάτι, απαντήστε σε αυτό το email και βρίσκουμε άλλη ώρα.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, υπενθύμιση: {{place}} αύριο, {{day}}, στις {{time}} με {{who}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    /*
     * The invoice of a stage went to the buyer and ten days later the stage is
     * still not paid: one kind reminder, with the invoice attached again.
     */
    key: "invoice_reminder",
    isAutomatic: true,
    name: "A reminder for an unpaid invoice",
    description:
      "Goes to the buyer once, by itself, ten days after the invoice of a stage was sent, if that stage is still not paid in full. The invoice is attached again. Invoices sent before this letter existed are not chased.",
    subject: "Kind reminder: invoice {{invoice_number}}",
    body: `Dear {{title}} {{first_name}},

May this email find you well.

Take this email as a kind reminder for the outstanding invoice {{invoice_number}}. We kindly ask you to proceed with the related payment.

Thank you in advance for your cooperation.

Kind regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, a kind reminder for the outstanding invoice {{invoice_number}}. We kindly ask you to proceed with the related payment. Thank you. One Eleven",
    subjectEl: "Υπενθύμιση: τιμολόγιο {{invoice_number}}",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Ελπίζουμε να είστε καλά.

Με το παρόν email σας υπενθυμίζουμε ευγενικά το ανεξόφλητο τιμολόγιο {{invoice_number}}. Παρακαλούμε όπως προχωρήσετε με τη σχετική πληρωμή.

Σας ευχαριστούμε εκ των προτέρων για τη συνεργασία σας.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, μια ευγενική υπενθύμιση για το ανεξόφλητο τιμολόγιο {{invoice_number}}. Παρακαλούμε προχωρήστε με τη σχετική πληρωμή. Ευχαριστούμε. One Eleven",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    /* Sent by a person, with the button on the lead's page, never by itself. */
    key: "lead_reminder",
    isAutomatic: true,
    name: "A reminder to a lead",
    description:
      "Goes when you press Send a reminder on a lead's page, to follow up on what we sent them. It never goes by itself. Each one is written in the lead's history.",
    subject: "Following up on your enquiry",
    body: `Dear {{title}} {{first_name}},

May this email find you well.

We just wanted to follow up and ask if you had the opportunity to review the information we sent you.

Please feel free to contact us if you have any questions or require any further clarification. We remain at your disposal and will be happy to assist you.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we just wanted to follow up and ask if you had the opportunity to review the information we sent you. We remain at your disposal for any questions. One Eleven",
    subjectEl: "Σχετικά με το ενδιαφέρον σας",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Ελπίζουμε να είστε καλά.

Θα θέλαμε να επικοινωνήσουμε ξανά μαζί σας και να ρωτήσουμε αν είχατε την ευκαιρία να δείτε τις πληροφορίες που σας στείλαμε.

Μη διστάσετε να επικοινωνήσετε μαζί μας για οποιαδήποτε απορία ή διευκρίνιση. Παραμένουμε στη διάθεσή σας και θα χαρούμε να σας βοηθήσουμε.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, θα θέλαμε να ρωτήσουμε αν είχατε την ευκαιρία να δείτε τις πληροφορίες που σας στείλαμε. Παραμένουμε στη διάθεσή σας. One Eleven",
    toClients: false,
    toAgents: false,
    toSubowners: false,
    toLeads: true,
  },
  {
    key: "agent_commission",
    isAutomatic: true,
    name: "Commission generated, to the agent",
    description:
      "Goes to the agent the moment their commission comes into being, which is when the buyer has paid the opening of the contract: the reservation and the signing where there are both. It says which sale, what the commission is, and that the invoice is now due from them, made out to the company that holds the development ({{company}}).",
    subject: "Your commission on {{unit}} at {{project}}",
    body: `Dear {{first_name}},

{{buyer}} has paid the signing of the contract for {{unit}} at {{project}}, and your commission on the sale has been generated.

Commission: {{amount}}
Worked out on: {{base}}

Please send us the invoice for it and we will proceed with the payment accordingly.

Please issue the invoice under the company name: {{company}}

Thank you for the sale.

Kind Regards,
One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, your commission of {{amount}} on {{unit}} at {{project}} has been generated. Please send us your invoice.",
    subjectEl: "Η προμήθειά σας για το {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Ο/Η {{buyer}} πλήρωσε την υπογραφή του συμβολαίου για το {{unit}} στο {{project}}, και η προμήθειά σας για την πώληση δημιουργήθηκε.

Προμήθεια: {{amount}}
Υπολογισμένη επί: {{base}}

Παρακαλούμε στείλτε μας το τιμολόγιο και θα προχωρήσουμε με την πληρωμή αναλόγως.

Παρακαλούμε εκδώστε το τιμολόγιο στο όνομα της εταιρείας: {{company}}

Σας ευχαριστούμε για την πώληση.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, η προμήθειά σας {{amount}} για το {{unit}} στο {{project}} δημιουργήθηκε. Στείλτε μας το τιμολόγιο.",
    toClients: false,
    toAgents: true,
    toSubowners: false,
  },
  {
    key: "agent_new_lead",
    isAutomatic: true,
    name: "A potential client, to the agent",
    description:
      "Goes to the agent when a lead is written down with them as the agent who brought it. Once for each agent and lead. It confirms the registration of their client, named in the subject, and asks nothing of them.",
    subject: "Your potential client {{name}} is with us",
    body: `Dear {{title}} {{first_name}},

This is to confirm that your client's registration has been received and successfully recorded on our end.

Thank you for the submission, no further action is needed at this time. If you have any questions, feel free to reach out.

Kind regards,
One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, your client {{name}} has been registered with us. Thank you for the submission, no further action is needed at this time.",
    subjectEl: "Ο πιθανός πελάτης σας {{name}} είναι μαζί μας",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Σας επιβεβαιώνουμε ότι η εγγραφή του πελάτη σας παραλήφθηκε και καταχωρήθηκε επιτυχώς από εμάς.

Σας ευχαριστούμε για την υποβολή, δεν απαιτείται καμία περαιτέρω ενέργεια αυτή τη στιγμή. Αν έχετε οποιαδήποτε απορία, μη διστάσετε να επικοινωνήσετε μαζί μας.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, ο πελάτης σας {{name}} καταχωρήθηκε. Σας ευχαριστούμε για την υποβολή, δεν απαιτείται καμία περαιτέρω ενέργεια.",
    toClients: false,
    toAgents: true,
    toSubowners: false,
  },
  /* -------------------------------------------------------------------------
     The Reservation and the Contract of Sale, before they are signed.

     The office presses the button for each: the agreed paper goes with the
     invoice to pay on the day. The signed copy then goes with the letter for
     the money, or on its own when the money was written about already.
     ------------------------------------------------------------------------- */
  {
    key: "paper_invoice",
    isAutomatic: true,
    name: "The agreed paper, with its invoice",
    description:
      "Goes to the buyer when the office presses Send on the agreed Reservation or Contract of Sale, before it is signed. The agreed paper and the invoice for its stage are attached, so they can pay it on the day they sign. The receipt follows with the signed copy when the money comes in.",
    subject: "Your {{paper}} and invoice {{invoice_number}}, apartment {{unit}} at {{project}}",
    body: `Dear {{first_name}},

Attached is the {{paper}} for {{unit}} at {{project}}, as agreed, together with invoice {{invoice_number}} for {{stage}}, {{amount}}, to pay when you come to sign.

Your receipt and the signed {{paper}} will follow once it is signed and paid.

Kind Regards,
One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you invoice {{invoice_number}} of {{amount}} for {{stage}}, to pay when you come to sign the {{paper}}.",
    subjectEl: "Το {{paper}} σας και το τιμολόγιο {{invoice_number}}, διαμέρισμα {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Επισυνάπτεται το {{paper}} για το {{unit}} στο {{project}}, όπως συμφωνήθηκε, μαζί με το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}, για να το πληρώσετε όταν έρθετε να υπογράψετε.

Η απόδειξη και το υπογεγραμμένο {{paper}} θα ακολουθήσουν μόλις υπογραφεί και πληρωθεί.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, σας στείλαμε με email το τιμολόγιο {{invoice_number}} των {{amount}} για {{stage}}, για να το πληρώσετε όταν έρθετε να υπογράψετε.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "paper_signed",
    isAutomatic: true,
    name: "The signed copy",
    description:
      "Goes to the buyer with their signed Reservation or Contract of Sale when it is uploaded after the letter for the money already went. When the signed copy is there first, it goes with that letter instead and this one is not needed.",
    subject: "Your signed {{paper}}, {{unit}} at {{project}}",
    body: `Dear {{first_name}},

Attached is your signed {{paper}} for {{unit}} at {{project}}, with the receipt for your payment.

Thank you.

Kind Regards,
One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you your signed {{paper}} for {{unit}} at {{project}}.",
    subjectEl: "Το υπογεγραμμένο {{paper}} σας, {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Επισυνάπτεται το υπογεγραμμένο {{paper}} σας για το {{unit}} στο {{project}}, μαζί με την απόδειξη της πληρωμής σας.

Σας ευχαριστούμε.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, σας στείλαμε με email το υπογεγραμμένο {{paper}} σας για το {{unit}} στο {{project}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  /* -------------------------------------------------------------------------
     The invoice of each stage, sent before the money, with what proves it.

     The Reservation and the Contract of Sale go with the signed paper; a stage
     of the building, the structure, the brickwork, the tiling, the aluminium,
     with the architect's certificate and photographs; any other stage with the
     invoice alone. The receipt follows by itself when the money is recorded.
     ------------------------------------------------------------------------- */
  {
    key: "stage_invoice_signed",
    isAutomatic: true,
    name: "Invoice with the signed Reservation or Contract of Sale",
    description:
      "Goes to the buyer when the office presses Send the invoice with the signed copy, on the Reservation or the Contract of Sale. It carries the invoice for the stage and the signed paper. The receipt follows by itself when the money is recorded.",
    subject: "Your signed {{paper}} and invoice {{invoice_number}}, apartment {{unit}} at {{project}}",
    body: `Dear {{first_name}},

Attached is your signed {{paper}} for {{unit}} at {{project}}, together with invoice {{invoice_number}} for {{stage}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

Kind Regards,
One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you your signed {{paper}} and invoice {{invoice_number}} of {{amount}} for {{unit}} at {{project}}.",
    subjectEl: "Το υπογεγραμμένο {{paper}} σας και το τιμολόγιο {{invoice_number}}, διαμέρισμα {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Επισυνάπτεται το υπογεγραμμένο {{paper}} για το {{unit}} στο {{project}}, μαζί με το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, σας στείλαμε με email το υπογεγραμμένο {{paper}} και το τιμολόγιο {{invoice_number}} των {{amount}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "stage_invoice_works",
    isAutomatic: true,
    name: "Invoice for a stage of the building",
    description:
      "Goes to the buyer when the office presses Send the invoice on the structure, the brickwork, the tiling or the aluminium, once the architect's certificate and the photographs are uploaded. It carries the invoice, the certificate and the photographs. The receipt follows by itself when the money is recorded.",
    subject: "{{stage}}, {{unit}} at {{project}}: invoice {{invoice_number}}",
    body: `Dear {{first_name}},

{{stage}} at {{project}} has been reached, as the architect's certificate and the photographs attached show.

Attached is invoice {{invoice_number}} for {{stage}} on {{unit}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

Kind Regards,
One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, {{stage}} at {{project}} has been reached. We have emailed you invoice {{invoice_number}} of {{amount}}, with the architect's certificate and photographs.",
    subjectEl: "{{stage}}, {{unit}} στο {{project}}: τιμολόγιο {{invoice_number}}",
    bodyEl: `Αγαπητέ {{first_name}},

Ολοκληρώθηκε το στάδιο {{stage}} στο {{project}}, όπως δείχνουν το πιστοποιητικό του αρχιτέκτονα και οι φωτογραφίες που επισυνάπτονται.

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}} στο {{unit}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, ολοκληρώθηκε το στάδιο {{stage}} στο {{project}}. Σας στείλαμε το τιμολόγιο {{invoice_number}} των {{amount}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "stage_invoice",
    isAutomatic: true,
    name: "Invoice for a stage",
    description:
      "Goes to the buyer when the office presses Send the invoice on any other stage, the completion of the property say. It carries the invoice alone. The receipt follows by itself when the money is recorded.",
    subject: "Invoice {{invoice_number}} for {{stage}}, {{unit}} at {{project}}",
    body: `Dear {{first_name}},

Attached is invoice {{invoice_number}} for {{stage}} on {{unit}} at {{project}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

Kind Regards,
One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you invoice {{invoice_number}} of {{amount}} for {{stage}}, {{unit}} at {{project}}.",
    subjectEl: "Τιμολόγιο {{invoice_number}} για {{stage}}, {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}} στο {{unit}} στο {{project}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

Με εκτίμηση,
One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, σας στείλαμε με email το τιμολόγιο {{invoice_number}} των {{amount}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "birthday",
    isAutomatic: true,
    name: "Birthday wishes",
    description:
      "Goes in the morning of each client's birthday, once a year, to the client and, when the apartment is in two names, to the second buyer on their own birthday. It goes to every client with a birthday and an email address, whether or not they agreed to marketing, because it is a greeting and sells nothing. The English is followed by the Greek in the same email.",
    subject: "Happy birthday, {{first_name}} | Χρόνια πολλά",
    body: `Dear {{first_name}},

Everyone at One Eleven wishes you a very happy birthday.

May the year ahead bring you health, joy and many good moments with the people you love.

With our warmest wishes,
One Eleven

Αγαπητέ/ή {{first_name}},

Όλοι στη One Eleven σας ευχόμαστε χρόνια πολλά και ό,τι επιθυμείτε.

Να έχετε μια χρονιά γεμάτη υγεία, χαρά και όμορφες στιγμές με τους ανθρώπους σας.

Με τις θερμότερες ευχές,
One Eleven`,
    bodyWhatsapp: "Happy birthday, {{first_name}}. Everyone at One Eleven wishes you a wonderful year. Χρόνια πολλά!",
    subjectEl: "Χρόνια πολλά, {{first_name}}",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Όλοι στη One Eleven σας ευχόμαστε χρόνια πολλά και ό,τι επιθυμείτε.

Να έχετε μια χρονιά γεμάτη υγεία, χαρά και όμορφες στιγμές με τους ανθρώπους σας.

Με τις θερμότερες ευχές,
One Eleven`,
    bodyWhatsappEl: "Χρόνια πολλά, {{first_name}}! Όλοι στη One Eleven σας ευχόμαστε μια υπέροχη χρονιά.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
];

/** The letters the CRM sends by itself, in the order things happen. */
export const AUTOMATIC_KEYS = [
  "paid_reservation",
  "paid_signing",
  "welcome_contract",
  "paid_installment",
  "paid_final",
  "appointment_made",
  "appointment_moved",
  "appointment_cancelled",
  "appointment_reminder",
  "agent_commission",
  "agent_new_lead",
  "paper_invoice",
  "paper_signed",
  "stage_invoice_signed",
  "stage_invoice_works",
  "stage_invoice",
  "invoice_reminder",
  "birthday",
  "lead_reminder",
] as const;

export type AutomaticKey = (typeof AUTOMATIC_KEYS)[number];

/**
 * The keys a letter must keep.
 *
 * Taken from the letter the CRM ships rather than from a list written out
 * again, so the two can never disagree. The office can rewrite every word
 * around them, in either language, but a key that is deleted takes a fact out
 * of the letter, and the save says so rather than sending "Dear ," to a buyer.
 */
export function keysIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))];
}

export function requiredKeys(key: string): string[] {
  const shipped = SYSTEM_TEMPLATES.find((one) => one.key === key);
  if (!shipped) return [];
  /* The title and the contractor can be left out: the letter reads well without them. */
  return keysIn(`${shipped.subject} ${shipped.body}`).filter((one) => one !== "title" && one !== "constructor");
}

/**
 * The shipped templates, created once.
 *
 * Called when the templates are read rather than at seed time, so a database
 * that was set up before these existed still has them the first time somebody
 * opens the section.
 */
export async function ensureSystemTemplates() {
  const existing = await db.select({ key: emailTemplates.key }).from(emailTemplates);
  const have = new Set(existing.map((row) => row.key));

  const missing = SYSTEM_TEMPLATES.filter((template) => !have.has(template.key));
  if (missing.length === 0) return;

  await db.insert(emailTemplates).values(
    missing.map((template) => ({
      ...template,
      isSystem: true,
      isAutomatic: Boolean(template.isAutomatic),
    })),
  );
}

/**
 * The templates a campaign can start from.
 *
 * Only the campaign ones. The automatic emails live on their own page and go
 * by themselves when the money or an appointment calls for them, so offering
 * "Reservation received" as the start of a campaign only made it look as if
 * the same letter existed twice.
 */
export async function listTemplates() {
  await ensureSystemTemplates();
  return db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.isAutomatic, false))
    .orderBy(asc(emailTemplates.name));
}

export async function templateByKey(key: string) {
  await ensureSystemTemplates();
  const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).limit(1);
  return rows[0] ?? null;
}

/**
 * What a template knows about the thing it is announcing.
 *
 * An apartment fills in its own code, its development, its size and its price.
 * A development fills in its name, its location and when it is due. Everything
 * else is left as it was typed.
 */
export async function detailsForUnit(unitId: string, locale: string) {
  const rows = await db
    .select({ unit: units, project: projects })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(units.id, unitId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const bits = [
    row.unit.bedrooms
      ? `${row.unit.bedrooms} ${row.unit.bedrooms === 1 ? "bedroom" : "bedrooms"}`
      : null,
    row.unit.coveredArea ? `${Number(row.unit.coveredArea)} m2 covered` : null,
    row.unit.verandaArea ? `${Number(row.unit.verandaArea)} m2 veranda` : null,
    row.unit.parkingSpaces > 0
      ? `${row.unit.parkingSpaces} parking ${row.unit.parkingSpaces === 1 ? "space" : "spaces"}`
      : null,
    row.unit.floor ? `floor ${row.unit.floor}` : null,
  ].filter(Boolean);

  const [counted] = await db.select({ n: sql<number>`count(*)::int` }).from(units).where(eq(units.projectId, row.project.id));
  return {
    unit: row.unit.code,
    project: row.project.name,
    location: row.project.location ?? "",
    residences: String(counted?.n ?? 0),
    details: bits.join(", "),
    price: formatAmount(toCents(row.unit.netPrice), locale),
    completion: row.project.completionBy ? `Ready ${row.project.completionBy}.` : "",
    month: new Date().toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
      month: "long",
      year: "numeric",
    }),
    /* Only when the development has its Google Maps link, so a message that
       asks for it without one is caught as unfilled rather than sent blank. */
    ...(row.project.mapsUrl ? { maps_url: row.project.mapsUrl } : {}),
  };
}

export async function detailsForProject(projectId: string, locale: string) {
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = rows[0];
  if (!project) return null;

  const [counted] = await db.select({ n: sql<number>`count(*)::int` }).from(units).where(eq(units.projectId, projectId));
  return {
    unit: "",
    project: project.name,
    location: project.location ?? "",
    /* How many apartments the development has, for "only 7 residences". */
    residences: String(counted?.n ?? 0),
    details: project.description ?? "",
    price: "",
    completion: project.completionBy ? `Ready ${project.completionBy}.` : "",
    month: new Date().toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
      month: "long",
      year: "numeric",
    }),
    ...(project.mapsUrl ? { maps_url: project.mapsUrl } : {}),
  };
}
