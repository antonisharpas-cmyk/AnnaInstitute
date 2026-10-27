/**
 * How a person is texted: by SMS, or not at all.
 *
 * Clients and leads carry their own choice, set with the buttons on their
 * page. NONE means no texts of any kind: no appointment texts and no campaign
 * texts, only email.
 *
 * WhatsApp was dropped: every text goes by SMS. A WHATSAPP still found on an
 * old record, or arriving from an old form, is read as SMS, so nobody who
 * chose to be texted loses their texts.
 */
export type TextChannel = "SMS" | "WHATSAPP" | "NONE";

/** The ways a text can actually go. Only SMS is used now; WHATSAPP stays for the history of what was sent. */
export type TextWay = Exclude<TextChannel, "NONE">;

/** The choices the office is offered. */
export const TEXT_CHANNELS: TextChannel[] = ["SMS", "NONE"];

export function textChannelOf(value: string | null | undefined): TextChannel {
  return value === "NONE" ? "NONE" : "SMS";
}

/** How campaigns reach an agent: EMAIL, SMS or BOTH. An old WHATSAPP is SMS. */
export function agentCampaignChannel(value: string | null | undefined): "EMAIL" | "SMS" | "BOTH" {
  return value === "SMS" || value === "WHATSAPP" ? "SMS" : value === "BOTH" ? "BOTH" : "EMAIL";
}

/** An agent is texted by SMS, whatever their campaign choice. */
export function agentTextChannel(): TextWay {
  return "SMS";
}
