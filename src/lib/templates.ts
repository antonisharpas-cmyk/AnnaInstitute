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
];

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

  await db
    .insert(emailTemplates)
    .values(missing.map((template) => ({ ...template, isSystem: true })));
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
