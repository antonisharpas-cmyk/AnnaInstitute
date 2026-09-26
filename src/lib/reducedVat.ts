import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contracts, installments, issuedDocuments, payments, vatChanges } from "@/db/schema";
import { fromCents, toCents } from "@/lib/money";
import { blendedRate, modelOf, vatForNet, type VatModel } from "@/lib/vatModel";
import { issueCreditNote, issueForCreditCover, keepPdf, readDocument } from "@/lib/issued";
import { invoicePdf, longDay, stampCancelled, type IssuedSnapshot } from "@/lib/paymentPdf";
import { nextInvoiceNumber } from "@/lib/receipts";
import { lockPaidInstallments } from "@/lib/contracts";
import { followTheMoney } from "@/lib/statuses";
import { recordAudit } from "@/lib/audit";

/**
 * The buyer's reduced VAT is approved.
 *
 * The office's rule, step by step:
 *
 *  1. The stages of the Contract of Sale do not change: every amount before VAT
 *     stays as signed. Only the VAT on them moves, to the reduced rate on the
 *     part that qualifies and the standard rate on the rest.
 *  2. Every invoice already issued at the old VAT stays on the record. It is
 *     cancelled by a credit note that names it, and a stamped copy saying so is
 *     kept beside the original, so the buyer's file can match ours.
 *  3. A new invoice is issued for exactly the same payment, at the new VAT.
 *  4. The buyer has paid more VAT than they owe, which becomes a credit. It is
 *     not paid back: it is put on the next stages, in order, until it is used
 *     up. The next stage is invoiced in full and says how much the credit
 *     settled; the buyer pays the rest.
 */
export type Approval = {
  contractId: string;
  approvedOn: Date;
  /** The part of the price before VAT that qualifies for the reduced rate. */
  reducedNetCents: number;
  reducedRate: number;
  standardRate: number;
  who: { id: string; name: string; email: string };
};

export type ApprovalResult = {
  creditNotes: string[];
  invoices: string[];
  creditCents: number;
  appliedTo: string[];
  /** Anything that could not be done, to be finished on the next look. */
  errors: string[];
};

export async function approveReducedVat(approval: Approval): Promise<ApprovalResult> {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, approval.contractId))
    .limit(1);
  if (!contract) throw new Error("The contract is not there.");
  if (contract.kind !== "SALE") throw new Error("Only a sale has a reduced VAT to approve.");

  const totalNetCents = toCents(contract.netPrice);
  const model: VatModel = {
    totalNetCents,
    rate: approval.standardRate,
    reducedNetCents: Math.min(Math.max(0, approval.reducedNetCents), totalNetCents),
    reducedRate: approval.reducedRate,
    standardRate: approval.standardRate,
  };
  const rate = blendedRate(model);
  const day = longDay(approval.approvedOn.toISOString());

  /* The contract remembers the approval and its split. */
  const before = `${Number(contract.vatRate)}% on ${fromCents(totalNetCents)}`;
  await db
    .update(contracts)
    .set({
      vatRate: rate.toFixed(3),
      reducedVatNet: fromCents(model.reducedNetCents as number),
      reducedVatRate: approval.reducedRate.toFixed(3),
      standardVatRate: approval.standardRate.toFixed(3),
      reducedVatApprovedOn: approval.approvedOn,
      updatedAt: new Date(),
    })
    .where(eq(contracts.id, contract.id));

  /* 1. Every stage keeps its amount before VAT and takes the new VAT. */
  const lines = await db
    .select()
    .from(installments)
    .where(eq(installments.contractId, contract.id))
    .orderBy(asc(installments.seq));
  for (const line of lines) {
    const net = toCents(line.netAmount);
    const { vatCents } = vatForNet(net, model);
    await db
      .update(installments)
      .set({
        vatAmount: fromCents(vatCents),
        totalAmount: fromCents(net + vatCents),
        vatRateApplied: (net > 0 ? Math.round((vatCents / net) * 100 * 1000) / 1000 : rate).toFixed(
          3,
        ),
        updatedAt: new Date(),
      })
      .where(eq(installments.id, line.id));
  }
  await db.insert(vatChanges).values({
    contractId: contract.id,
    changedByEmail: approval.who.email,
    fromSummary: before,
    toSummary: `reduced VAT approved ${day}: ${approval.reducedRate}% on ${fromCents(model.reducedNetCents as number)}, ${approval.standardRate}% on the rest`,
    appliedToSeqs: lines.map((line) => line.seq).join(", "),
  });

  /* 2, 3 and 4 are their own step, so they can be finished later if
     anything stops them part way: see finishReducedVat. */
  const result = await finishReducedVat(contract.id, approval.who);

  await recordAudit({
    action: "contract.reducedVat",
    entity: "contract",
    entityId: contract.id,
    detail: `approved ${day}: ${approval.reducedRate}% on ${fromCents(model.reducedNetCents as number)}; credit notes ${result.creditNotes.join(", ") || "none"}; invoices ${result.invoices.join(", ") || "none"}; credit ${fromCents(result.creditCents)}${result.errors.length ? `; not finished: ${result.errors.join(" | ")}` : ""}`,
    userId: approval.who.id,
    userEmail: approval.who.email,
  });

  return result;
}

