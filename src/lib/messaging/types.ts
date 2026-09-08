export type Channel = "EMAIL" | "SMS" | "WHATSAPP" | "VIBER";

export type SendResult = {
  status: "SENT" | "FAILED" | "SIMULATED";
  providerId?: string | null;
  error?: string | null;
  /** Set when a channel was not available and another one carried the message. */
  usedChannel?: Channel;
};

export type OutgoingMessage = {
  channel: Channel;
  to: string;
  subject?: string | null;
  body: string;
};
