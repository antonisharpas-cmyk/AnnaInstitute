import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { desc, eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";

/**
 * Keys for the machines that talk to the CRM, today only the website posting
 * leads.
 *
 * The key itself is never stored. What is stored is a SHA 256 of it, so a copy
 * of the database is not a copy of the keys. The office sees the first eight
 * characters, enough to recognise which key a site is using, and the whole key
 * exactly once, on the screen where it is made.
 */

const PREFIX = "oe_live_";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** A new key, returned in the clear. This is the only time it can be read. */
export async function createApiKey(name: string, createdByEmail: string) {
  const secret = `${PREFIX}${randomBytes(24).toString("base64url")}`;

  const inserted = await db
    .insert(apiKeys)
    .values({
      name,
      prefix: secret.slice(0, PREFIX.length + 6),
      keyHash: hashKey(secret),
      scope: "LEADS",
      createdByEmail,
    })
    .returning();

  return { key: secret, record: inserted[0] };
}

export async function listApiKeys() {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(id: string) {
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
}

/**
 * The key on a request, if it is one of ours and still live.
 *
 * The comparison is done on the hashes and in constant time, so a caller cannot
 * learn a key by measuring how long the answer takes.
 */
export async function keyFromRequest(request: Request) {
  const given =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  if (!given.trim()) return null;

  const wanted = hashKey(given.trim());
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.scope, "LEADS"), isNull(apiKeys.revokedAt)));

  for (const row of rows) {
    const a = Buffer.from(row.keyHash, "hex");
    const b = Buffer.from(wanted, "hex");
    if (a.length === b.length && timingSafeEqual(a, b)) return row;
  }

  return null;
}

/** Remember that a key was used, so a dead integration is visible in the list. */
export async function touchApiKey(id: string, count: number) {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date(), useCount: count + 1 })
    .where(eq(apiKeys.id, id));
}
