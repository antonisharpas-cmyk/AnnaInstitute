import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automaticEmails,
  clients,
  contracts,
  documents,
  installments,
  payments,
  projects,
  units,
} from "@/db/schema";
import { formatAmount, toCents } from "@/lib/money";
import { sendAndRecord } from "@/lib/messaging";
import { resolveStored } from "@/lib/storage";
import { templateByKey, type AutomaticKey } from "@/lib/templates";

/**
 * The letters that follow the money.
 *
 * A buyer pays, and the CRM writes to them: the reservation with a welcome, the
 * signing with the contract, every installment after that with its receipt, and
 * the last one with congratulations. Nobody presses anything, which is the
 * whole point, so everything here is careful about the two ways that goes
 * wrong: the same letter arriving twice, and a letter arriving without the
 * paper it promises.
 *
 * Nothing in here throws. A payment is the office's record of money received
 * and it must be saved whatever the mail server thinks, so every failure is
 * written down as a failure and the payment stands.
 */

/** Which of the four letters this payment calls for. */
function letterFor(options: {
  stage: string | null;
  outstandingCents: number;
}): AutomaticKey {
  const stage = (options.stage ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  /* Paid off is the last word, whatever stage it happened on: a buyer who
     clears the balance early gets the congratulations, not a statement. */
  if (options.outstandingCents <= 0) return "paid_final";
  if (stage === "reservation" || stage === "κρατηση") return "paid_reservation";
  if (stage === "on signing of contract" || stage === "υπογραφη συμβολαιου") return "paid_signing";
  return "paid_installment";
}

/** What the braces in a letter are filled with. */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole);
}

type Papers = { filename: string; path: string; contentType?: string };

/** The receipt the office filed against this payment, if they filed one. */
async function receiptFor(paymentId: string): Promise<Papers | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.paymentId, paymentId), eq(documents.category, "RECEIPT")))
    .orderBy(desc(documents.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    filename: row.originalName || row.title,
    path: resolveStored(row.filePath),
    contentType: row.mimeType ?? undefined,
  };
}

/** The contract itself, filed against the contract record. */
async function contractPaper(contractId: string): Promise<Papers | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.contractId, contractId), eq(documents.category, "CONTRACT")))
    .orderBy(desc(documents.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    filename: row.originalName || row.title,
    path: resolveStored(row.filePath),
    contentType: row.mimeType ?? undefined,
  };
}

/**
 * Write to the buyer about one payment.
 *
 * Called after a payment is recorded, and again when a contract is filed, for
 * the letter that was waiting on it. It answers to itself: if this payment has
 * already been written about, it stops.
 */
