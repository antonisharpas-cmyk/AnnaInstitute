"use client";

import { useState } from "react";
import AboutPicker from "@/components/AboutPicker";
import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import { campaignWays } from "@/lib/agentWay";

export type TemplateChoice = {
  key: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  bodyWhatsapp: string;
  toClients: boolean;
  toAgents: boolean;
  toSubowners: boolean;
  toLeads?: boolean;
  toBuyers?: boolean;
};

export type GroupCounts = { clients: number; agents: number; subowners: number; leads?: number };

/** A buyer, with the developments and apartments they hold as "project:<id>" and "unit:<id>". */
export type BuyerChoice = {
  id: string;
  label: string;
  hint: string;
  about: string[];
  email?: boolean;
  phone?: boolean;
  textChannel?: string;
};

/** One person who can be in a campaign: whether they have an email and a mobile, and how they take texts. */
export type Reach = {
  group: string;
  id: string;
  email: boolean;
  phone: boolean;
  textChannel?: string;
  agentChannel?: string;
};

/**
 * Writing a campaign.
 *
 * Three things are chosen here and none of them is assumed: who it goes to,
 * how it is sent, and what it says. Email and SMS are ticked independently,
 * and each has its own box, because an email with a subject and four paragraphs
 * is not what anybody wants to read on their phone. Picking a ready made message
 * fills the boxes in, and everything stays editable afterwards.
 */
