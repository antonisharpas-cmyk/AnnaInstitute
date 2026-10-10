import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import type { MessageKey } from "@/i18n";

/**
 * What the office did, in words.
 *
 * The audit log stores machine names, "contract.create" and the like, because
 * that is what a log is for. This turns each one into a line somebody can read
 * without knowing the table: who, what they did, and to which kind of record.
 */

export type ActivityLine = {
  id: string;
  who: string;
  verb: MessageKey;
  subject: MessageKey | null;
  detail: string | null;
  at: Date;
  href: string | null;
};

/** The last word of an action name tells us what happened. */
const VERBS: Record<string, MessageKey> = {
  create: "act.created",
  add: "act.created",
  update: "act.updated",
  dates: "act.updated",
  status: "act.updated",
  delete: "act.deleted",
  remove: "act.deleted",
  record: "act.recorded",
  send: "act.sent",
  paid: "act.paid",
  payment: "act.recorded",
  rate: "act.updated",
  extra: "act.created",
  converted: "act.converted",
  undone: "act.returned",
  upload: "act.uploaded",
  checked: "act.checked",
  assign: "act.assigned",
  unassign: "act.unassigned",
  revoke: "act.revoked",
  export: "act.exported",
  success: "act.signedIn",
};

/** The entity column names the kind of record, and the first word backs it up. */
const SUBJECTS: Record<string, MessageKey> = {
  agent: "act.entity.agent",
  api_key: "act.entity.api_key",
  campaign: "act.entity.campaign",
  changeRequest: "act.entity.changeRequest",
  client: "act.entity.client",
  contract: "act.entity.contract",
  document: "act.entity.document",
  email_template: "act.entity.email_template",
  expense: "act.entity.expense",
  installment: "act.entity.installment",
  lead: "act.entity.lead",
  message: "act.entity.message",
  project: "act.entity.project",
  report: "act.entity.report",
  shareLink: "act.entity.shareLink",
  subowner: "act.entity.subowner",
  suppression: "act.entity.suppression",
  unit: "act.entity.unit",
  user: "act.entity.user",
  payment: "act.entity.payment",
  commission: "act.entity.commission",
  partner: "act.entity.partner",
};

/** Where the record lives, when it has a page of its own. */
function addressOf(entity: string, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entity) {
    case "client":
      return `/clients/${entityId}`;
    case "contract":
      return `/contracts/${entityId}`;
    case "project":
      return `/projects/${entityId}`;
    case "lead":
      return `/leads/${entityId}`;
    case "agent":
      return `/agents/${entityId}`;
    case "subowner":
      return `/subowners/${entityId}`;
    case "partner":
      return `/partners/${entityId}`;
    case "expense":
      return `/invoices/${entityId}`;
    case "campaign":
      return `/campaigns/${entityId}`;
    default:
      return null;
  }
}

/** A person, named the shortest way the log allows. */
function nameOf(name: string | null, email: string | null): string {
  if (name && name.trim()) return name.trim();
  if (!email) return "The website";
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

/**
 * The detail line, without the machinery.
 *
 * A log entry sometimes carries a record's identifier, which means nothing to
 * anybody reading the dashboard, so those words are dropped.
 */
function readableDetail(detail: string | null): string | null {
  if (!detail) return null;
  const clean = detail
    .replace(/\b[A-Za-z0-9_-]{16,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/(against installment|for|to)\s*$/i, "")
    .trim();
  // A bare number or a status word on its own says nothing without its field.
  if (/^[\d.,\s]+$/.test(clean)) return null;
  if (/^[A-Z_]+$/.test(clean)) return null;
  return clean.length > 3 ? clean : null;
}

export async function recentActivity(limit = 12): Promise<ActivityLine[]> {
  const rows = await db
    .select({ log: auditLogs, person: users })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit * 4);

  const lines: ActivityLine[] = [];
  let lastSignIn = "";
  let lastSame = "";

  for (const { log: row, person } of rows) {
    // The noisy ones. A log wants them, a dashboard does not.
    if (row.action === "logged" || row.action === "login.failed") continue;

    // One sign in per person is worth saying. Six in a row is not.
    if (row.action === "login.success") {
      const who = row.userEmail ?? row.userId ?? "";
      if (who === lastSignIn) continue;
      lastSignIn = who;
    }

    // Eight exports in a row is one thing that happened, not eight.
    const samenessKey = `${row.userEmail ?? ""}|${row.action}`;
    if (samenessKey === lastSame) continue;
    lastSame = samenessKey;

    const parts = row.action.split(".");
    const last = parts[parts.length - 1] ?? "";
    const verb = VERBS[last] ?? VERBS[parts[1] ?? ""] ?? "act.updated";

    const bare = row.action === "lead.received" || row.action === "login.success";

    lines.push({
      id: row.id,
      who: nameOf(person?.name ?? null, row.userEmail),
      verb: row.action === "lead.received" ? "act.receivedLead" : verb,
      subject: bare ? null : (SUBJECTS[row.entity] ?? null),
      detail: readableDetail(row.detail),
      at: row.createdAt,
      href: addressOf(row.entity, row.entityId),
    });

    if (lines.length >= limit) break;
  }

  return lines;
}
