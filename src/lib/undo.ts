import "server-only";
import { splitChoice } from "@/lib/choices/lists";
import { cookies } from "next/headers";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, leads } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

/**
 * Taking it back.
 *
 * Nobody uses a tool they are frightened of, so everything the office does in a
 * hurry can be undone from the line that says it happened. The way back is
 * described in a short cookie, next to the message itself: what kind of change
 * it was, which records it touched, and what they were before. There is nothing
 * to clean up if it is never used, because the cookie expires on its own.
 *
 * Only the kinds listed here can be undone, and each one is the exact reverse
 * of something the person just did by hand, so an undo can never do more than
 * the person could do themselves.
 */

const COOKIE = "oe_undo";

export type UndoKind = "lead.status" | "lead.deleted" | "client.deleted" | "client.marketing";

export type Undo = {
  kind: UndoKind;
  /** The records that changed, and what each of them was before. */
  was: { id: string; value?: string | null }[];
};

const KINDS = new Set<UndoKind>([
  "lead.status",
  "lead.deleted",
  "client.deleted",
  "client.marketing",
]);

export async function offerUndo(undo: Undo): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, JSON.stringify(undo), {
    path: "/",
    maxAge: 120,
    httpOnly: false,
    sameSite: "lax",
  });
}

export async function readUndo(): Promise<Undo | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Undo;
    if (!parsed || !KINDS.has(parsed.kind) || !Array.isArray(parsed.was)) return null;
    return { kind: parsed.kind, was: parsed.was.slice(0, 500) };
  } catch {
    return null;
  }
}

export async function forgetUndo(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Put back whatever the last action changed. */
export async function applyUndo(undo: Undo, who: { id: string; email: string }): Promise<number> {
  const ids = undo.was.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return 0;

  let touched = 0;

  if (undo.kind === "lead.status") {
    // Each one goes back to its own former status, not to a shared one.
    for (const row of undo.was) {
      if (!row.value) continue;
      await db
        .update(leads)
        .set({
          status: splitChoice(row.value).base as "NEW",
          statusChoice: splitChoice(row.value).choice,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, row.id));
      touched += 1;
    }
  }

  if (undo.kind === "lead.deleted") {
    await db
      .update(leads)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(inArray(leads.id, ids));
    touched = ids.length;
  }

  if (undo.kind === "client.deleted") {
    await db
      .update(clients)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(inArray(clients.id, ids));
    touched = ids.length;
  }

  if (undo.kind === "client.marketing") {
    for (const row of undo.was) {
      await db
        .update(clients)
        .set({ marketingOptIn: row.value === "on", updatedAt: new Date() })
        .where(eq(clients.id, row.id));
      touched += 1;
    }
  }

  await recordAudit({
    action: `undo.${undo.kind}`,
    entity: undo.kind.split(".")[0] ?? "record",
    detail: `${touched} put back`,
    userId: who.id,
    userEmail: who.email,
  });

  await forgetUndo();
  return touched;
}

/* ---------------------------------------------------------------------------
   The recycle bin
   --------------------------------------------------------------------------- */

/** Thirty days, which is long enough for somebody to come back from holiday. */
export const BIN_DAYS = 30;

export function binCutoff(): Date {
  return new Date(Date.now() - BIN_DAYS * 86_400_000);
}

/**
 * What is in the bin, newest first.
 *
 * Anything older than the thirty days is cleared out as the bin is opened,
 * which keeps the promise on the page honest without needing a scheduled job.
 */
export async function readBin() {
  const cutoff = binCutoff();

  await Promise.all([
    db.delete(leads).where(and(isNotNull(leads.deletedAt), lt(leads.deletedAt, cutoff))),
    /* Not a client named on a contract, whose sale has to keep its buyer. */
    db
      .delete(clients)
      .where(
        and(
          isNotNull(clients.deletedAt),
          lt(clients.deletedAt, cutoff),
          sql`not exists (select 1 from contracts c where c.client_id = clients.id)`,
        ),
      ),
  ]);

  const [leadRows, clientRows] = await Promise.all([
    db.select().from(leads).where(isNotNull(leads.deletedAt)).limit(200),
    db.select().from(clients).where(isNotNull(clients.deletedAt)).limit(200),
  ]);

  return { leads: leadRows, clients: clientRows };
}
