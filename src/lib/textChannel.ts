/**
 * How a person is texted: SMS, WhatsApp, or not at all.
 *
 * Clients and leads carry their own choice, set with the buttons on their
 * page. NONE means no texts of any kind: no appointment texts and no campaign
 * texts, only email. An agent who takes campaigns by WhatsApp is texted by
 * WhatsApp too; everybody else, and anything unrecognised, by SMS.
 */
export type TextChannel = "SMS" | "WHATSAPP" | "NONE";

/** The ways a text can actually go. */
export type TextWay = Exclude<TextChannel, "NONE">;

export const TEXT_CHANNELS: TextChannel[] = ["SMS", "WHATSAPP", "NONE"];

export function textChannelOf(value: string | null | undefined): TextChannel {
  return value === "WHATSAPP" ? "WHATSAPP" : value === "NONE" ? "NONE" : "SMS";
}

/** An agent's campaign choice (EMAIL, WHATSAPP or BOTH) read as how to text them. */
export function agentTextChannel(campaignChannel: string | null | undefined): TextWay {
  return campaignChannel === "WHATSAPP" || campaignChannel === "BOTH" ? "WHATSAPP" : "SMS";
}
