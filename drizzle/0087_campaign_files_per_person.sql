-- Each person a campaign goes to gets a files link of their own, so the office can see who opened it.
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "recipient_key" text;
--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "recipient_name" text;
--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "client_id" text;
--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "agent_id" text;
--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "subowner_id" text;
--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "lead_id" text;
--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "first_opened_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "last_opened_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN IF NOT EXISTS "open_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_links" ADD CONSTRAINT "share_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_links" ADD CONSTRAINT "share_links_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_links" ADD CONSTRAINT "share_links_subowner_id_subowners_id_fk" FOREIGN KEY ("subowner_id") REFERENCES "public"."subowners"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "share_links" ADD CONSTRAINT "share_links_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "share_links_campaign_recipient_idx" ON "share_links" USING btree ("campaign_id","recipient_key");
--> statement-breakpoint
-- The campaign letters no longer say the files are attached: they are all behind the files link,
-- with a folder for each development. Each part is replaced only where it still reads as the CRM shipped it.
UPDATE "email_templates" SET "description" = $tpl$Introduces a new development to the partner agents with its sales package and the launch commission. Choose the development under What it is about: its brochure, architectural plans, technical specifications and renders, its map and its live price list all go as links. Change the words that belong to one development (distance to the sea, permit, apartment mix) for each new one.$tpl$, "updated_at" = now() WHERE "key" = 'new_project' AND "description" = $tpl$Introduces a new development to the partner agents with its sales package and the launch commission. Choose the development under What it is about: its brochure, architectural plans and technical specifications are attached, and its pictures, map and live price list go as links. Change the words that belong to one development (distance to the sea, permit, apartment mix) for each new one.$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

We are excited to introduce {{project}}, our newest boutique development in the highly sought after {{location}}, just 500m from the sea.

The planning permit application has already been submitted, and the project is now progressing through the approval process.

With only {{residences}} exclusive residences, this is a limited collection designed for clients looking for modern architecture, quality and privacy. The development offers a carefully selected mix of 1, 2, 2+1 and 3 bedroom apartments, including a unique 2 bedroom residence with its own private garden and courtyard.

Your complete sales package:

• Project Brochure, Architectural Plans, Technical Specifications, including air conditioning units, and 3D Renders: {{files_url}}
• Location: {{maps_url}}
• Live Price List: {{price_list_url}}

Launch Commission: 7%

To support the launch of {{project}}, we are offering our partner agents an enhanced 7% commission until the start of construction. After construction begins, the commission will return to the standard 5%.

With only {{residences}} residences available, we encourage you to review the sales package and introduce the project to your clients at this early stage.

We look forward to working together on {{project}}.

Kind regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'new_project' AND "body" = $tpl$Dear {{first_name}},

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
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "description" = $tpl$To the buyers of a development and its companies, with the photographs of the site by a link. {{project}} fills in from the development; the works in progress and the works coming are typed for each update, so change them in the campaign before sending.$tpl$, "updated_at" = now() WHERE "key" = 'construction_update' AND "description" = $tpl$To the buyers of a development and its companies, with the photographs of the site attached. {{project}} fills in from the development; the works in progress and the works coming are typed for each update, so change them in the campaign before sending.$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear All,

We are pleased to share the latest construction progress update for {{project}}, along with photographs illustrating the current stage of the works.

Works Currently in Progress:
Aluminium frame installation.
Ground floor works, including the finishing of the ground floor verandas.

Upcoming Works:
Elevator installation.
Kitchen installation, as the project progresses towards the completion of the internal finishes.

You will find the latest photographs from the construction site, showcasing the progress achieved to date, here: {{files_url}}

The One Eleven supervision team continues to monitor the project on a daily basis, ensuring that the works are carried out in accordance with the agreed quality specifications.

Should you require any further information, please do not hesitate to contact us.

Kind Regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'construction_update' AND "body" = $tpl$Dear All,

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
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητοί όλοι,

Με χαρά σας στέλνουμε την τελευταία ενημέρωση για την πρόοδο της κατασκευής του {{project}}, μαζί με φωτογραφίες που δείχνουν το τρέχον στάδιο των εργασιών.

Εργασίες σε εξέλιξη:
Τοποθέτηση των αλουμινίων.
Εργασίες στο ισόγειο, μαζί με το φινίρισμα των βεραντών του ισογείου.

Επόμενες εργασίες:
Τοποθέτηση του ανελκυστήρα.
Τοποθέτηση των κουζινών, καθώς το έργο προχωρά προς την ολοκλήρωση των εσωτερικών τελειωμάτων.

