/*
 * Receipts, and the words that go in the email.
 *
 * Two of them: one to a buyer for money they have paid us, one to an agent for
 * commission we have paid them. They are built here rather than in the pages
 * that show them, because the page somebody checks before pressing send and the
 * email that then goes out have to say exactly the same thing. Two copies of
 * the same wording is how a CRM ends up emailing a figure nobody saw.
 *
 * Nothing here sends anything. Reading a receipt is free of consequences, which
 * is the point: the office looks at it, and only then presses the button.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  clients,
  commissionPayments,
  commissions,
  contracts,
  installments,
  issuedDocuments,
  payments,
  projects,
  settings,
  units,
} from "@/db/schema";
import { formatAmount, toCents } from "./money";

const METHODS: Record<string, string> = {
  CASH: "cash",
  BANK: "bank transfer",
  CHEQUE: "cheque",
  CARD: "card",
  OTHER: "other",
};

/** A number every receipt can be referred to by, built from what it is. */
export function receiptNumber(kind: "B" | "A", id: string, when: Date): string {
  const year = new Date(when).getFullYear();
  return `${kind}${year}-${id.slice(0, 6).toUpperCase()}`;
}

/**
 * The number the CRM gives a receipt of its own accord.
 *
 * The office's own running series, carried on from the printed receipt book:
 * 0014, 0015 and so on, one count for the whole company and never reset, the
 * way the book was. It is offered rather than imposed: the box on the payment
 * form arrives filled in with the next one and can be typed over on the day a
 * receipt is written out of the book by hand.
 *
 * The count is the higher of two things: where Settings says the series
 * carries on from, and one more than the highest plain number already used. So
 * a receipt written by hand as 0020 moves the series on to 0021 by itself.
 */
const GENERATED = /^(\d{1,8})$/;

/** Whether this number is one of the series rather than something typed freely. */
export function looksGenerated(value: string): boolean {
  return GENERATED.test(value.trim());
}

/** Four figures, the way the books print them: 14 becomes 0014. */
export function inSeries(n: number): string {
  return String(n).padStart(4, "0");
}

/** Where Settings says a series carries on from, read without the settings module. */
async function seriesStart(
  key: "numbers.nextReceipt" | "numbers.nextInvoice" | "numbers.nextCreditNote",
  fallback: number,
) {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const n = Number(row?.value ?? fallback);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

export async function nextReceiptNumber(_when: Date = new Date()): Promise<string> {
  void _when;
  const used = await db
    .select({ number: payments.receiptNumber })
    .from(payments)
    .where(sql`${payments.receiptNumber} ~ '^[0-9]{1,8}$'`);

  /* Receipts already issued count too, so a number stays used even after the
     payment it was for was taken off again. */
  const issued = await db
    .select({ number: issuedDocuments.number })
    .from(issuedDocuments)
    .where(and(eq(issuedDocuments.kind, "RECEIPT"), sql`${issuedDocuments.number} ~ '^[0-9]{1,8}$'`));

  let highest = 0;
  for (const row of [...used, ...issued]) highest = Math.max(highest, Number(row.number ?? 0));

  const start = await seriesStart("numbers.nextReceipt", 14);
  return inSeries(Math.max(start, highest + 1));
}

/** The next invoice number, in the invoice book's own series. */
export async function nextInvoiceNumber(): Promise<string> {
  const used = await db
    .select({ number: issuedDocuments.number })
    .from(issuedDocuments)
    .where(and(eq(issuedDocuments.kind, "INVOICE"), sql`${issuedDocuments.number} ~ '^[0-9]{1,8}$'`));

  let highest = 0;
  for (const row of used) highest = Math.max(highest, Number(row.number));

  const start = await seriesStart("numbers.nextInvoice", 16);
  return inSeries(Math.max(start, highest + 1));
}

/** The next credit note number, in its own series from 0001. */
export async function nextCreditNoteNumber(): Promise<string> {
  const used = await db
    .select({ number: issuedDocuments.number })
    .from(issuedDocuments)
    .where(and(eq(issuedDocuments.kind, "CREDIT_NOTE"), sql`${issuedDocuments.number} ~ '^[0-9]{1,8}$'`));
  let highest = 0;
  for (const row of used) highest = Math.max(highest, Number(row.number));
  const start = await seriesStart("numbers.nextCreditNote", 1);
  return inSeries(Math.max(start, highest + 1));
}

/** Is this number already on another receipt? */
export async function receiptNumberTaken(value: string): Promise<boolean> {
  const wanted = value.trim();
  if (!wanted) return false;
  const [row] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(sql`upper(${payments.receiptNumber}) = ${wanted.toUpperCase()}`)
    .limit(1);
  if (row) return true;
  const [issued] = await db
    .select({ id: issuedDocuments.id })
    .from(issuedDocuments)
    .where(and(eq(issuedDocuments.kind, "RECEIPT"), sql`upper(${issuedDocuments.number}) = ${wanted.toUpperCase()}`))
    .limit(1);
  return Boolean(issued);
}

export type BuyerReceipt = Awaited<ReturnType<typeof buyerReceipt>>;

/**
 * A receipt for one payment a buyer has made.
 *
 * It carries what the office would say on the telephone: what was paid, when,
 * how, against which apartment and stage, and where that leaves the balance.
 */
export async function buyerReceipt(paymentId: string) {
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

  if (!row) return null;

  const [owed] = await db
    .select({ due: sql<string>`coalesce(sum(${installments.totalAmount}), 0)` })
    .from(installments)
    .where(eq(installments.contractId, row.contract.id));

  const [received] = await db
    .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.contractId, row.contract.id));

  const owedCents = toCents(owed?.due ?? "0");
  const paidCents = toCents(received?.paid ?? "0");

  return {
    kind: "buyer" as const,
    number: row.payment.receiptNumber || receiptNumber("B", row.payment.id, row.payment.paidOn),
    paidOn: row.payment.paidOn,
    amountCents: toCents(row.payment.amount),
    method: row.payment.method,
    methodInWords: row.payment.method ? (METHODS[row.payment.method] ?? row.payment.method) : null,
    notes: row.payment.notes,
    client: row.client,
    contract: row.contract,
    unit: row.unit,
    project: row.project,
    stage: row.installment ? row.installment.label : null,
    owedCents,
    paidCents,
    outstandingCents: Math.max(0, owedCents - paidCents),
  };
}

