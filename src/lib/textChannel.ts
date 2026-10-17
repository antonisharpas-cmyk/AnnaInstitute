/**
 * How a person is texted: SMS or WhatsApp.
 *
 * Clients and leads carry their own choice, set with the buttons on their
 * page. An agent who takes campaigns by WhatsApp is texted by WhatsApp too;
 * everybody else, and anything unrecognised, by SMS.
 */
export type TextChannel = "SMS" | "WHATSAPP";

export const TEXT_CHANNELS: TextChannel[] = ["SMS", "WHATSAPP"];

export function textChannelOf(value: string | null | undefined): TextChannel {
  return value === "WHATSAPP" ? "WHATSAPP" : "SMS";
}

/** An agent's campaign choice (EMAIL, WHATSAPP or BOTH) read as how to text them. */
export function agentTextChannel(campaignChannel: string | null | undefined): TextChannel {
  return campaignChannel === "WHATSAPP" || campaignChannel === "BOTH" ? "WHATSAPP" : "SMS";
}
