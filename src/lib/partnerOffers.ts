import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents, partnerOffers, users } from "@/db/schema";

/*
 * A partner's offers: what they priced for the office, an air conditioner or a
 * kitchen say, with its pictures or PDFs. Newest first, so the latest offer is
 * the one read first and the older ones stay as the history.
 */
export type OfferFile = typeof documents.$inferSelect;
export type Offer = typeof partnerOffers.$inferSelect & { addedBy: string | null; files: OfferFile[] };

export async function offersOf(partnerId: string): Promise<Offer[]> {
  const rows = await db
    .select({ offer: partnerOffers, addedBy: users.name })
    .from(partnerOffers)
    .leftJoin(users, eq(users.id, partnerOffers.createdById))
    .where(eq(partnerOffers.partnerId, partnerId))
    .orderBy(desc(partnerOffers.createdAt));
  const ids = rows.map((row) => row.offer.id);
  const files = ids.length
    ? await db.select().from(documents).where(inArray(documents.partnerOfferId, ids)).orderBy(asc(documents.createdAt))
    : [];
  return rows.map((row) => ({
    ...row.offer,
    addedBy: row.addedBy,
    files: files.filter((file) => file.partnerOfferId === row.offer.id),
  }));
}

/** The number of offers each partner has, for the list of partners. */
export async function offerCounts(): Promise<Map<string, number>> {
  const rows = await db.select({ partnerId: partnerOffers.partnerId }).from(partnerOffers);
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.partnerId, (counts.get(row.partnerId) ?? 0) + 1);
  return counts;
}
