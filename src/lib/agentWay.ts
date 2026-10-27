/**
 * How a campaign reaches an agent.
 *
 * Every agent hears the way they chose: an agent who wants email gets the
 * email, one who wants SMS gets the SMS, whatever the campaign was ticked for
 * the other groups. An agent who takes either way gets the way the campaign
 * says for them: email unless the office chose otherwise, or both, when the
 * office wants them to have it both ways.
 *
 * A way the campaign has no message for falls back to the one it has, so an
 * agent who prefers SMS still hears about a campaign written only as an email.
 *
 * The campaign's text is still kept in viaWhatsapp and bodyWhatsapp, the names
 * from when texts went by WhatsApp: they now mean the SMS. An agent or a
 * campaign still saying WHATSAPP is read as SMS.
 */
export type AgentCampaign = {
  viaEmail: boolean;
  viaWhatsapp: boolean;
  agentsBothVia: string | null;
  /** An email was written: the campaign goes by email, or it has a subject for the agents who want email. */
  subject?: string | null;
  /** A WhatsApp message was written, for everyone or only for the agents who want WhatsApp. */
  bodyWhatsapp?: string | null;
};

export function agentChannels(preference: string | undefined, campaign: AgentCampaign): ("EMAIL" | "SMS")[] {
  const emailReady = campaign.viaEmail || Boolean(campaign.subject?.trim());
  const textReady = campaign.viaWhatsapp || Boolean(campaign.bodyWhatsapp?.trim());
  const isText = (value: string | null | undefined) => value === "SMS" || value === "WHATSAPP";
  const wanted: ("EMAIL" | "SMS")[] = isText(preference)
    ? ["SMS"]
    : preference === "BOTH"
      ? campaign.agentsBothVia === "BOTH"
        ? ["EMAIL", "SMS"]
        : isText(campaign.agentsBothVia)
          ? ["SMS"]
          : ["EMAIL"]
      : ["EMAIL"];
  const ready = wanted.filter((way) => (way === "EMAIL" ? emailReady : textReady));
  if (ready.length > 0) return ready;
  return emailReady ? ["EMAIL"] : textReady ? ["SMS"] : [];
}

/** The one way, for what still reads one: the first of the agent's ways. */
export function agentWay(preference: string | undefined, campaign: AgentCampaign): "EMAIL" | "SMS" {
  return agentChannels(preference, campaign)[0] ?? "EMAIL";
}

/**
 * Every way one campaign reaches one person.
 *
 * An agent hears the way they chose (above). Everybody else gets the email
 * when the campaign is ticked for email, and the SMS when it is ticked for
 * SMS, except a client, buyer or lead set to no texts.
 */
export type CampaignWay = "EMAIL" | "WHATSAPP" | "SMS";

export function campaignWays(
  recipient: { group: string; agentChannel?: string; textChannel?: string },
  campaign: AgentCampaign,
): CampaignWay[] {
  if (recipient.group === "AGENTS") return agentChannels(recipient.agentChannel, campaign);
  const ways: CampaignWay[] = [];
  if (campaign.viaEmail) ways.push("EMAIL");
  /* Set to no texts: the email only, whatever the campaign. */
  if (campaign.viaWhatsapp && recipient.textChannel !== "NONE") ways.push("SMS");
  return ways;
}
