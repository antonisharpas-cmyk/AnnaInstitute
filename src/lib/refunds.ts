import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contracts, issuedDocuments, refunds, units } from "@/db/schema";
import { fromCents, toCents } from "@/lib/money";
import { modelOf, splitGross, vatForNet } from "@/lib/vatModel";
import { issueCreditNote, keepPdf, snapshotFor } from "@/lib/issued";
import { acknowledgementPdf, longDay, type IssuedSnapshot } from "@/lib/paymentPdf";
import { revertCommission } from "@/lib/commissions";
import { followTheApartments } from "@/lib/statuses";
import { recordAudit } from "@/lib/audit";

/**
 * Money paid back to a buyer, by agreement.
 *
 * Two cases the office named. A goodwill refund, sometimes with the
 * reservation cancelled. And the penalty for late delivery, say €1,000 a month
 * for three months. Either way the Contract of Sale is not touched: its price
 * and stages stay as signed. A credit note is issued for the agreed amount,
 * which includes VAT at the rate the buyer paid, and an acknowledgement is
 * drawn up for the buyer to sign, saying what they received and why.
 */
export type RefundInput = {
  contractId: string;
  /** VAT_CHANGE: the VAT paid over before the reduced VAT, that no stage was left to take. */
  purpose: "REFUND" | "PENALTY" | "VAT_CHANGE";
  amountCents: number;
  paidOn: Date;
  method: string | null;
  reference: string | null;
  note: string | null;
  cancelContract: boolean;
  who: { id: string; name: string; email: string };
};

export async function recordRefund(input: RefundInput) {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, input.contractId)).limit(1);
  if (!contract) throw new Error("The contract is not there.");
  const day = longDay(input.paidOn.toISOString());
  const who = { id: input.who.id, name: input.who.name };

  /* The VAT inside the agreed amount, at the rate the buyer paid. A VAT credit
     paid back is VAT and nothing else: the price before VAT never changed. */
  const vatBack = input.purpose === "VAT_CHANGE";
  const model = modelOf(contract);
  const whole = { netCents: model.totalNetCents, vatCents: vatForNet(model.totalNetCents, model).vatCents };
  const split = vatBack
    ? { netCents: 0, vatCents: input.amountCents, parts: undefined }
    : splitGross(input.amountCents, whole, model);

  const cancelled = input.purpose === "REFUND" && input.cancelContract;
  const approvedDay = contract.reducedVatApprovedOn ? longDay(new Date(contract.reducedVatApprovedOn).toISOString()) : "";
  const reason =
    input.purpose === "PENALTY"
      ? `Compensation for the delay in completion, paid ${day}`
      : vatBack
        ? `VAT paid over before the reduced VAT approved on ${approvedDay}, paid back ${day}`
        : `Goodwill refund paid ${day}${cancelled ? ", reservation cancelled" : ""}`;

  /*
   * Nothing paid back.
   *
   * Sometimes the agreement is that no money goes back: a reservation cancelled
   * with the deposit kept, or a delay settled without compensation. There is
   * nothing to credit, so no credit note is issued, but the acknowledgement is
   * still drawn up for the client to sign, saying what was agreed.
   */
  const nothing = input.amountCents === 0;
  const note = nothing
    ? null
    : await issueCreditNote({
        contractId: contract.id,
        purpose: input.purpose,
        reason,
        when: input.paidOn,
        netCents: split.netCents,
        vatCents: split.vatCents,
        parts: split.parts,
        description: `${input.purpose === "PENALTY" ? "Delay penalty" : vatBack ? "VAT paid over, paid back after the reduced VAT" : "Goodwill refund"}${
          contract.reference ? `, contract ${contract.reference}` : ""
        }${input.note ? `. ${input.note}` : ""}`,
        who,
      });

  /* The paper the buyer signs. */
  const snapshot = note ? (JSON.parse(note.snapshot) as IssuedSnapshot) : await snapshotFor(contract.id, input.paidOn);
  const ack = await acknowledgementPdf(snapshot, {
    purpose: input.purpose,
    amountCents: input.amountCents,
    paidOn: input.paidOn.toISOString(),
    method: nothing ? "" : (input.method ?? ""),
    reference: nothing ? "" : (input.reference ?? ""),
    cancelled,
    note: input.note ?? "",
  });
  const ackId = await keepPdf(
    ack,
    note ? `${vatBack ? "VAT refund acknowledgement" : "Refund acknowledgement"} ${note.number}.pdf` : `Acknowledgement, nothing paid back ${input.paidOn.toISOString().slice(0, 10)}.pdf`,
    note ? `${vatBack ? "VAT refund acknowledgement" : "Refund acknowledgement"}, credit note ${note.number}` : "Acknowledgement, nothing paid back",
    "REFUND_ACK",
    contract.id,
    who.id,
  );

  const [refund] = await db
    .insert(refunds)
    .values({
      contractId: contract.id,
      clientId: contract.clientId,
      purpose: input.purpose,
      amount: fromCents(input.amountCents),
      paidOn: input.paidOn,
      method: nothing ? null : input.method,
      reference: nothing ? null : input.reference,
      note: input.note,
      cancelledContract: cancelled,
      creditNoteId: note?.id ?? null,
      acknowledgementDocumentId: ackId,
      recordedById: who.id,
    })
    .returning();

  if (cancelled) await cancelSale(contract.id, input.who);

  await recordAudit({
    action: `refund.${input.purpose.toLowerCase()}`,
    entity: "contract",
    entityId: contract.id,
    detail: `${fromCents(input.amountCents)}, ${note ? `credit note ${note.number}` : "nothing paid back, no credit note"}${cancelled ? ", reservation cancelled" : ""}`,
    userId: input.who.id,
    userEmail: input.who.email,
  });

  return { refund, note };
}

/**
 * The reservation cancelled with a refund: the contract is marked cancelled,
 * the apartment goes back on the market and the agent's commission is taken
 * back. Payments, papers and the contract itself all stay on the record.
 */
async function cancelSale(contractId: string, who: { id: string; name: string; email: string }) {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  if (!contract || contract.status === "CANCELLED") return;
  await db.update(contracts).set({ status: "CANCELLED", updatedAt: new Date() }).where(eq(contracts.id, contractId));
  await revertCommission(contractId);
  if (contract.unitId) {
    const [unit] = await db.select().from(units).where(eq(units.id, contract.unitId)).limit(1);
    if (unit) {
      await db
        .update(units)
        .set({ clientId: null, status: "AVAILABLE", statusByHandAt: null, statusByHandById: null, updatedAt: new Date() })
        .where(eq(units.id, unit.id));
      await followTheApartments(unit.projectId, { id: who.id, email: who.email });
    }
  }
}

/** The refunds on one contract, newest first, with their credit notes. */
export async function refundsFor(contractId: string) {
  const rows = await db
    .select({ refund: refunds, note: issuedDocuments })
    .from(refunds)
    .leftJoin(issuedDocuments, eq(issuedDocuments.id, refunds.creditNoteId))
    .where(eq(refunds.contractId, contractId))
    .orderBy(desc(refunds.paidOn));
  return rows.map((row) => ({ ...row, amountCents: toCents(row.refund.amount) }));
}
