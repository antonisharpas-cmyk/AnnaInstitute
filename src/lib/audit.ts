import { db } from "@/db";
import { auditLogs } from "@/db/schema";

/** Prices, VAT rates and commissions are money. Every change is recorded. */
export async function recordAudit(entry: {
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: string | null;
  userId?: string | null;
  userEmail?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      detail: entry.detail ?? null,
      userId: entry.userId ?? null,
      userEmail: entry.userEmail ?? null,
    });
  } catch {
    // Never let the audit log break the action it was recording.
  }
}
