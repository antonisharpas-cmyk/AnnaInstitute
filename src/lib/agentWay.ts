/**
 * The one way a campaign reaches an agent.
 *
 * Their own choice, and for an agent who wants both, the way the campaign says.
 * A way the campaign was not written for falls back to the one it was, so an
 * agent who prefers WhatsApp still hears about an email only campaign.
 */
export function agentWay(
  preference: string | undefined,
  campaign: { viaEmail: boolean; viaWhatsapp: boolean; agentsBothVia: string | null },
): "EMAIL" | "WHATSAPP" {
  const wanted =
    preference === "BOTH"
      ? campaign.agentsBothVia === "WHATSAPP" || campaign.agentsBothVia === "EMAIL"
        ? campaign.agentsBothVia
        : campaign.viaEmail
          ? "EMAIL"
          : "WHATSAPP"
      : preference === "WHATSAPP"
        ? "WHATSAPP"
        : "EMAIL";
  if (wanted === "EMAIL" && !campaign.viaEmail) return "WHATSAPP";
  if (wanted === "WHATSAPP" && !campaign.viaWhatsapp) return "EMAIL";
  return wanted;
}