export type AgentReceipt = Awaited<ReturnType<typeof agentReceipt>>;

/** A receipt for one commission payment made to an agent. */
export async function agentReceipt(paymentId: string) {
  const [row] = await db
    .select({
      payment: commissionPayments,
      agent: agents,
      commission: commissions,
      contract: contracts,
      unit: units,
      project: projects,
      client: clients,
    })
    .from(commissionPayments)
    .innerJoin(agents, eq(agents.id, commissionPayments.agentId))
    .leftJoin(commissions, eq(commissions.id, commissionPayments.commissionId))
    .leftJoin(contracts, eq(contracts.id, commissions.contractId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(eq(commissionPayments.id, paymentId))
    .limit(1);

  if (!row) return null;

  const [earned] = await db
    .select({ total: sql<string>`coalesce(sum(${commissions.amount}), 0)` })
    .from(commissions)
    .where(and(eq(commissions.agentId, row.agent.id), sql`${commissions.status} <> 'CANCELLED'`));

  const [paidSoFar] = await db
    .select({ total: sql<string>`coalesce(sum(${commissionPayments.amount}), 0)` })
    .from(commissionPayments)
    .where(eq(commissionPayments.agentId, row.agent.id));

  const earnedCents = toCents(earned?.total ?? "0");
  const paidCents = toCents(paidSoFar?.total ?? "0");

  return {
    kind: "agent" as const,
    number: row.payment.reference || receiptNumber("A", row.payment.id, row.payment.paidOn),
    paidOn: row.payment.paidOn,
    amountCents: toCents(row.payment.amount),
    notes: row.payment.notes,
    agent: row.agent,
    commission: row.commission,
    contract: row.contract,
    unit: row.unit,
    project: row.project,
    client: row.client,
    earnedCents,
    paidCents,
    outstandingCents: Math.max(0, earnedCents - paidCents),
  };
}

/**
 * The email itself.
 *
 * Plain words, no attachment: the figures are short enough to read in the
 * message, and an email that says what it says without opening anything is more
 * likely to be read and less likely to be filtered. The office can print the
 * page for the paper copy.
 */
export function buyerReceiptEmail(receipt: NonNullable<BuyerReceipt>, locale: string) {
  const name = receipt.client
    ? `${receipt.client.firstName} ${receipt.client.lastName}`.trim()
    : "";
  const what =
    receipt.project && receipt.unit ? `${receipt.project.name} ${receipt.unit.code}` : "";

  const lines = [
    name ? `Dear ${name},` : "Dear buyer,",
    "",
    `We confirm receipt of ${formatAmount(receipt.amountCents, locale)}${
      receipt.methodInWords ? ` by ${receipt.methodInWords}` : ""
    } on ${new Date(receipt.paidOn).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB")}.`,
    "",
    `Receipt number: ${receipt.number}`,
    what ? `Apartment: ${what}` : null,
    receipt.contract ? `Contract: ${receipt.contract.reference}` : null,
    receipt.stage ? `Stage: ${receipt.stage}` : null,
    "",
    `Paid to date: ${formatAmount(receipt.paidCents, locale)} of ${formatAmount(
      receipt.owedCents,
      locale,
    )}.`,
    `Remaining: ${formatAmount(receipt.outstandingCents, locale)}.`,
    "",
    "Thank you.",
    "One Eleven",
  ].filter((line) => line !== null);

  return {
    subject: `Receipt ${receipt.number}`,
    body: lines.join("\n"),
  };
}

export function agentReceiptEmail(receipt: NonNullable<AgentReceipt>, locale: string) {
  const what =
    receipt.project && receipt.unit ? `${receipt.project.name} ${receipt.unit.code}` : "";

  const lines = [
    `Dear ${receipt.agent.name},`,
    "",
    `We confirm payment of ${formatAmount(receipt.amountCents, locale)} in commission on ${new Date(
      receipt.paidOn,
    ).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB")}.`,
    "",
    `Reference: ${receipt.number}`,
    what ? `Apartment: ${what}` : null,
    receipt.client
      ? `Buyer: ${`${receipt.client.firstName} ${receipt.client.lastName}`.trim()}`
      : null,
    receipt.commission
      ? `Commission line: ${formatAmount(toCents(receipt.commission.amount), locale)} at ${Number(
          receipt.commission.rate,
        )}%`
      : null,
    "",
    `Commission earned to date: ${formatAmount(receipt.earnedCents, locale)}.`,
    `Paid to date: ${formatAmount(receipt.paidCents, locale)}.`,
    `Outstanding: ${formatAmount(receipt.outstandingCents, locale)}.`,
    "",
    "Thank you.",
    "One Eleven",
  ].filter((line) => line !== null);

  return {
    subject: `Commission payment ${receipt.number}`,
    body: lines.join("\n"),
  };
}