export async function letterForPayment(paymentId: string): Promise<void> {
  const [row] = await db
    .select({
      payment: payments,
      contract: contracts,
      client: clients,
      unit: units,
      project: projects,
      installment: installments,
    })
    .from(payments)
    .innerJoin(contracts, eq(contracts.id, payments.contractId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(installments, eq(installments.id, payments.installmentId))
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!row) return;

  /* Already written about, and not merely waiting: nothing to do. */
  const [already] = await db
    .select()
    .from(automaticEmails)
    .where(eq(automaticEmails.paymentId, paymentId))
    .limit(1);
  if (already && already.status !== "WAITING") return;

  const [owed] = await db
    .select({
      due: sql<string>`coalesce(sum(${installments.totalAmount}), 0)`,
    })
    .from(installments)
    .where(eq(installments.contractId, row.contract.id));

  const [got] = await db
    .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.contractId, row.contract.id));

  const dueCents = toCents(owed?.due ?? "0");
  const paidCents = toCents(got?.paid ?? "0");
  const outstandingCents = dueCents - paidCents;

  const key = letterFor({
    stage: row.installment?.label ?? null,
    outstandingCents: dueCents > 0 ? outstandingCents : 1,
  });

  const note = async (status: "SENT" | "WAITING" | "FAILED" | "SKIPPED", reason: string) => {
    const values = {
      templateKey: key,
      contractId: row.contract.id,
      paymentId,
      clientId: row.client?.id ?? null,
      status,
      reason,
      sentAt: status === "SENT" ? new Date() : null,
      updatedAt: new Date(),
    };
    if (already) {
      await db.update(automaticEmails).set(values).where(eq(automaticEmails.id, already.id));
    } else {
      await db.insert(automaticEmails).values(values);
    }
  };

  const template = await templateByKey(key);
  if (!template) return;
  if (!template.isActive) {
    await note("SKIPPED", "This letter is switched off in the automatic emails section.");
    return;
  }

  if (!row.client?.email) {
    await note("SKIPPED", "The buyer has no email address on their record.");
    return;
  }

  /*
   * The signing letter carries the contract, so it waits for it.
   *
   * The office asked for the contract to be attached before the payment is
   * marked. Rather than refusing money that has genuinely arrived, the payment
   * is kept and the letter waits here, in plain sight in the automatic emails
   * section, and goes by itself the moment the contract is filed.
   */
  const papers: Papers[] = [];
  if (key === "paid_signing") {
    const theContract = await contractPaper(row.contract.id);
    if (!theContract) {
      await note("WAITING", "Waiting for the contract to be attached to this record.");
      return;
    }
    papers.push(theContract);
  }

  const receipt = await receiptFor(paymentId);
  if (receipt) papers.push(receipt);

  /* Their own language when the record says so, otherwise English, which is
     what the office writes in unless told otherwise. */
  const locale = (row.client.country ?? "").toLowerCase().includes("cyprus") ? "el" : "en";
  const money = (cents: number) => formatAmount(cents, locale);

  const values: Record<string, string> = {
    first_name: row.client.firstName ?? "",
    last_name: row.client.lastName ?? "",
    name: `${row.client.firstName ?? ""} ${row.client.lastName ?? ""}`.trim(),
    unit: row.unit?.code ?? row.contract.reference ?? "",
    project: row.project?.name ?? "",
    amount: money(toCents(row.payment.amount)),
    stage: row.installment?.label ?? "",
    outstanding: money(Math.max(0, outstandingCents)),
    reference: row.contract.reference ?? "",
    receipt_number: row.payment.receiptNumber ?? "",
  };

  const subject = fill(
    (locale === "el" ? template.subjectEl : template.subject) || template.subject || "",
    values,
  );
  const body = fill((locale === "el" ? template.bodyEl : template.body) || template.body, values);

  const result = await sendAndRecord({
    channel: "EMAIL",
    recipient: {
      name: values.name,
      email: row.client.email,
      clientId: row.client.id,
    },
    subject,
    body,
    /* A receipt is not marketing: it is the record of their own money. */
    withOptOut: false,
    attachments: papers,
  });

  if (result.status === "SENT") await note("SENT", "Sent.");
  else if (result.status === "SIMULATED")
    await note("SKIPPED", "Email is not set up yet, so nothing left the building.");
  else await note("FAILED", result.error ?? "It did not go.");
}

/**
 * The letters that were waiting on this contract's paperwork.
 *
 * Called when a document is filed against a contract. If the signing letter has
 * been sitting waiting for it, it goes now, with the contract attached, which
 * is what the office asked for without anybody having to remember the order.
 */
export async function sendWaitingFor(contractId: string): Promise<void> {
  const waiting = await db
    .select({ id: automaticEmails.id, paymentId: automaticEmails.paymentId })
    .from(automaticEmails)
    .where(and(eq(automaticEmails.contractId, contractId), eq(automaticEmails.status, "WAITING")))
    .orderBy(asc(automaticEmails.createdAt));

  for (const one of waiting) {
    if (one.paymentId) await letterForPayment(one.paymentId);
  }
}

/** Everything the CRM has sent by itself, newest first, for the section. */
export async function automaticHistory(limit = 30) {
  return db
    .select({
      row: automaticEmails,
      client: clients,
      contract: contracts,
    })
    .from(automaticEmails)
    .leftJoin(clients, eq(clients.id, automaticEmails.clientId))
    .leftJoin(contracts, eq(contracts.id, automaticEmails.contractId))
    .orderBy(desc(automaticEmails.createdAt))
    .limit(limit);
}
