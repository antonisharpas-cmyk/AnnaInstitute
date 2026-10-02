import "server-only";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { resolveStored, storageRoot } from "@/lib/storage";
import { recordAudit } from "@/lib/audit";

/*
 * Start fresh: clear the sales records, keep the set up.
 *
 * Once the trial is over the office wants the CRM empty of every client, lead,
 * contract, payment, invoice, follow up, appointment and email sent, while the
 * developments, the apartments, the companies with their shareholders, the team
 * and the agents stay exactly as they were set up, along with the settings and
 * the email templates. The apartments go back to Available with no buyer.
 *
 * Nothing is thrown away blind. Before anything is deleted, every row that is
 * about to go is written to one JSON file, and the files that belonged to those
 * rows (ID copies, contracts, receipts, invoices received) are moved beside it,
 * in a backups folder on the same disk. If something was cleared by mistake it
 * can be brought back from there.
 *
 * Everything is deleted in one transaction, so it either all happens or none
 * of it does.
 */

/** What is cleared, in the order it is deleted: whatever points at a row goes before the row. */
const CLEARED: { table: string; what: string; where?: string }[] = [
  { table: "automatic_emails", what: "automatic emails sent" },
  { table: "messages", what: "emails and messages sent" },
  { table: "campaign_documents", what: "campaign attachments" },
  { table: "campaigns", what: "campaigns" },
  { table: "suppressions", what: "unsubscribe list" },
  { table: "signing_papers", what: "Reservations and Contracts of Sale being signed" },
  { table: "issued_documents", what: "invoices and receipts issued" },
  {
    table: "documents",
    what: "files of clients, contracts, payments and invoices",
    where:
      "client_id is not null or contract_id is not null or change_request_id is not null or payment_id is not null or commission_id is not null or expense_id is not null or constructor_payment_id is not null",
  },
  { table: "commission_payments", what: "commission payments" },
  { table: "commissions", what: "commissions" },
  { table: "refunds", what: "refunds and penalties" },
  { table: "cash_receipts", what: "cash received" },
  { table: "vat_changes", what: "VAT changes" },
  { table: "change_requests", what: "change requests" },
  { table: "payments", what: "payments" },
  { table: "installments", what: "payment stages" },
  { table: "contract_units", what: "apartments on contracts" },
  { table: "contracts", what: "contracts" },
  { table: "expense_lines", what: "invoice lines" },
  { table: "expenses", what: "invoices, fees and costs" },
  { table: "appointments", what: "appointments" },
  { table: "lead_follow_ups", what: "follow ups" },
  { table: "lead_notes", what: "lead notes" },
  { table: "leads", what: "leads" },
  { table: "users", what: "buyer logins", where: "role = 'BUYER'" },
  { table: "clients", what: "clients" },
  { table: "constructor_payments", what: "payments to constructors" },
  { table: "constructor_projects", what: "developments given to constructors" },
  { table: "constructors", what: "constructors" },
  { table: "audit_logs", what: "activity log" },
];

/** What stays, for the screen. */
export const KEPT = [
  "developments",
  "apartments, back to Available",
  "files of developments and apartments",
  "companies, shareholders and directors",
  "team members and logins",
  "agents",
  "settings, number series, email templates and lists",
];

const rowsOf = (result: unknown): Record<string, unknown>[] =>
  Array.isArray(result) ? (result as Record<string, unknown>[]) : (((result as { rows?: unknown[] })?.rows ?? []) as Record<string, unknown>[]);

const whereOf = (one: (typeof CLEARED)[number]): SQL => sql.raw(one.where ? ` where ${one.where}` : "");

/** How many rows each part would lose, for the screen before anyone presses the button. */
export async function freshPreview() {
  const out: { what: string; count: number }[] = [];
  for (const one of CLEARED) {
    const [row] = rowsOf(await db.execute(sql`select count(*)::int as n from ${sql.raw(one.table)}${whereOf(one)}`));
    out.push({ what: one.what, count: Number(row?.n ?? 0) });
  }
  const [sold] = rowsOf(await db.execute(sql`select count(*)::int as n from units where status <> 'AVAILABLE' or client_id is not null`));
  return { parts: out, apartmentsReset: Number(sold?.n ?? 0) };
}

export type FreshResult = { removed: number; apartments: number; files: number; backup: string };

export async function startFresh(by: { id: string; email: string }): Promise<FreshResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const folder = path.join(path.dirname(storageRoot()), "backups", `cleared-${stamp}`);
  await mkdir(path.join(folder, "files"), { recursive: true });

  /* 1. A copy of everything that is about to go. */
  const copy: Record<string, Record<string, unknown>[]> = {};
  for (const one of CLEARED) {
    copy[one.table] = rowsOf(await db.execute(sql`select * from ${sql.raw(one.table)}${whereOf(one)}`));
  }
  copy.units_before = rowsOf(
    await db.execute(sql`select id, project_id, code, status, status_choice, client_id, status_by_hand_at from units where status <> 'AVAILABLE' or client_id is not null`),
  );
  await writeFile(path.join(folder, "cleared-rows.json"), JSON.stringify({ at: new Date().toISOString(), by: by.email, tables: copy }, null, 1));

  /* 2. Clear, all or nothing. */
  let removed = 0;
  let apartments = 0;
  await db.transaction(async (tx) => {
    /* The apartments let go of their buyers first, so the clients can go. */
    const reset = rowsOf(
      await tx.execute(sql`update units
        set status = 'AVAILABLE', status_choice = null, client_id = null, status_by_hand_at = null, status_by_hand_by = null, updated_at = now()
        where status <> 'AVAILABLE' or client_id is not null or status_choice is not null
        returning id`),
    );
    apartments = reset.length;
    await tx.execute(sql`update users set client_id = null where client_id is not null and role <> 'BUYER'`);
    for (const one of CLEARED) {
      const gone = rowsOf(await tx.execute(sql`delete from ${sql.raw(one.table)}${whereOf(one)} returning 1 as x`));
      removed += gone.length;
    }
  });

  /* The log starts again with this one line, saying what was done and where the copy is. */
  await recordAudit({
    action: "data.cleared",
    entity: "settings",
    detail: `${removed} records cleared, ${apartments} apartments back to Available, copy kept in backups/cleared-${stamp}`,
    userId: by.id,
    userEmail: by.email,
  });

  /* 3. The files of what was cleared, moved beside the copy rather than deleted. */
  let files = 0;
  for (const doc of copy.documents ?? []) {
    const stored = String(doc.file_path ?? "");
    if (!stored) continue;
    try {
      const target = path.join(folder, "files", `${String(doc.id)}-${path.basename(stored)}`);
      await rename(resolveStored(stored), target);
      files += 1;
    } catch {
      /* Already gone, or never there. */
    }
  }

  return { removed, apartments, files, backup: `backups/cleared-${stamp}` };
}