export default function CampaignForm({
  action,
  templates,
  chosenTemplate,
  counts,
  agentWays = { email: 0, whatsapp: 0, both: 0 },
  groups,
  priceLists,
  about = [],
  aboutDefault = [],
  leadChoices = [],
  projectChoices = [],
  projectsDefault = [],
  leadsDefault = [],
  buyerChoices = [],
  agentChoices = [],
  reach: everyone = [],
  clientChoices = [],
  subownerChoices = [],
  labels,
}: {
  /** Every client with consent, to tick one by one. */
  clientChoices?: { id: string; label: string; hint: string }[];
  /** Every active partner company, to tick one by one. */
  subownerChoices?: { id: string; label: string; hint: string }[];
  /** Everybody in the clients, agents, partners and leads lists, for "who gets it and how". */
  reach?: Reach[];
  /** Every active agent, to tick one by one, with the way each wants campaigns: EMAIL, WHATSAPP or BOTH. */
  agentChoices?: { id: string; label: string; hint: string; channel: string }[];
  /** Every buyer, to tick one by one; the list follows what the campaign is about. */
  buyerChoices?: BuyerChoice[];
  /** Leads already chosen, when the campaign was started from one. */
  leadsDefault?: string[];
  /** Every open lead, to tick one by one. */
  leadChoices?: { id: string; label: string; hint: string }[];
  /** Every development, for a campaign that shows some of them. */
  projectChoices?: { id: string; name: string }[];
  projectsDefault?: string[];
  /** The developments and apartments a campaign can be about, as "project:<id>" and "unit:<id>". */
  about?: { value: string; label: string; group: string }[];
  aboutDefault?: string[];
  action: (formData: FormData) => void | Promise<void>;
  templates: TemplateChoice[];
  chosenTemplate?: string;
  counts: GroupCounts;
  /** How many agents want campaigns by email, by WhatsApp, or both ways. */
  agentWays?: { email: number; whatsapp: number; both: number };
  groups: { clients: boolean; agents: boolean; subowners: boolean; leads?: boolean; buyers?: boolean };
  priceLists: { id: string; label: string }[];
  labels: Record<string, string>;
}) {
  const picked = templates.find((template) => template.key === chosenTemplate);

  const [templateKey, setTemplateKey] = useState(picked?.key ?? "");
  const [subject, setSubject] = useState(picked?.subject ?? "");
  const [body, setBody] = useState(picked?.body ?? "");
  const [whatsapp, setWhatsapp] = useState(picked?.bodyWhatsapp ?? "");

  const [toClients, setToClients] = useState(picked ? picked.toClients : groups.clients);
  const [toAgents, setToAgents] = useState(picked ? picked.toAgents : groups.agents);
  const [toSubowners, setToSubowners] = useState(picked ? picked.toSubowners : groups.subowners);
  const [toLeads, setToLeads] = useState(picked ? Boolean(picked.toLeads) : Boolean(groups.leads));
  const [leadMode, setLeadMode] = useState<"all" | "chosen">(leadsDefault.length > 0 ? "chosen" : "all");
  const [clientMode, setClientMode] = useState<"all" | "chosen">("all");
  const [chosenClients, setChosenClients] = useState<string[]>([]);
  const [subownerMode, setSubownerMode] = useState<"all" | "chosen">("all");
  const [chosenSubowners, setChosenSubowners] = useState<string[]>([]);
  const [chosenLeads, setChosenLeads] = useState<string[]>(leadsDefault);
  const [leadTerm, setLeadTerm] = useState("");
  const [shownProjects, setShownProjects] = useState<string[]>(projectsDefault);
  const [toBuyers, setToBuyers] = useState(picked ? Boolean(picked.toBuyers) : Boolean(groups.buyers));
  const [buyerMode, setBuyerMode] = useState<"all" | "chosen">("all");
  const [chosenBuyers, setChosenBuyers] = useState<string[]>([]);
  const [buyerTerm, setBuyerTerm] = useState("");

  const [viaEmail, setViaEmail] = useState(true);
  const [viaWhatsapp, setViaWhatsapp] = useState(Boolean(picked?.bodyWhatsapp));
  const [bothVia, setBothVia] = useState<"EMAIL" | "SMS" | "BOTH">("EMAIL");
  const [agentMode, setAgentMode] = useState<"all" | "chosen">("all");
  const [chosenAgents, setChosenAgents] = useState<string[]>([]);
  const [agentTerm, setAgentTerm] = useState("");
  const [aboutValues, setAboutValues] = useState<string[]>(aboutDefault);

  /*
   * The agents this campaign goes to, every one or the ones ticked, and how
   * each wants it. An agent always hears the way they chose, so a way nobody
   * else gets this time still needs its message, for them.
   */
  const agentsInPlay =
    agentChoices.length > 0
      ? agentMode === "chosen" && chosenAgents.length > 0
        ? agentChoices.filter((one) => chosenAgents.includes(one.id))
        : agentChoices
      : null;
  const ways = agentsInPlay
    ? {
        email: agentsInPlay.filter((one) => one.channel !== "SMS" && one.channel !== "WHATSAPP" && one.channel !== "BOTH").length,
        whatsapp: agentsInPlay.filter((one) => one.channel === "SMS" || one.channel === "WHATSAPP").length,
        both: agentsInPlay.filter((one) => one.channel === "BOTH").length,
      }
    : agentWays;
  const agentsNeedEmail = toAgents && (ways.email > 0 || (ways.both > 0 && bothVia !== "SMS"));
  const agentsNeedWhatsapp = toAgents && (ways.whatsapp > 0 || (ways.both > 0 && bothVia !== "EMAIL"));
  /*
   * A campaign to the agents alone needs no "how it goes out": each agent
   * already said how, and the office only chooses for the agents who take
   * either way. The ways then follow the agents.
   */
  const onlyAgents = toAgents && !toClients && !toSubowners && !toLeads && !toBuyers;
  const sendEmail = onlyAgents ? agentsNeedEmail : viaEmail;
  const sendWhatsapp = onlyAgents ? agentsNeedWhatsapp : viaWhatsapp;
  const showEmail = sendEmail || agentsNeedEmail;
  const showWhatsapp = sendWhatsapp || agentsNeedWhatsapp;
  const agentWords = agentTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const agentsShown = agentChoices.filter((one) =>
    agentWords.every((word) => `${one.label} ${one.hint}`.toLowerCase().includes(word)),
  );

  /*
   * The placeholders that need the development or the apartment. Said on the
   * form, before saving, rather than found in a client's inbox.
   */
  const words = `${showEmail ? `${subject} ${body}` : ""} ${showWhatsapp ? whatsapp : ""}`;
  const needsProject = /\{\{\s*(project|location|details|completion|residences)\s*\}\}/i.test(words);
  const needsUnit = /\{\{\s*(unit|price)\s*\}\}/i.test(words);
  /* A letter to the buyers takes each buyer's own apartment and development. */
  const ownPlaces = toBuyers && !toClients && !toAgents && !toSubowners && !toLeads;
  const aboutWarning = ownPlaces
    ? ""
    : needsUnit && !aboutValues.some((one) => one.startsWith("unit:"))
      ? labels.aboutNeedsUnit
      : needsProject && aboutValues.length === 0
        ? labels.aboutNeedsProject
        : "";

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const template = templates.find((t) => t.key === key);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.body);
    setWhatsapp(template.bodyWhatsapp);
    setToClients(template.toClients);
    setToAgents(template.toAgents);
    setToSubowners(template.toSubowners);
    setToLeads(Boolean(template.toLeads));
    setToBuyers(Boolean(template.toBuyers));
  };

  /* A message that shows developments needs at least one ticked. */
  const showsProjects = /\{\{\s*(projects|project_names)\s*\}\}/i.test(words);
  const leadWords = leadTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const leadsShown = leadChoices.filter((one) =>
    leadWords.every((word) => `${one.label} ${one.hint}`.toLowerCase().includes(word)),
  );
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((one) => one !== id);

  /* The buyers of what the campaign is about: all of them when it is about nothing yet. */
  const buyersInScope = buyerChoices.filter(
    (one) => aboutValues.length === 0 || one.about.some((value) => aboutValues.includes(value)),
  );
  const buyerWords = buyerTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const buyersShown = buyersInScope.filter((one) =>
    buyerWords.every((word) => `${one.label} ${one.hint}`.toLowerCase().includes(word)),
  );
  const buyersReach =
    buyerMode === "chosen" && chosenBuyers.length > 0
      ? buyersInScope.filter((one) => chosenBuyers.includes(one.id)).length
      : buyersInScope.length;

  const reach =
    (toBuyers ? buyersReach : 0) +
    (toClients ? (clientMode === "chosen" && chosenClients.length > 0 ? chosenClients.length : counts.clients) : 0) +
    (toAgents ? (agentsInPlay ? agentsInPlay.length : counts.agents) : 0) +
    (toSubowners ? (subownerMode === "chosen" && chosenSubowners.length > 0 ? chosenSubowners.length : counts.subowners) : 0) +
    (toLeads ? (leadMode === "chosen" && chosenLeads.length > 0 ? chosenLeads.length : (counts.leads ?? 0)) : 0);

  /*
   * Who gets it, and how: worked out live from what is ticked, group by
   * group, with the same rule the sending uses. An agent their own way; a
   * client, buyer or lead by email and by SMS, unless set to no texts.
   */
  const way = { viaEmail: sendEmail, viaWhatsapp: sendWhatsapp, agentsBothVia: bothVia, subject, bodyWhatsapp: whatsapp };
  const tally = (people: Reach[]) => {
    const row = { people: people.length, email: 0, sms: 0, whatsapp: 0, none: 0 };
    for (const person of people) {
      const ways = campaignWays(person, way);
      const byEmail = ways.includes("EMAIL") && person.email;
      const bySms = ways.includes("SMS") && person.phone;
      const byWhatsapp = ways.includes("WHATSAPP") && person.phone;
      if (byEmail) row.email += 1;
      if (bySms) row.sms += 1;
      if (byWhatsapp) row.whatsapp += 1;
      if (!byEmail && !bySms && !byWhatsapp) row.none += 1;
    }
    return row;
  };
  const inGroup = (group: string) => everyone.filter((one) => one.group === group);
  const buyersPicked =
    buyerMode === "chosen" && chosenBuyers.length > 0
      ? buyersInScope.filter((one) => chosenBuyers.includes(one.id))
      : buyersInScope;
  const buyerIds = new Set(toBuyers ? buyersPicked.map((one) => one.id) : []);
  const clientsPicked = inGroup("CLIENTS").filter(
    (one) => clientMode !== "chosen" || chosenClients.length === 0 || chosenClients.includes(one.id),
  );
  const summary = everyone.length
    ? [
        toClients
          ? {
              key: "clients",
              name: labels.groupClients,
              /* A client who is also a buyer gets the buyer's letter instead. */
              ...tally(clientsPicked.filter((one) => !buyerIds.has(one.id))),
              alsoBuyers: clientsPicked.filter((one) => buyerIds.has(one.id)).length,
            }
          : null,
        toBuyers
          ? {
              key: "buyers",
              name: labels.groupBuyers,
              ...tally(
                buyersPicked.map((one) => ({
                  group: "BUYERS",
                  id: one.id,
                  email: Boolean(one.email),
                  phone: Boolean(one.phone),
                  textChannel: one.textChannel,
                })),
              ),
            }
          : null,
        toAgents
          ? {
              key: "agents",
              name: labels.groupAgents,
              ...tally(
                inGroup("AGENTS").filter((one) => !agentsInPlay || agentsInPlay.some((chosen) => chosen.id === one.id)),
              ),
            }
          : null,
        toSubowners
          ? {
              key: "subowners",
              name: labels.groupSubowners,
              ...tally(
                inGroup("SUBOWNERS").filter(
                  (one) => subownerMode !== "chosen" || chosenSubowners.length === 0 || chosenSubowners.includes(one.id),
                ),
              ),
            }
          : null,
        toLeads
          ? {
              key: "leads",
              name: labels.groupLeads,
              ...tally(
                inGroup("LEADS").filter(
                  (one) => leadMode !== "chosen" || chosenLeads.length === 0 || chosenLeads.includes(one.id),
                ),
              ),
            }
          : null,
      ].filter((one): one is NonNullable<typeof one> => one !== null)
    : [];
  const total = summary.reduce(
    (sum, row) => ({
      people: sum.people + row.people,
      email: sum.email + row.email,
      sms: sum.sms + row.sms,
      whatsapp: sum.whatsapp + row.whatsapp,
      none: sum.none + row.none,
    }),
    { people: 0, email: 0, sms: 0, whatsapp: 0, none: 0 },
  );

  /* One group, as a tile: tick, name, how many, and in one line who they are. */
  const groupTile = (
    name: string,
    checked: boolean,
    onChange: (on: boolean) => void,
    title: string,
    count: number,
    hint: string,
  ) => (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm ${
        checked ? "border-brand-teal bg-brand-surface" : "border-brand-line"
      }`}
      data-group-tile={name}
    >
      <input type="checkbox" name={name} checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" />
      <span>
        <span className="font-semibold">{title}</span> <span className="text-brand-graphite/60">({count})</span>
        <span className="mt-0.5 block text-xs text-brand-graphite/60">{hint}</span>
      </span>
    </label>
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="templateKey" value={templateKey} />

      {templates.length > 0 ? (
        <div>
          <label className="label" htmlFor="template">
            {labels.template}
          </label>
          <select
            id="template"
            value={templateKey}
            onChange={(event) => applyTemplate(event.target.value)}
            className="select"
          >
            <option value="">{labels.noTemplate}</option>
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brand-graphite/60">
            {templates.find((t) => t.key === templateKey)?.description ?? labels.templateNote}
          </p>
        </div>
      ) : null}

      {about.length > 0 ? (
        <div>
          <p className="label">{labels.about}</p>
          <AboutPicker
            choices={about}
            chosen={aboutValues}
            onChange={setAboutValues}
            labels={{ search: labels.aboutSearch, nothing: labels.aboutNothing, remove: labels.aboutRemove }}
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.aboutNote}</p>
          {aboutWarning ? (
            <p className="mt-1 text-xs font-semibold text-[color:var(--color-negative)]" data-about-warning>
              {aboutWarning}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="title">
          {labels.title}
        </label>
        <input
          id="title"
          name="title"
          required
          placeholder={labels.titlePlaceholder}
          className="input"
        />
        <p className="mt-1 text-xs text-brand-graphite/60">{labels.titleNote}</p>
      </div>

      <fieldset className="rounded border border-brand-line p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
          {labels.whoGetsIt}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groupTile("toClients", toClients, setToClients, labels.groupClients, counts.clients, labels.groupClientsHint)}
          {groupTile("toBuyers", toBuyers, setToBuyers, labels.groupBuyers, buyersInScope.length, labels.groupBuyersHint)}
          {groupTile("toLeads", toLeads, setToLeads, labels.groupLeads, counts.leads ?? 0, labels.groupLeadsHint)}
          {groupTile("toAgents", toAgents, setToAgents, labels.groupAgents, counts.agents, labels.groupAgentsHint)}
          {groupTile("toSubowners", toSubowners, setToSubowners, labels.groupSubowners, counts.subowners, labels.groupSubownersHint)}
        </div>

        {/* Every client with consent, or only the ones ticked here. */}
        {toClients ? (
          <ChoosePeople
            name="client"
            mode={clientMode}
            setMode={setClientMode}
            chosen={chosenClients}
            setChosen={setChosenClients}
            choices={clientChoices}
            labels={{ all: `${labels.clientsAll} (${clientChoices.length})`, chosen: labels.clientsChosen, picked: labels.leadsPicked, search: labels.leadsSearch }}
          />
        ) : null}

        {/* Every company, or only the ones ticked here. */}
        {toSubowners ? (
          <ChoosePeople
            name="subowner"
            mode={subownerMode}
            setMode={setSubownerMode}
            chosen={chosenSubowners}
            setChosen={setChosenSubowners}
            choices={subownerChoices}
            labels={{ all: `${labels.subownersAll} (${subownerChoices.length})`, chosen: labels.subownersChosen, picked: labels.leadsPicked, search: labels.subownersSearch }}
          />
        ) : null}

        {/* The buyers of what the campaign is about, every one or only the ones ticked. */}
        {toBuyers ? (
          <div className="mt-3 rounded border border-brand-line bg-brand-surface p-3" data-buyer-picker>
            <p className="mb-2 text-xs text-brand-graphite/70">{labels.buyersNote}</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="buyerMode" value="all" checked={buyerMode === "all"} onChange={() => setBuyerMode("all")} />
                {labels.buyersAll} ({buyersInScope.length})
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="buyerMode"
                  value="chosen"
                  checked={buyerMode === "chosen"}
                  onChange={() => setBuyerMode("chosen")}
                />
                {labels.buyersChosen}
                {buyerMode === "chosen" ? (
                  <span className="text-xs text-brand-graphite/60">
                    ({buyersReach} {labels.leadsPicked})
                  </span>
                ) : null}
              </label>
            </div>
            {buyersInScope.length === 0 ? (
              <p className="mt-2 text-xs font-semibold text-[color:var(--color-negative)]">{labels.buyersNone}</p>
            ) : null}
            {buyerMode === "chosen" ? (
              <>
                <input
                  value={buyerTerm}
                  onChange={(event) => setBuyerTerm(event.target.value)}
                  placeholder={labels.leadsSearch}
                  className="input mt-2"
                  data-buyer-search
                />
                <ul className="mt-2 max-h-56 overflow-y-auto rounded border border-brand-line bg-white text-sm">
                  {buyersShown.map((one) => (
                    <li key={one.id} className="border-b border-brand-line last:border-0">
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={chosenBuyers.includes(one.id)}
                          onChange={(event) => setChosenBuyers(toggle(chosenBuyers, one.id, event.target.checked))}
                          data-buyer={one.label}
                        />
                        <span className="font-medium">{one.label}</span>
                        <span className="text-xs text-brand-graphite/60">{one.hint}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {chosenBuyers
                  .filter((id) => buyersInScope.some((one) => one.id === id))
                  .map((id) => (
                    <input key={id} type="hidden" name="buyerIds" value={id} />
                  ))}
              </>
            ) : null}
          </div>
        ) : null}

        {/* Every active agent, or only the ones ticked here. */}
        {toAgents && agentChoices.length > 0 ? (
          <div className="mt-3 rounded border border-brand-line bg-brand-surface p-3" data-agent-picker>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="agentMode" value="all" checked={agentMode === "all"} onChange={() => setAgentMode("all")} />
                {labels.agentsAll} ({agentChoices.length})
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="agentMode"
                  value="chosen"
                  checked={agentMode === "chosen"}
                  onChange={() => setAgentMode("chosen")}
                />
                {labels.agentsChosen}
                {agentMode === "chosen" ? (
                  <span className="text-xs text-brand-graphite/60">
                    ({chosenAgents.length} {labels.leadsPicked})
                  </span>
                ) : null}
              </label>
            </div>
            {agentMode === "chosen" ? (
              <>
                <input
                  value={agentTerm}
                  onChange={(event) => setAgentTerm(event.target.value)}
                  placeholder={labels.leadsSearch}
                  className="input mt-2"
                  data-agent-search
                />
                <ul className="mt-2 max-h-56 overflow-y-auto rounded border border-brand-line bg-white text-sm">
                  {agentsShown.map((one) => (
                    <li key={one.id} className="border-b border-brand-line last:border-0">
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={chosenAgents.includes(one.id)}
                          onChange={(event) => setChosenAgents(toggle(chosenAgents, one.id, event.target.checked))}
                          data-agent={one.label}
                        />
                        <span className="font-medium">{one.label}</span>
                        <span className="text-xs text-brand-graphite/60">{one.hint}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {/* Ticked ones stay chosen while the search hides them. */}
                {chosenAgents.map((id) => (
                  <input key={id} type="hidden" name="agentIds" value={id} />
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        {/* Every enquiry, or only the ones ticked here. */}
        {toLeads ? (
          <div className="mt-3 rounded border border-brand-line bg-brand-surface p-3" data-lead-picker>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="leadMode"
                  value="all"
                  checked={leadMode === "all"}
                  onChange={() => setLeadMode("all")}
                />
                {labels.leadsAll}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="leadMode"
                  value="chosen"
                  checked={leadMode === "chosen"}
                  onChange={() => setLeadMode("chosen")}
                />
                {labels.leadsChosen}
                {leadMode === "chosen" ? (
                  <span className="text-xs text-brand-graphite/60">
                    ({chosenLeads.length} {labels.leadsPicked})
                  </span>
                ) : null}
              </label>
            </div>
            {leadMode === "chosen" ? (
              <>
                <input
                  value={leadTerm}
                  onChange={(event) => setLeadTerm(event.target.value)}
                  placeholder={labels.leadsSearch}
                  className="input mt-2"
                  data-lead-search
                />
                <ul className="mt-2 max-h-56 overflow-y-auto rounded border border-brand-line bg-white text-sm">
                  {leadsShown.map((one) => (
                    <li key={one.id} className="border-b border-brand-line last:border-0">
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={chosenLeads.includes(one.id)}
                          onChange={(event) => setChosenLeads(toggle(chosenLeads, one.id, event.target.checked))}
                          data-lead={one.label}
                        />
                        <span className="font-medium">{one.label}</span>
                        <span className="text-xs text-brand-graphite/60">{one.hint}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {/* Ticked ones stay chosen while the search hides them. */}
                {chosenLeads.map((id) => (
                  <input key={id} type="hidden" name="leadIds" value={id} />
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        <p className="mt-2 text-xs text-brand-graphite/60">
          {summary.length > 0 ? total.people - total.none : reach} {labels.willReceive}. {labels.groupsNote}
        </p>
      </fieldset>

      {/* The developments a campaign shows, for {{projects}}. */}
      {showsProjects || shownProjects.length > 0 ? (
        <fieldset className="rounded border border-brand-line p-3" data-show-projects>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {labels.showProjects}
          </legend>
          <div className="flex flex-wrap gap-4">
            {projectChoices.map((one) => (
              <label key={one.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="projectIds"
                  value={one.id}
                  checked={shownProjects.includes(one.id)}
                  onChange={(event) => setShownProjects(toggle(shownProjects, one.id, event.target.checked))}
                />
                {one.name}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-brand-graphite/60">{labels.showProjectsNote}</p>
          {showsProjects && shownProjects.length === 0 ? (
            <p className="mt-1 text-xs font-semibold text-[color:var(--color-negative)]" data-projects-warning>
              {labels.showProjectsNeeded}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {onlyAgents ? (
        <>
          {sendEmail ? <input type="hidden" name="viaEmail" value="on" /> : null}
          {sendWhatsapp ? <input type="hidden" name="viaWhatsapp" value="on" /> : null}
        </>
      ) : (
        <fieldset className="rounded border border-brand-line p-3" data-how-to-send>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {toAgents ? labels.howToSendOthers : labels.howToSend}
          </legend>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="viaEmail"
                checked={viaEmail}
                onChange={(e) => setViaEmail(e.target.checked)}
              />
              <span>{labels.email}</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="viaWhatsapp"
                checked={viaWhatsapp}
                onChange={(e) => setViaWhatsapp(e.target.checked)}
              />
              <span>{toClients || toLeads || toBuyers ? labels.textByChoice : labels.whatsapp}</span>
            </label>
          </div>
          <p className="mt-2 text-xs text-brand-graphite/60">{labels.bothNote}</p>
          {(toClients || toLeads || toBuyers) && viaWhatsapp ? (
            <p className="mt-1 text-xs text-brand-graphite/60" data-text-by-choice>{labels.textByChoiceNote}</p>
          ) : null}
        </fieldset>
      )}

      {/*
        The agents, each the way they chose. An agent who wants both is never
        sent both: the office picks the one way for this campaign.
      */}
      {toAgents ? (
        <fieldset className="rounded border border-brand-line p-3" data-agent-ways>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {labels.agentsWays}
          </legend>
          <p className="text-sm">
            {labels.agentsByEmail} <strong>{ways.email}</strong> . {labels.agentsByWhatsapp}{" "}
            <strong>{ways.whatsapp}</strong> . {labels.agentsBoth} <strong>{ways.both}</strong>
          </p>
          {ways.both > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              <span>{labels.agentsBothVia}</span>
              <label className="flex items-center gap-2">
                <input type="radio" name="agentsBothVia" value="EMAIL" checked={bothVia === "EMAIL"} onChange={() => setBothVia("EMAIL")} />
                {labels.email}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="agentsBothVia" value="SMS" checked={bothVia === "SMS"} onChange={() => setBothVia("SMS")} />
                {labels.whatsapp}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="agentsBothVia" value="BOTH" checked={bothVia === "BOTH"} onChange={() => setBothVia("BOTH")} />
                {labels.bothWays}
              </label>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-brand-graphite/60">{onlyAgents ? labels.agentsOnlyNote : labels.agentsFallback}</p>
        </fieldset>
      ) : null}

      {/* Who gets it, and how: a table that follows every tick above. */}
      <fieldset className="rounded border border-brand-teal p-3" data-reach-summary>
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-teal-dark">
          {labels.summaryTitle}
        </legend>
        {summary.length === 0 ? (
          <p className="text-sm text-brand-graphite/60">{labels.summaryEmpty}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data w-full text-sm" data-nosort="true">
                <thead>
                  <tr>
                    <th>{labels.summaryGroup}</th>
                    <th className="ctr">{labels.summaryPeople}</th>
                    <th className="ctr">{labels.email}</th>
                    <th className="ctr">SMS</th>
                    <th className="ctr">{labels.summaryNone}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.key} data-summary-row={row.key}>
                      <td className="font-medium">
                        {row.name}
                        {"alsoBuyers" in row && row.alsoBuyers ? (
                          <div className="text-xs font-normal text-brand-graphite/60">
                            {row.alsoBuyers} {labels.summaryAlsoBuyers}
                          </div>
                        ) : null}
                      </td>
                      <td className="ctr">{row.people}</td>
                      <td className="ctr">{row.email}</td>
                      <td className="ctr">{row.sms}</td>
                      <td className={`ctr ${row.none ? "text-[color:var(--color-warning,#b7791f)]" : ""}`}>{row.none}</td>
                    </tr>
                  ))}
                  {summary.length > 1 ? (
                    <tr className="font-semibold" data-summary-row="total">
                      <td>{labels.summaryTotal}</td>
                      <td className="ctr">{total.people}</td>
                      <td className="ctr">{total.email}</td>
                      <td className="ctr">{total.sms}</td>
                      <td className="ctr">{total.none}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-brand-graphite/60">
              <li>{labels.summaryRuleClients}</li>
              {toAgents ? <li>{labels.summaryRuleAgents}</li> : null}
              {toSubowners ? <li>{labels.summaryRuleSubowners}</li> : null}
              <li>{labels.summaryRuleNone}</li>
              <li>{labels.summaryRuleOnce}</li>
            </ul>
          </>
        )}
      </fieldset>

      {showEmail ? (
        <fieldset className="rounded border border-brand-line p-3" data-email-box>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {labels.theEmail}
          </legend>
          {!onlyAgents && !viaEmail ? <p className="mb-2 text-xs font-semibold text-brand-teal-dark">{labels.onlyAgentsEmail}</p> : null}
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="subject">
                {labels.subject}
              </label>
              <input
                id="subject"
                name="subject"
                required={showEmail}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={labels.subjectPlaceholder}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="body">
                {labels.body}
              </label>
              <textarea
                id="body"
                name="body"
                rows={10}
                required={showEmail}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={labels.bodyPlaceholder}
                className="textarea"
              />
            </div>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="body" value="" />
      )}

      {showWhatsapp ? (
        <fieldset className="rounded border border-brand-line p-3" data-whatsapp-box>
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
            {labels.theWhatsapp}
          </legend>
          {!onlyAgents && !viaWhatsapp ? <p className="mb-2 text-xs font-semibold text-brand-teal-dark">{labels.onlyAgentsWhatsapp}</p> : null}
          <label className="label" htmlFor="bodyWhatsapp">
            {labels.body}
          </label>
          <textarea
            id="bodyWhatsapp"
            name="bodyWhatsapp"
            rows={5}
            required={showWhatsapp}
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            placeholder={labels.whatsappPlaceholder}
            className="textarea"
          />
          <p className="mt-2 text-xs text-brand-graphite/60">{labels.whatsappNote}</p>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="files">
            {labels.files}
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,image/*"
            className="input !py-1.5 text-xs"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.filesNote}</p>
        </div>

        <div>
          <label className="label" htmlFor="shareLinkId">
            {labels.priceList}
          </label>
          <select id="shareLinkId" name="shareLinkId" className="select">
            <option value="">{labels.noPriceList}</option>
            {priceLists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brand-graphite/60">{labels.priceListNote}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-brand-line pt-4">
        <SubmitButton>{labels.save}</SubmitButton>
        <Link href="/campaigns" className="btn btn-secondary">
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}

/**
 * Every one of a group, or only the ones ticked: the same two choices and the
 * searchable list for the clients and the companies. Ticked ones stay chosen
 * while the search hides them.
 */
function ChoosePeople({
  name,
  mode,
  setMode,
  chosen,
  setChosen,
  choices,
  labels,
}: {
  name: "client" | "subowner";
  mode: "all" | "chosen";
  setMode: (mode: "all" | "chosen") => void;
  chosen: string[];
  setChosen: (ids: string[]) => void;
  choices: { id: string; label: string; hint: string }[];
  labels: { all: string; chosen: string; picked: string; search: string };
}) {
  const [term, setTerm] = useState("");
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = choices.filter((one) => words.every((word) => `${one.label} ${one.hint}`.toLowerCase().includes(word)));
  return (
    <div className="mt-3 rounded border border-brand-line bg-brand-surface p-3" data-picker={name}>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name={`${name}Mode`} value="all" checked={mode === "all"} onChange={() => setMode("all")} />
          {labels.all}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`${name}Mode`} value="chosen" checked={mode === "chosen"} onChange={() => setMode("chosen")} />
          {labels.chosen}
          {mode === "chosen" ? (
            <span className="text-xs text-brand-graphite/60">
              ({chosen.length} {labels.picked})
            </span>
          ) : null}
        </label>
      </div>
      {mode === "chosen" ? (
        <>
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={labels.search} className="input mt-2" />
          <ul className="mt-2 max-h-56 overflow-y-auto rounded border border-brand-line bg-white text-sm">
            {shown.map((one) => (
              <li key={one.id} className="border-b border-brand-line last:border-0">
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={chosen.includes(one.id)}
                    onChange={(event) =>
                      setChosen(event.target.checked ? [...new Set([...chosen, one.id])] : chosen.filter((id) => id !== one.id))
                    }
                    data-pick={one.label}
                  />
                  <span className="font-medium">{one.label}</span>
                  <span className="text-xs text-brand-graphite/60">{one.hint}</span>
                </label>
              </li>
            ))}
          </ul>
          {chosen.map((id) => (
            <input key={id} type="hidden" name={`${name}Ids`} value={id} />
          ))}
        </>
      ) : null}
    </div>
  );
}
