import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, suppressions } from "@/db/schema";
import { normalisePhone } from "./messaging/text";
import { recordAudit } from "./audit";

export type SuppressionChannel = "EMAIL" | "PHONE";

export function normaliseFor(channel: SuppressionChannel, value: string): string {
  return channel === "EMAIL" ? value.trim().toLowerCase() : normalisePhone(value);
}

/**
 * The hard stop. Checked before every single send, in every channel.
 * Rows only ever go in. Nothing in the interface takes one out again.
 */
export async function isSuppressed(
  channel: SuppressionChannel,
  value: string,
): Promise<boolean> {
  const normalised = normaliseFor(channel, value);
  if (!normalised) return true;
  const rows = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(and(eq(suppressions.channel, channel), eq(suppressions.value, normalised)))
    .limit(1);
  return rows.length > 0;
}

export async function addSuppression(options: {
  channel: SuppressionChannel;
  value: string;
  reason?: string;
  source?: string;
}): Promise<void> {
  const value = normaliseFor(options.channel, options.value);
  if (!value) return;

  await db
    .insert(suppressions)
    .values({
      channel: options.channel,
      value,
      reason: options.reason ?? null,
      source: options.source ?? null,
    })
    .onConflictDoNothing();

  await recordAudit({
    action: "suppression.add",
    entity: "suppression",
    detail: `${options.channel} ${value}, ${options.reason ?? "no reason given"}`,
    userEmail: options.source ?? null,
  });
}

/**
 * Someone said stop. Suppress the address or the number, and mark every client
 * record that carries it, so the office can see why they stopped receiving.
 */
export async function suppressAndMarkClients(options: {
  channel: SuppressionChannel;
  value: string;
  reason: string;
  source: string;
}): Promise<{ clientsMarked: number }> {
  await addSuppression(options);
  const value = normaliseFor(options.channel, options.value);

  const candidates = await db.select().from(clients);
  let marked = 0;

  for (const client of candidates) {
    const theirs =
      options.channel === "EMAIL"
        ? (client.email ?? "").trim().toLowerCase()
        : client.phone
          ? normalisePhone(client.phone)
          : "";
    if (!theirs || theirs !== value) continue;

    await db
      .update(clients)
      .set({ marketingOptIn: false, unsubscribedAt: new Date(), updatedAt: new Date() })
      .where(eq(clients.id, client.id));
    marked += 1;
  }

  return { clientsMarked: marked };
}

export async function suppressionCount(): Promise<number> {
  const rows = await db.select({ id: suppressions.id }).from(suppressions);
  return rows.length;
}
