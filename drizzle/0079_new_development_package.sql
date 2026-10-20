-- The letter introducing a new development to the agents now carries its sales package:
-- the brochure, plans and specifications attached, and the pictures, the map and the live price list as links.
-- It greets each agent by name. Each part is replaced only where it still reads as the CRM shipped it.
UPDATE "email_templates" SET "description" = $tpl$Introduces a new development to the partner agents with its sales package and the launch commission. Choose the development under What it is about: its brochure, architectural plans and technical specifications are attached, and its pictures, map and live price list go as links. Change the words that belong to one development (distance to the sea, permit, apartment mix) for each new one.$tpl$, "body" = $tpl$Dear {{first_name}},

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
One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'new_project' AND "body" = $tpl$Dear Partners,

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
One Eleven$tpl$;
--> statement-breakpoint
UPDATE "email_templates" SET "body_whatsapp" = $tpl$Hello {{first_name}}, we are excited to introduce {{project}}, our newest boutique development in {{location}}, with only {{residences}} residences. Launch commission 7% until construction starts. Brochure, plans, specifications and renders: {{files_url}} Live price list: {{price_list_url}} Location: {{maps_url}} One Eleven$tpl$, "updated_at" = now() WHERE "key" = 'new_project' AND "body_whatsapp" = $tpl$Hello {{first_name}}, we are excited to introduce {{project}}, our newest boutique development in the {{location}}, with only {{residences}} residences. Launch commission 7% until construction starts. The sales package is in your email. One Eleven$tpl$;