const busy = new Set<string>();

/**
 * Steps 2, 3 and 4 of the approval, which can be run again at any time.
 *
 * They used to run once, inside the approval. When anything stopped them part
 * way, the stages had already taken the new VAT but the VAT paid over was never
 * put on the next stage, so the next payment was asked for in full. Now each
 * step only does what is still missing: an invoice still at the old VAT is
 * credited and issued again, and money sitting on a stage above what the stage
 * now costs is moved to the next ones. Nothing done already is done twice, so
 * the contract page and the payment form call this whenever they see an
 * approved contract with money left over on a stage.
 */
export async function finishReducedVat(
  contractId: string,
  actor: { id?: string | null; name?: string | null; email?: string | null } | null = null,
): Promise<ApprovalResult> {
  const result: ApprovalResult = {
    creditNotes: [],
    invoices: [],
    creditCents: 0,
    appliedTo: [],
    errors: [],
  };
  if (busy.has(contractId)) return result;
  busy.add(contractId);
  try {
    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1);
    if (!contract?.reducedVatApprovedOn) return result;
    const model = modelOf(contract);
    const rate = blendedRate(model);
    const approval = { approvedOn: new Date(contract.reducedVatApprovedOn) };
    const day = longDay(approval.approvedOn.toISOString());
    const who = actor
      ? { id: actor.id ?? null, name: actor.name ?? null, email: actor.email ?? null }
      : null;

    /* 2 and 3. Each invoice at the old VAT: credited, stamped, and issued again. */
    const standing = await db
      .select()
      .from(issuedDocuments)
      .where(
        and(
          eq(issuedDocuments.contractId, contract.id),
          eq(issuedDocuments.kind, "INVOICE"),
          isNull(issuedDocuments.voidedAt),
          isNull(issuedDocuments.creditedById),
        ),
      )
      .orderBy(asc(issuedDocuments.issuedOn), asc(issuedDocuments.createdAt));

    for (const old of standing) {
      const net = toCents(old.netAmount);
      const oldVat = toCents(old.vatAmount);
      const oldTotal = toCents(old.totalAmount);
      const fresh = vatForNet(net, model);
      /* An invoice already at the new VAT, give or take the cent a split of a
         payment can round to, is left as it is. */
      if (Math.abs(fresh.vatCents - oldVat) <= 2) continue;
      try {
        const snap = JSON.parse(old.snapshot) as IssuedSnapshot;

        const note = await issueCreditNote({
          contractId: contract.id,
          purpose: "VAT_CHANGE",
          reason: `Reduced VAT approved on ${day}; invoice ${old.number} is reissued at the new VAT`,
          when: approval.approvedOn,
          netCents: net,
          vatCents: oldVat,
          parts: snap.parts,
          description: snap.description,
          relatesTo: old,
          who,
        });

        const number = await nextInvoiceNumber();
        const newTotal = net + fresh.vatCents;
        const snapshot: IssuedSnapshot = {
          ...snap,
          invoiceNumber: number,
          issuedOn: approval.approvedOn.toISOString(),
          vatCents: fresh.vatCents,
          totalCents: newTotal,
          rate: net > 0 ? Math.round((fresh.vatCents / net) * 100 * 1000) / 1000 : rate,
          parts: fresh.parts,
          replacesNumber: old.number,
          replacedByCreditNote: note.number,
          creditAppliedCents: undefined,
          payableCents: undefined,
        };
        const pdf = await invoicePdf(snapshot);
        const documentId = await keepPdf(
          pdf,
          `Invoice ${number}.pdf`,
          `Invoice ${number}`,
          "INVOICE",
          contract.id,
          who?.id ?? null,
        );
        const [replacement] = await db
          .insert(issuedDocuments)
          .values({
            kind: "INVOICE",
            number,
            issuedOn: approval.approvedOn,
            paymentId: old.paymentId,
            contractId: contract.id,
            clientId: old.clientId,
            netAmount: fromCents(net),
            vatAmount: fromCents(fresh.vatCents),
            vatRate: snapshot.rate.toFixed(3),
            totalAmount: fromCents(newTotal),
            snapshot: JSON.stringify(snapshot),
            documentId,
          })
          .returning();

        /* The original, kept as issued, with a stamped copy beside it. */
        let stampedDocumentId: string | null = null;
        const original = await readDocument(old.documentId);
        if (original) {
          const stamped = await stampCancelled(original, [
            `Credit note ${note.number} of ${day}`,
            `Replaced by invoice ${number}`,
          ]);
          stampedDocumentId = await keepPdf(
            stamped,
            `Invoice ${old.number} CANCELLED.pdf`,
            `Invoice ${old.number} cancelled`,
            "INVOICE",
            contract.id,
            who?.id ?? null,
          );
        }
        await db
          .update(issuedDocuments)
          .set({ creditedById: note.id, replacedById: replacement.id, stampedDocumentId })
          .where(eq(issuedDocuments.id, old.id));

        result.creditNotes.push(note.number);
        result.invoices.push(number);
        result.creditCents += oldTotal - newTotal;
      } catch (error) {
        result.errors.push(
          `invoice ${old.number}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    /* 4. The VAT paid over is put on the next stages, in order. */
    const paidRows = await db
      .select({
        installmentId: payments.installmentId,
        paid: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(eq(payments.contractId, contract.id))
      .groupBy(payments.installmentId);
    const paidBy = new Map(paidRows.map((row) => [row.installmentId, toCents(row.paid)]));
    const fresh = await db
      .select()
      .from(installments)
      .where(eq(installments.contractId, contract.id))
      .orderBy(asc(installments.seq));

    const over = fresh
      .map((line) => ({ line, cents: (paidBy.get(line.id) ?? 0) - toCents(line.totalAmount) }))
      .filter((one) => one.cents > 0);
    const open = fresh
      .map((line) => ({ line, cents: toCents(line.totalAmount) - (paidBy.get(line.id) ?? 0) }))
      .filter((one) => one.cents > 0);

    try {
      const touched = new Set<string>();
      let source = 0;
      for (const target of open) {
        while (target.cents > 0 && source < over.length) {
          const from = over[source];
          const moved = Math.min(from.cents, target.cents);
          if (moved <= 0) {
            source += 1;
            continue;
          }
          const note = `Credit from the reduced VAT approved on ${day}`;
          await db.insert(payments).values([
            {
              contractId: contract.id,
              installmentId: from.line.id,
              amount: fromCents(-moved),
              paidOn: approval.approvedOn,
              method: "CREDIT",
              kind: "CREDIT",
              notes: `${note}, moved to ${target.line.label}`,
              recordedById: who?.id ?? null,
            },
            {
              contractId: contract.id,
              installmentId: target.line.id,
              amount: fromCents(moved),
              paidOn: approval.approvedOn,
              method: "CREDIT",
              kind: "CREDIT",
              notes: `${note}, from ${from.line.label}`,
              recordedById: who?.id ?? null,
            },
          ]);
          from.cents -= moved;
          target.cents -= moved;
          touched.add(target.line.id);
          if (!result.appliedTo.includes(target.line.label))
            result.appliedTo.push(target.line.label);
          if (from.cents <= 0) source += 1;
        }
      }

      /* A stage the credit covers in full is invoiced now, settled by the credit. */
      for (const target of open) {
        if (touched.has(target.line.id) && target.cents <= 0) {
          const invoice = await issueForCreditCover(target.line.id, approval.approvedOn, who);
          if (invoice) result.invoices.push(invoice.number);
        }
      }
    } catch (error) {
      result.errors.push(`credit: ${error instanceof Error ? error.message : String(error)}`);
    }

    await lockPaidInstallments(contract.id);
    await followTheMoney(
      contract.id,
      who?.id ? { id: who.id, email: who.email ?? "system" } : null,
    );

    return result;
  } finally {
    busy.delete(contractId);
  }
}

/** True when an approved contract has money left over on a stage and a stage still owing after it. */
export function creditLeftOver(
  contract: { reducedVatApprovedOn: Date | null },
  lines: { totalCents: number; paidCents: number }[],
): boolean {
  if (!contract.reducedVatApprovedOn) return false;
  return (
    lines.some((line) => line.paidCents > line.totalCents) &&
    lines.some((line) => line.paidCents < line.totalCents)
  );
}