Τις πιο πρόσφατες φωτογραφίες από το εργοτάξιο, που δείχνουν την πρόοδο μέχρι σήμερα, θα βρείτε εδώ: {{files_url}}

Η ομάδα επίβλεψης της One Eleven συνεχίζει να παρακολουθεί το έργο καθημερινά, ώστε οι εργασίες να γίνονται σύμφωνα με τις συμφωνημένες προδιαγραφές ποιότητας.

Για οποιαδήποτε περαιτέρω πληροφορία, μη διστάσετε να επικοινωνήσετε μαζί μας.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'construction_update' AND "body_el" = $tpl$Αγαπητοί όλοι,

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
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "description" = $tpl$To leads: the price list of the developments you tick, as a live link. Their brochures, architectural drawings, technical specifications and 3D renders go by one link, with a folder for each development.$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase' AND "description" = $tpl$To leads: the price list of the developments you tick, as a live link. Their brochures, architectural drawings and technical specifications go with it as attachments, and their pictures and 3D renders by a link.$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{title}} {{first_name}},

Thank you for your interest in One Eleven.

You will find our price list for {{project_names}} here: {{price_list_url}}

The brochure, architectural drawings, technical specifications and 3D renders are here, with a folder for each development: {{files_url}}

Please let us know which apartments you are interested in, and we will be happy to arrange an appointment or viewing at your convenience.

Kind regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase' AND "body" = $tpl$Dear {{title}} {{first_name}},

Thank you for your interest in One Eleven.

You will find our price list for {{project_names}} here: {{price_list_url}}

The brochure, architectural drawings and technical specifications are attached. Pictures and 3D renders are here: {{files_url}}

Please let us know which apartments you are interested in, and we will be happy to arrange an appointment or viewing at your convenience.

Kind regards,
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_el" = $tpl$Αγαπητέ/ή {{first_name}},

Σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven.

Θα βρείτε τον τιμοκατάλογό μας για το {{project_names}} εδώ: {{price_list_url}}

Το φυλλάδιο, τα αρχιτεκτονικά σχέδια, οι τεχνικές προδιαγραφές και οι τρισδιάστατες απεικονίσεις βρίσκονται εδώ, με έναν φάκελο για κάθε έργο: {{files_url}}

Ενημερώστε μας για ποια διαμερίσματα ενδιαφέρεστε και θα χαρούμε να κανονίσουμε ένα ραντεβού ή μια επίσκεψη όποτε σας βολεύει.

Με εκτίμηση,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase' AND "body_el" = $tpl$Αγαπητέ/ή {{first_name}},

Σας ευχαριστούμε για το ενδιαφέρον σας στη One Eleven.

Θα βρείτε τον τιμοκατάλογό μας για το {{project_names}} εδώ: {{price_list_url}}

Το φυλλάδιο, τα αρχιτεκτονικά σχέδια και οι τεχνικές προδιαγραφές επισυνάπτονται. Φωτογραφίες και τρισδιάστατες απεικονίσεις θα βρείτε εδώ: {{files_url}}

Ενημερώστε μας για ποια διαμερίσματα ενδιαφέρεστε και θα χαρούμε να κανονίσουμε ένα ραντεβού ή μια επίσκεψη όποτε σας βολεύει.

Με εκτίμηση,
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "description" = $tpl$To agents: the price list of the developments you tick, as a live link, to pass on to their clients. Their brochures, architectural drawings, technical specifications and 3D renders go by one link, with a folder for each development.$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase_agents' AND "description" = $tpl$To agents: the price list of the developments you tick, as a live link, to pass on to their clients. Their brochures, architectural drawings and technical specifications go with it as attachments, and their pictures and 3D renders by a link.$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body" = $tpl$Dear {{first_name}},

Please find below the latest information on {{project_names}}, to share with your clients.

You will find our live price list here: {{price_list_url}}

The brochure, architectural drawings, technical specifications and 3D renders are here, with a folder for each development: {{files_url}}

Should any of your clients be interested, we will be happy to arrange a viewing at your convenience.

Kind regards,
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'projects_showcase_agents' AND "body" = $tpl$Dear {{first_name}},

Please find below the latest information on {{project_names}}, to share with your clients.

You will find our live price list here: {{price_list_url}}

The brochure, architectural drawings and technical specifications are attached. Pictures and 3D renders are here: {{files_url}}

Should any of your clients be interested, we will be happy to arrange a viewing at your convenience.

Kind regards,
One Eleven$tpl$;
