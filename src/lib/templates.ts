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
    description: "A progress note for buyers and partners, with photographs attached.",
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
    key: "viewing_invitation",
    name: "An invitation to a viewing",
    description: "For an open day or a private viewing at a development.",
    subject: "Come and see {{project}}",
    body: `Dear {{first_name}},

We would like to invite you to {{project}} in {{location}}.

{{details}}

Reply to this message and we will keep a time for you.

One Eleven`,
    bodyWhatsapp:
      "Hello {{first_name}}, we are inviting you to see {{project}} in {{location}}. {{details}}",
    subjectEl: "Ελάτε να δείτε το {{project}}",
    bodyEl: `Αγαπητέ {{first_name}},

Θα θέλαμε να σας προσκαλέσουμε στο {{project}} στη {{location}}.

{{details}}

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
      "Goes the moment an appointment is written down, to the client or the enquiry it is with. It says where, when, what it is about and who from the office they are meeting.",
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

export async function listTemplates() {
  await ensureSystemTemplates();
  return db.select().from(emailTemplates).orderBy(asc(emailTemplates.name));
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
  };
}
