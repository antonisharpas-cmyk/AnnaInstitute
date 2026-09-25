"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, contracts, leads } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";

type Kind = "lead" | "client";

/** Back where it was, in every list and every count. */
export async function putBack(kind: Kind, id: string) {
  const user = await requireUser(["ADMIN"]);

  if (kind === "lead") {
    await db.update(leads).set({ deletedAt: null, updatedAt: new Date() }).where(eq(leads.id, id));
  } else {
    await db
      .update(clients)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(clients.id, id));
  }

  await recordAudit({
    action: `${kind}.restored`,
    entity: kind,
    entityId: id,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.putBack");
  revalidatePath("/bin");
  revalidatePath(kind === "lead" ? "/leads" : "/clients");
}

/**
 * Gone.
 *
 * The only irreversible button in the CRM, which is why it lives here and
 * nowhere else: to reach it somebody has to open the bin and read the line
 * saying it cannot be undone.
 */
export async function forGood(kind: Kind, id: string) {
  const user = await requireUser(["ADMIN"]);

  if (kind === "lead") {
    await db.delete(leads).where(eq(leads.id, id));
  } else {
    /* A client named on a contract stays: the contract, its payments and its
       invoices are the record of a sale, and they need their buyer. */
    const [onContract] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.clientId, id))
      .limit(1);
    if (onContract) {
      await flash("said.clientHasContractsForGood", "bad");
      revalidatePath("/bin");
      return;
    }
    await db.delete(clients).where(eq(clients.id, id));
  }

  await recordAudit({
    action: `${kind}.destroyed`,
    entity: kind,
    entityId: id,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.goneForGood");
  revalidatePath("/bin");
}
