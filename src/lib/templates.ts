import "server-only";
import { asc, eq } from "drizzle-orm";
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
};

export const SYSTEM_TEMPLATES: TemplateSeed[] = [
  {
    key: "new_property",
    name: "A new apartment is released",
    description: "Sent when an apartment goes on the market. Fills in from the apartment record.",
    subject: "{{unit}} at {{project}} is now available",
    body: `Dear {{first_name}},

{{unit}} at {{project}} has just been released.

{{details}}

Price from {{price}}. {{completion}}

Tell us if you would like to see it and we will arrange a viewing.

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, {{unit}} at {{project}} is now available, {{details}}, from {{price}}. Ask us for a viewing.",
    subjectEl: "{{unit}} στο {{project}} είναι διαθέσιμο",
    bodyEl: `Αγαπητέ {{first_name}},

Το {{unit}} στο {{project}} μόλις κυκλοφόρησε.

{{details}}

Τιμή από {{price}}. {{completion}}

Πείτε μας αν θέλετε να το δείτε και κανονίζουμε επίσκεψη.

One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, το {{unit}} στο {{project}} είναι διαθέσιμο, {{details}}, από {{price}}.",
    toClients: true,
    toAgents: true,
    toSubowners: false,
  },
  {
    key: "new_project",
    name: "A new development",
    description: "Announces a whole development rather than one apartment.",
    subject: "{{project}}, our new development in {{location}}",
    body: `Dear {{first_name}},

We are pleased to introduce {{project}} in {{location}}.

{{details}}

{{completion}}

The full price list is here: {{price_list_url}}

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, our new development {{project}} in {{location}} is now open. Price list: {{price_list_url}}",
    subjectEl: "{{project}}, το νέο μας έργο στη {{location}}",
    bodyEl: `Αγαπητέ {{first_name}},

Με χαρά σας παρουσιάζουμε το {{project}} στη {{location}}.

{{details}}

{{completion}}

Ο τιμοκατάλογος: {{price_list_url}}

One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, το νέο μας έργο {{project}} στη {{location}}. Τιμοκατάλογος: {{price_list_url}}",
    toClients: true,
    toAgents: true,
    toSubowners: true,
  },
  {
    key: "price_list",
    name: "The price list",
    description: "The monthly list for agents, as a link to the live page rather than a file.",
    subject: "Price list, {{month}}",
    body: `Dear {{first_name}},

Here is our current availability: {{price_list_url}}

The page is live, so the prices you quote from it are the prices in our system on the day you look.

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, our current price list: {{price_list_url}}",
    subjectEl: "Τιμοκατάλογος, {{month}}",
    bodyEl: `Αγαπητέ {{first_name}},

Η τρέχουσα διαθεσιμότητα: {{price_list_url}}

Η σελίδα ενημερώνεται ζωντανά, οπότε οι τιμές είναι πάντα οι σημερινές.

One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, ο τιμοκατάλογός μας: {{price_list_url}}",
    toClients: false,
    toAgents: true,
    toSubowners: false,
  },
  {
    key: "construction_update",
    name: "How the building is going",
    description: "A progress note for buyers and companies, with photographs attached.",
    subject: "{{project}}, where we are",
    body: `Dear {{first_name}},

A short update on {{project}}.

{{details}}

{{completion}}

The photographs are attached.

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, an update on {{project}}: {{details}}. Photographs here: {{files_url}}",
    subjectEl: "{{project}}, πού βρισκόμαστε",
    bodyEl: `Αγαπητέ {{first_name}},

Μια σύντομη ενημέρωση για το {{project}}.

{{details}}

{{completion}}

Οι φωτογραφίες επισυνάπτονται.

One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, ενημέρωση για το {{project}}: {{details}}. Φωτογραφίες: {{files_url}}",
    toClients: true,
    toAgents: false,
    toSubowners: true,
  },
  {
    key: "projects_showcase",
    name: "Our developments, to leads",
    description:
      "The developments you choose, with every apartment still available and its price. The brochures, specifications and drawings are attached and the pictures are a click away.",
    subject: "{{project_names}}: what we have for you",
    body: `Dear {{first_name}},

Thank you for your interest in One Eleven. This is what we have available today.

{{projects}}

The brochures, the specifications and the architectural drawings are attached. The pictures are here: {{files_url}}

The price list, always up to date: {{price_list_url}}

Tell us which apartment you would like to see and we will arrange a viewing.

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, this is what we have available at {{project_names}}: {{price_list_url}} Pictures and brochures: {{files_url}}",
    subjectEl: "{{project_names}}: τι έχουμε για εσάς",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven. Αυτά είναι τα διαθέσιμα σήμερα.

{{projects}}

Επισυνάπτονται τα φυλλάδια, οι προδιαγραφές και τα αρχιτεκτονικά σχέδια. Οι φωτογραφίες είναι εδώ: {{files_url}}

Ο τιμοκατάλογος, πάντα ενημερωμένος: {{price_list_url}}

Πείτε μας ποιο διαμέρισμα θέλετε να δείτε και κανονίζουμε επίσκεψη.

One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, αυτά είναι τα διαθέσιμα στο {{project_names}}: {{price_list_url}} Φωτογραφίες και φυλλάδια: {{files_url}}",
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

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we are inviting you to see {{project}} in {{location}}. {{details}}",
    subjectEl: "Ελάτε να δείτε το {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Θα θέλαμε να σας προσκαλέσουμε στο {{project}} στη {{location}}.

{{details}}

Στον χάρτη: {{maps_url}}

Απαντήστε και κρατάμε μια ώρα για εσάς.

One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, σας προσκαλούμε στο {{project}} στη {{location}}. {{details}}",
    toClients: true,
    toAgents: true,
    toSubowners: false,
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

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we have received your reservation of {{amount}} for {{unit}} at {{project}}. Welcome.",
    subjectEl: "Καλώς ήρθατε στο {{project}}, {{first_name}}",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε την κράτηση {{amount}} για το {{unit}} στο {{project}} και το διαμέρισμα κρατείται για εσάς.

Η απόδειξή σας επισυνάπτεται.

Ακολουθεί το συμβόλαιο. Θα επικοινωνήσουμε για να κανονίσουμε την υπογραφή, και ό,τι έχετε πληρώσει αφαιρείται από την τιμή.

Καλώς ήρθατε στο {{project}}.

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

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we have received {{amount}} on signing for {{unit}} at {{project}}. Your contract is on its way by email.",
    subjectEl: "Το συμβόλαιό σας για το {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε {{amount}} με την υπογραφή του συμβολαίου σας για το {{unit}} στο {{project}}.

Επισυνάπτεται το συμβόλαιό σας μαζί με την απόδειξη της πληρωμής. Παρακαλούμε κρατήστε και τα δύο.

Οι υπόλοιπες δόσεις είναι όπως ορίζονται στο συμβόλαιο, και θα σας γράφουμε κάθε φορά που εισπράττεται μία.

One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, λάβαμε {{amount}} με την υπογραφή για το {{unit}} στο {{project}}.",
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

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we have received {{amount}} for {{unit}} at {{project}}. Balance {{outstanding}}.",
    subjectEl: "Λάβαμε την πληρωμή για το {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Λάβαμε {{amount}} για {{stage}} στο {{unit}} στο {{project}}.

Η απόδειξή σας επισυνάπτεται. Το υπόλοιπο του συμβολαίου σας είναι {{outstanding}}.

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

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, {{unit}} at {{project}} is fully paid. Congratulations, and thank you.",
    subjectEl: "Το {{unit}} στο {{project}} εξοφλήθηκε",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Με {{amount}} λάβαμε την τελευταία δόση για το {{unit}} στο {{project}}, και το συμβόλαιό σας εξοφλήθηκε.

Η απόδειξή σας επισυνάπτεται.

Συγχαρητήρια. Χαρήκαμε πολύ που σας είχαμε μαζί μας, και θα επικοινωνήσουμε για την παράδοση και τα κλειδιά.

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

Our apologies for the change. Reply to this email if the new time does not suit you.

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

Συγγνώμη για την αλλαγή. Απαντήστε αν η νέα ώρα δεν σας εξυπηρετεί.

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

Our apologies. Reply to this email and we will arrange another one whenever suits you.

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, the appointment at {{place}} on {{day}} at {{time}} is cancelled. We will arrange another.",
    subjectEl: "Το ραντεβού σας στις {{day}} ακυρώθηκε",
    bodyEl: `Αγαπητέ {{first_name}},

Το ραντεβού σας στο {{place}} στις {{day}} στις {{time}} ακυρώθηκε.

Συγγνώμη. Απαντήστε σε αυτό το email και κανονίζουμε άλλο όποτε σας εξυπηρετεί.

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

One Eleven`,
    bodyWhatsappEl:
      "Γεια σας {{first_name}}, υπενθύμιση: {{place}} αύριο, {{day}}, στις {{time}} με {{who}}.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "agent_commission",
    isAutomatic: true,
    name: "Commission generated, to the agent",
    description:
      "Goes to the agent the moment their commission comes into being, which is when the buyer has paid the opening of the contract: the reservation and the signing where there are both. It says which sale, what the commission is, and that the invoice is now due from them.",
    subject: "Your commission on {{unit}} at {{project}}",
    body: `Dear {{first_name}},

{{buyer}} has paid the signing of the contract for {{unit}} at {{project}}, and your commission on the sale has been generated.

Commission: {{amount}}
Worked out on: {{base}}

Please send us your invoice for it, and we will settle it and send you the receipt.

Thank you for the sale.

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, your commission of {{amount}} on {{unit}} at {{project}} has been generated. Please send us your invoice.",
    subjectEl: "Η προμήθειά σας για το {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Ο/Η {{buyer}} πλήρωσε την υπογραφή του συμβολαίου για το {{unit}} στο {{project}}, και η προμήθειά σας για την πώληση δημιουργήθηκε.

Προμήθεια: {{amount}}
Υπολογισμένη επί: {{base}}

Παρακαλούμε στείλτε μας το τιμολόγιό σας, και θα την εξοφλήσουμε και θα σας στείλουμε την απόδειξη.

Σας ευχαριστούμε για την πώληση.

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
      "Goes to the agent when a lead is written down with them as the agent who brought it. Once for each agent and lead. It names the person and what they are interested in, and nothing more, since the agent brought them.",
    subject: "Your potential client {{name}} is with us",
    body: `Dear {{first_name}},

Thank you. We have recorded {{name}} as a potential client you brought to us.

Interested in: {{interest}}
Looked after by: {{who}}

We will keep you up to date as things move.

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have recorded {{name}} as your potential client, interested in {{interest}}. Thank you.",
    subjectEl: "Ο πιθανός πελάτης σας {{name}} είναι μαζί μας",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε. Καταγράψαμε τον/την {{name}} ως πιθανό πελάτη που μας φέρατε.

Ενδιαφέρεται για: {{interest}}
Υπεύθυνος: {{who}}

Θα σας ενημερώνουμε για την πορεία.

One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, καταγράψαμε τον/την {{name}} ως πιθανό πελάτη σας, με ενδιαφέρον για {{interest}}. Ευχαριστούμε.",
    toClients: false,
    toAgents: true,
    toSubowners: false,
  },
  {
    key: "agent_new_client",
    isAutomatic: true,
    name: "A client, to the agent",
    description:
      "Goes to the agent when a client is recorded with them as the agent who referred them, when a lead of theirs becomes a client, or when they are named on a client later. Once for each agent and client.",
    subject: "Your client {{name}} is now a client of One Eleven",
    body: `Dear {{first_name}},

Good news: {{name}}, who came to us through you, is now recorded as a client of One Eleven.

Interested in: {{interest}}

Thank you for the referral. We will let you know about the sale and your commission as it moves.

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, {{name}}, who came through you, is now a client of One Eleven. Thank you.",
    subjectEl: "Ο πελάτης σας {{name}} είναι πλέον πελάτης της One Eleven",
    bodyEl: `Αγαπητέ {{first_name}},

Καλά νέα: ο/η {{name}}, που ήρθε σε εμάς μέσω εσάς, καταγράφηκε ως πελάτης της One Eleven.

Ενδιαφέρεται για: {{interest}}

Σας ευχαριστούμε για τη σύσταση. Θα σας ενημερώνουμε για την πώληση και την προμήθειά σας.

One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, ο/η {{name}}, που ήρθε μέσω εσάς, είναι πλέον πελάτης της One Eleven. Ευχαριστούμε.",
    toClients: false,
    toAgents: true,
    toSubowners: false,
  },
  /* -------------------------------------------------------------------------
     The Reservation and the Contract of Sale, before they are signed.

     The office presses the button for each: the draft to check, then the
     invoice to pay on the day. The signed copy then goes with the letter for
     the money, or on its own when the money was written about already.
     ------------------------------------------------------------------------- */
  {
    key: "paper_review",
    isAutomatic: true,
    name: "Reservation or contract to check",
    description:
      "Goes to the buyer when the office presses Send to check on the Reservation or the Contract of Sale, with the draft attached. Sent again each time a changed draft is sent.",
    subject: "Your {{paper}} for {{unit}} at {{project}}, to check",
    body: `Dear {{first_name}},

Attached is the {{paper}} for {{unit}} at {{project}}.

Please read it and tell us if you would like anything changed. When it is as you want it, reply to let us know and we will send you the invoice, so you have it with you when you come to sign.

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you the {{paper}} for {{unit}} at {{project}} to check. Tell us if you would like anything changed.",
    subjectEl: "Το {{paper}} σας για το {{unit}} στο {{project}}, για έλεγχο",
    bodyEl: `Αγαπητέ {{first_name}},

Επισυνάπτεται το {{paper}} για το {{unit}} στο {{project}}.

Παρακαλούμε διαβάστε το και πείτε μας αν θέλετε κάποια αλλαγή. Όταν είναι όπως το θέλετε, απαντήστε μας και θα σας στείλουμε το τιμολόγιο, ώστε να το έχετε μαζί σας όταν έρθετε να υπογράψετε.

One Eleven`,
    bodyWhatsappEl: "Γεια σας {{first_name}}, σας στείλαμε με email το {{paper}} για το {{unit}} στο {{project}} για έλεγχο.",
    toClients: true,
    toAgents: false,
    toSubowners: false,
  },
  {
    key: "paper_invoice",
    isAutomatic: true,
    name: "Invoice before signing",
    description:
      "Goes to the buyer when the office marks that they want to go ahead with the Reservation or the Contract of Sale. The invoice for the stage is issued then and attached, so they can pay it on the day they sign. The receipt follows when the money comes in.",
    subject: "Invoice {{invoice_number}} for your {{paper}}, {{unit}} at {{project}}",
    body: `Dear {{first_name}},

Thank you for confirming the {{paper}} for {{unit}} at {{project}}.

Attached is invoice {{invoice_number}} for {{stage}}, {{amount}}, to pay when you come to sign. Your receipt and the signed {{paper}} will follow once it is signed and paid.

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you invoice {{invoice_number}} of {{amount}} for {{stage}}, to pay when you come to sign the {{paper}}.",
    subjectEl: "Τιμολόγιο {{invoice_number}} για το {{paper}} σας, {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Σας ευχαριστούμε που επιβεβαιώσατε το {{paper}} για το {{unit}} στο {{project}}.

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}, για να το πληρώσετε όταν έρθετε να υπογράψετε. Η απόδειξη και το υπογεγραμμένο {{paper}} θα ακολουθήσουν μόλις υπογραφεί και πληρωθεί.

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

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you your signed {{paper}} for {{unit}} at {{project}}.",
    subjectEl: "Το υπογεγραμμένο {{paper}} σας, {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Επισυνάπτεται το υπογεγραμμένο {{paper}} σας για το {{unit}} στο {{project}}, μαζί με την απόδειξη της πληρωμής σας.

Σας ευχαριστούμε.

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
    subject: "Invoice {{invoice_number}} and your signed {{paper}}, {{unit}} at {{project}}",
    body: `Dear {{first_name}},

Attached is your signed {{paper}} for {{unit}} at {{project}}, together with invoice {{invoice_number}} for {{stage}}, {{amount}}.

Your receipt will follow as soon as the payment is received.

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you your signed {{paper}} and invoice {{invoice_number}} of {{amount}} for {{unit}} at {{project}}.",
    subjectEl: "Τιμολόγιο {{invoice_number}} και το υπογεγραμμένο {{paper}}, {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Επισυνάπτεται το υπογεγραμμένο {{paper}} για το {{unit}} στο {{project}}, μαζί με το τιμολόγιο {{invoice_number}} για {{stage}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

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

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, {{stage}} at {{project}} has been reached. We have emailed you invoice {{invoice_number}} of {{amount}}, with the architect's certificate and photographs.",
    subjectEl: "{{stage}}, {{unit}} στο {{project}}: τιμολόγιο {{invoice_number}}",
    bodyEl: `Αγαπητέ {{first_name}},

Ολοκληρώθηκε το στάδιο {{stage}} στο {{project}}, όπως δείχνουν το πιστοποιητικό του αρχιτέκτονα και οι φωτογραφίες που επισυνάπτονται.

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}} στο {{unit}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

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

One Eleven`,
    bodyWhatsapp: "Hello {{first_name}}, we have emailed you invoice {{invoice_number}} of {{amount}} for {{stage}}, {{unit}} at {{project}}.",
    subjectEl: "Τιμολόγιο {{invoice_number}} για {{stage}}, {{unit}} στο {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Επισυνάπτεται το τιμολόγιο {{invoice_number}} για {{stage}} στο {{unit}} στο {{project}}, {{amount}}.

Η απόδειξη θα ακολουθήσει μόλις εισπραχθεί η πληρωμή.

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

May the year ahead bring you health, joy and many good moments with the people you love, and in your home.

With our warmest wishes,
One Eleven

Αγαπητέ/ή {{first_name}},

Όλοι στη One Eleven σας ευχόμαστε χρόνια πολλά και ό,τι επιθυμείτε.

Να έχετε μια χρονιά γεμάτη υγεία, χαρά και όμορφες στιγμές με τους ανθρώπους σας, στο σπίτι σας.

Με τις θερμότερες ευχές,
One Eleven`,
    bodyWhatsapp: "Happy birthday, {{first_name}}. Everyone at One Eleven wishes you a wonderful year. Χρόνια πολλά!",
    subjectEl: "Χρόνια πολλά, {{first_name}}",
    bodyEl: `Αγαπητέ/ή {{first_name}},

Όλοι στη One Eleven σας ευχόμαστε χρόνια πολλά και ό,τι επιθυμείτε.

Να έχετε μια χρονιά γεμάτη υγεία, χαρά και όμορφες στιγμές με τους ανθρώπους σας, στο σπίτι σας.

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
  "paid_installment",
  "paid_final",
  "appointment_made",
  "appointment_moved",
  "appointment_cancelled",
  "appointment_reminder",
  "agent_commission",
  "agent_new_lead",
  "agent_new_client",
  "paper_review",
  "paper_invoice",
  "paper_signed",
  "stage_invoice_signed",
  "stage_invoice_works",
  "stage_invoice",
  "birthday",
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
  return keysIn(`${shipped.subject} ${shipped.body}`);
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

  return {
    unit: row.unit.code,
    project: row.project.name,
    location: row.project.location ?? "",
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

  return {
    unit: "",
    project: project.name,
    location: project.location ?? "",
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
