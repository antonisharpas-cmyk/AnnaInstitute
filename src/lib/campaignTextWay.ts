import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";

/*
 * The campaigns whose texts went by WhatsApp, before every text moved to SMS.
 *
 * A campaign's "text" tick now means SMS, but the ones already sent by
 * WhatsApp should still say so in the lists and reports. What was actually
 * sent decides, read from the messages themselves.
 */
export async function sentByWhatsapp(campaignIds: string[]): Promise<Set<string>> {
  if (campaignIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ campaignId: messages.campaignId })
    .from(messages)
    .where(and(inArray(messages.campaignId, campaignIds), eq(messages.channel, "WHATSAPP")));
  return new Set(rows.map((one) => one.campaignId).filter((id): id is string => Boolean(id)));
}
