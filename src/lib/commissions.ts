/*
 * No server-only marker here: the commission rule below is also reached from
 * the payments path, which a command line script walks when it brings older
 * records into line. Nothing in this file is safe for a browser anyway, since
 * it talks to the database directly.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  clients,
  commissionPayments,
  commissions,
  contracts,
  documents,
  payments,
  projects,
  units,
} from "@/db/schema";
import { fromCents, toCents } from "./money";

export type CommissionLine = {
  id: string;
  kind: "RATE" | "EXTRA";
  label: string | null;
  baseCents: number;
  rate: number;
  amountCents: number;
  paidCents: number;
  outstandingCents: number;
  status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  /** The day the buyer's payment brought this commission into being. */
  generatedAt: Date;
  /** The day both papers were in, which is the day the agent was settled. */
  completedAt: Date | null;
};

/**
 * What an agent has earned, sale by sale.
 *
 * A sale is one contract: one apartment, one buyer. It carries the rate line and
 * any extras, and each line knows what has been paid against it, so the office
 * can settle one and leave another.
 */
export async function salesOfAgent(agentId: string) {
  const rows = await db
    .select({
      contract: contracts,
      unit: units,
      project: projects,
      client: clients,
    })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(eq(contracts.agentId, agentId))
    .orderBy(desc(contracts.createdAt));

  const contractIds = rows.map((r) => r.contract.id);

  const lines = contractIds.length
    ? await db
        .select({
          line: commissions,
          // The table name is written out rather than interpolated: on a select
          // from one table drizzle emits a bare "id", which inside this
          // subquery would bind to commission_payments and never match.
          paid: sql<string>`coalesce((select sum(cp.amount) from commission_payments cp where cp.commission_id = commissions.id), 0)`,
        })
        .from(commissions)
        .where(inArray(commissions.contractId, contractIds))
        .orderBy(asc(commissions.kind), asc(commissions.createdAt))
    : [];

  const byContract = new Map<string, CommissionLine[]>();
  for (const { line, paid } of lines) {
    const amountCents = toCents(line.amount);
    const paidCents = toCents(paid);
    const entry: CommissionLine = {
      id: line.id,
      kind: line.kind,
      label: line.label,
      baseCents: toCents(line.baseAmount),
      rate: Number(line.rate),
      amountCents,
      paidCents,
      outstandingCents: amountCents - paidCents,
      status: line.status,
      generatedAt: line.createdAt,
      completedAt: line.completedAt,
    };
    const list = byContract.get(line.contractId);
    if (list) list.push(entry);
    else byContract.set(line.contractId, [entry]);
  }

  return rows.map((r) => {
    const own = byContract.get(r.contract.id) ?? [];
    const generatedCents = own.reduce((a, l) => a + l.amountCents, 0);
    const paidCents = own.reduce((a, l) => a + l.paidCents, 0);

    // What the apartment was priced at against what it actually went for. A
    // positive difference is the usual reason for an extra line.
    const listPriceCents = r.unit ? toCents(r.unit.netPrice) : 0;
    const soldCents = toCents(r.contract.netPrice);
    const value = fullValueOf(r.contract);

    return {
      ...r,
      value,
      lines: own,
      generatedCents,
      paidCents,
      outstandingCents: generatedCents - paidCents,
      listPriceCents,
      soldCents,
      differenceCents: soldCents - listPriceCents,
    };
  });
}

/** Every commission line in the system, for the commissions section. */
export async function allCommissionLines() {
  return db
    .select({
      line: commissions,
      agent: agents,
      contract: contracts,
      unit: units,
      project: projects,
      client: clients,
      paid: sql<string>`coalesce((select sum(cp.amount) from commission_payments cp where cp.commission_id = ${commissions.id}), 0)`,
    })
    .from(commissions)
    .innerJoin(agents, eq(agents.id, commissions.agentId))
    .leftJoin(contracts, eq(contracts.id, commissions.contractId))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .orderBy(desc(commissions.createdAt));
}

/** What an agent is owed in total, without listing the sales. */
export async function commissionTotals(agentId: string) {
  const [generated] = await db
    .select({ total: sql<string>`coalesce(sum(${commissions.amount}), 0)` })
    .from(commissions)
    .where(eq(commissions.agentId, agentId));

  const [paid] = await db
    .select({ total: sql<string>`coalesce(sum(${commissionPayments.amount}), 0)` })
    .from(commissionPayments)
    .where(eq(commissionPayments.agentId, agentId));

  const generatedCents = toCents(generated?.total ?? "0");
  const paidCents = toCents(paid?.total ?? "0");
  return { generatedCents, paidCents, outstandingCents: generatedCents - paidCents };
}

/* ---------------------------------------------------------------------------
   Keeping a commission in step with its sale
   --------------------------------------------------------------------------- */

/**
 * What the agent's commission is worked out on.
 *
 * The price on the contract is not always the whole of what the buyer pays. A
 * sale agreed at 280,000 is sometimes written as 250,000 on the contract with
 * 30,000 in cash beside it, and the agent sold a 280,000 apartment either way.
 * So the base is the contract price plus whatever cash was agreed with it, and
 * both figures are kept so the office can always see how the total was reached.
 */
export function fullValueOf(contract: { netPrice: string; cashAmount?: string | null }): {
  priceCents: number;
  cashCents: number;
  fullCents: number;
} {
  const priceCents = toCents(contract.netPrice);
  const cashCents = toCents(contract.cashAmount ?? "0");
  return { priceCents, cashCents, fullCents: priceCents + cashCents };
}

export async function recalculateCommission(contractId: string) {
  const rows = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  const contract = rows[0];
  if (!contract) return;

  /**
   * A commission exists once the buyer has paid, and not before.
   *
   * The office's rule in their own words: the client signs and pays the first
   * installment, and at that moment the agent has earned their commission. A
   * contract signed last week with nothing received against it is not a
   * commission yet, and showing one would put money on the commissions page
   * that nobody owes.
   *
   * The test is the money itself rather than the apartment's status, which
   * matters more than it sounds: a status somebody set by hand no longer
   * decides whether an agent gets paid. Take the payment off again, because it
   * was recorded in error, and the line goes with it. An extra the office
   * granted by hand is left alone either way.
   */
  const [received] = await db
    .select({ paid: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(eq(payments.contractId, contractId));

  const earned = toCents(received?.paid ?? "0") > 0;

  /**
   * A commission with its paperwork on it is never withdrawn automatically.
   *
   * Once the agent's invoice or the receipt has been filed against a line, that
   * line is a piece of the office's history. A correction elsewhere must not
   * make it disappear, so it stays and somebody removes it deliberately.
   */
  const existing = await db
    .select()
    .from(commissions)
    .where(and(eq(commissions.contractId, contractId), eq(commissions.kind, "RATE")))
    .limit(1);

  const papered = existing[0]
    ? (
        await db
          .select({ n: sql<number>`count(*)::int` })
          .from(documents)
          .where(eq(documents.commissionId, existing[0].id))
      )[0]?.n > 0
    : false;

  if ((!earned || !contract.agentId) && !papered) {
    await db
      .delete(commissions)
      .where(and(eq(commissions.contractId, contractId), eq(commissions.kind, "RATE")));
    return;
  }

  if (!contract.agentId) return;

  const agentRows = await db.select().from(agents).where(eq(agents.id, contract.agentId)).limit(1);

  const rate = Number(contract.commissionRate ?? agentRows[0]?.commissionRate ?? 0);
  const { fullCents } = fullValueOf(contract);
  const amountCents = Math.round((fullCents * rate) / 100);

  await db
    .update(commissions)
    .set({ agentId: contract.agentId })
    .where(and(eq(commissions.contractId, contractId), eq(commissions.kind, "EXTRA")));

  if (existing[0]) {
    await db
      .update(commissions)
      .set({
        agentId: contract.agentId,
        baseAmount: fromCents(fullCents),
        rate: rate.toFixed(3),
        amount: fromCents(amountCents),
        updatedAt: new Date(),
      })
      .where(eq(commissions.id, existing[0].id));
    return;
  }

  await db.insert(commissions).values({
    contractId,
    agentId: contract.agentId,
    kind: "RATE",
    baseAmount: fromCents(fullCents),
    rate: rate.toFixed(3),
    amount: fromCents(amountCents),
  });
}

/**
 * The two papers that finish a commission, and what they say about it.
 *
 * The office asked for this plainly: the agent's invoice goes on the record,
 * the receipt for the money paid goes on the record, and when both are there
 * the commission is done. So the state is read off the papers rather than kept
 * as a separate flag somebody has to remember to set.
 */
export type CommissionPapers = {
  invoice: { id: string; title: string; mimeType: string | null } | null;
  receipt: { id: string; title: string; mimeType: string | null } | null;
  complete: boolean;
};

export async function papersFor(commissionIds: string[]): Promise<Map<string, CommissionPapers>> {
  const byCommission = new Map<string, CommissionPapers>();
  for (const id of commissionIds) {
    byCommission.set(id, { invoice: null, receipt: null, complete: false });
  }
  if (commissionIds.length === 0) return byCommission;

  const rows = await db
    .select({
      id: documents.id,
      commissionId: documents.commissionId,
      category: documents.category,
      title: documents.title,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .where(inArray(documents.commissionId, commissionIds))
    .orderBy(desc(documents.createdAt));

  for (const row of rows) {
    if (!row.commissionId) continue;
    const entry = byCommission.get(row.commissionId);
    if (!entry) continue;
    const file = { id: row.id, title: row.title, mimeType: row.mimeType };
    if (row.category === "AGENT_INVOICE" && !entry.invoice) entry.invoice = file;
    if (row.category === "AGENT_RECEIPT" && !entry.receipt) entry.receipt = file;
  }

  for (const entry of byCommission.values()) {
    entry.complete = Boolean(entry.invoice && entry.receipt);
  }

  return byCommission;
}

/**
 * Bring a commission's state into line with the papers filed against it.
 *
 * Called after a paper is added or taken off. Both there means the agent has
 * been paid and the line is finished; anything less puts it back to waiting, so
 * a file removed by mistake cannot leave a commission reading as settled.
 */
/** How a payment written by the papers rather than by hand is recognised. */
const FROM_THE_RECEIPT = "Recorded when the receipt was filed against this commission.";

export async function refreshCommissionPapers(commissionId: string): Promise<boolean> {
  const papers = (await papersFor([commissionId])).get(commissionId);
  const complete = Boolean(papers?.complete);

  const [line] = await db
    .select()
    .from(commissions)
    .where(eq(commissions.id, commissionId))
    .limit(1);
  if (!line) return false;

  /**
   * The receipt is the money moving, so the money says so too.
   *
   * Without this the record would read completed on one side of the page and
   * owed on the other, which is the kind of disagreement that makes somebody
   * pay an agent twice. The receipt is proof we paid, so filing it settles
   * whatever was still outstanding on the line, and taking it off again undoes
   * that and nothing else: a payment the office entered by hand is left exactly
   * where it was.
   */
  const [alreadyPaid] = await db
    .select({ total: sql<string>`coalesce(sum(${commissionPayments.amount}), 0)` })
    .from(commissionPayments)
    .where(eq(commissionPayments.commissionId, commissionId));

  const owedCents = toCents(line.amount) - toCents(alreadyPaid?.total ?? "0");

  if (complete && owedCents > 0) {
    await db.insert(commissionPayments).values({
      agentId: line.agentId,
      commissionId,
      amount: fromCents(owedCents),
      paidOn: new Date(),
      reference: null,
      notes: FROM_THE_RECEIPT,
    });
  }

  if (!complete) {
    await db
      .delete(commissionPayments)
      .where(
        and(
          eq(commissionPayments.commissionId, commissionId),
          eq(commissionPayments.notes, FROM_THE_RECEIPT),
        ),
      );
  }

  await db
    .update(commissions)
    .set({
      status: complete ? "PAID" : "PENDING",
      completedAt: complete ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(commissions.id, commissionId));

  return complete;
}

/**
 * Every contract that names no agent, for the sale recorded by hand.
 *
 * Only the ones nobody has claimed: a sale already credited to somebody is
 * changed on that sale's own line rather than by claiming it again from another
 * agent's page, which would be a quiet way of moving a commission.
 */
export async function salesWithoutAnAgent() {
  const rows = await db
    .select({
      contractId: contracts.id,
      reference: contracts.reference,
      price: contracts.netPrice,
      unitCode: units.code,
      projectName: projects.name,
      clientFirst: clients.firstName,
      clientLast: clients.lastName,
    })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .leftJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(clients, eq(clients.id, contracts.clientId))
    .where(isNull(contracts.agentId))
    .orderBy(asc(projects.name), asc(units.code))
    .limit(500);

  return rows.map((row) => ({
    contractId: row.contractId,
    label: [
      [row.projectName, row.unitCode].filter(Boolean).join(" "),
      [row.clientFirst, row.clientLast].filter(Boolean).join(" "),
      row.reference,
    ]
      .filter(Boolean)
      .join(" . "),
  }));
}
