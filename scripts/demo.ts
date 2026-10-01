/**
 * Sample data, for looking at the reports before the real records are in.
 *
 *   npm run db:demo
 *
 * Everything it writes is marked SAMPLE, so it can be found and deleted again:
 * contracts whose reference starts with SAMPLE, clients and leads with an
 * example.com address, and invoices from suppliers whose name ends in (sample).
 * Run it on a working copy, never on the office database once that is live.
 */
import { eq, like } from "drizzle-orm";
import { db } from "../src/db";
import {
  agents,
  clients,
  commissions,
  contracts,
  expenses,
  installments,
  leads,
  payments,
  projects,
  units,
} from "../src/db/schema";
import { fromCents, toCents } from "../src/lib/money";
import { DEFAULT_STAGES, EXAMPLE_SPLIT, buildSchedule } from "../src/lib/vat";

const FIRST = ["Andreas", "Maria", "Petros", "Elena", "Nikos", "Sofia", "Georgios", "Anna"];
const LAST = ["Georgiou", "Christodoulou", "Ioannou", "Charalambous", "Kyriakou", "Demetriou"];
const SUPPLIERS = [
  { name: "Larnaca Signs (sample)", category: "MARKETING" as const, amount: 180000 },
  { name: "Nea Drosia Offices (sample)", category: "RENT" as const, amount: 120000 },
  { name: "EAC (sample)", category: "BILLS" as const, amount: 34000 },
  { name: "CYTA (sample)", category: "BILLS" as const, amount: 9800 },
  { name: "Paper and Ink (sample)", category: "OFFICE" as const, amount: 24500 },
  { name: "Pavlou and Co (sample)", category: "LEGAL" as const, amount: 95000 },
];

const monthsAgo = (months: number, day = 12) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - months, day);
};

async function main() {
  const existing = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(like(contracts.reference, "SAMPLE-%"))
    .limit(1);

  if (existing[0]) {
    console.log("Sample data is already here. Delete it first if you want it made again.");
    process.exit(0);
  }

  const available = await db
    .select({ unit: units, project: projects })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(units.status, "AVAILABLE"))
    .limit(14);

  if (available.length === 0) {
    console.log("No apartments to sell. Run npm run db:seed first.");
    process.exit(0);
  }

  // Two more agents, so the commission report has something to rank.
  const agentRows = await db.select().from(agents);
  const agentIds = agentRows.map((a) => a.id);
  for (const [index, name] of ["Larnaca Homes (sample)", "Aphrodite Estates (sample)"].entries()) {
    if (agentRows.some((a) => a.name === name)) continue;
    const inserted = await db
      .insert(agents)
      .values({
        name,
        company: name,
        email: `agent${index}@example.com`,
        phone: `+357 99 20000${index}`,
        commissionRate: index === 0 ? "4.000" : "3.500",
      })
      .returning({ id: agents.id });
    agentIds.push(inserted[0].id);
  }

  let sold = 0;

  for (const [index, row] of available.entries()) {
    const monthsBack = 11 - Math.floor(index * 0.8);
    if (monthsBack < 0) break;

    const first = FIRST[index % FIRST.length];
    const last = LAST[index % LAST.length];

    const client = (
      await db
        .insert(clients)
        .values({
          firstName: first,
          lastName: `${last} (sample)`,
          email: `${first.toLowerCase()}.${index}@example.com`,
          phone: `+357 99 3000${String(index).padStart(2, "0")}`,
          country: "Cyprus",
          source: index % 3 === 0 ? "ENQUIRY" : "BUYER",
          marketingOptIn: index % 2 === 0,
          marketingOptInAt: index % 2 === 0 ? monthsAgo(monthsBack) : null,
          marketingOptInSource: index % 2 === 0 ? "contract clause" : null,
          notes: "Sample data. Delete before going live.",
        })
        .returning({ id: clients.id })
    )[0];

    // Sold a little above or a little below the asking price, the way they are.
    const listCents = toCents(row.unit.netPrice);
    const netCents = Math.round(listCents * (1 + ((index % 5) - 2) / 100));
    const rate = 19;
    const agentId = agentIds.length > 0 ? agentIds[index % agentIds.length] : null;
    const contractDate = monthsAgo(monthsBack, 5 + (index % 20));

    const contract = (
      await db
        .insert(contracts)
        .values({
          reference: `SAMPLE-${String(index + 1).padStart(4, "0")}`,
          unitId: row.unit.id,
          clientId: client.id,
          agentId,
          contractDate,
          netPrice: fromCents(netCents),
          vatRate: rate.toFixed(3),
          scheduleType: "STANDARD",
          status: "ACTIVE",
          notes: "Sample data. Delete before going live.",
        })
        .returning({ id: contracts.id })
    )[0];

    const plan = DEFAULT_STAGES.map((stage, i) => ({
      seq: i + 1,
      label: stage.label,
      /* Made up money, so the demonstration has something in it. */
      percentage: EXAMPLE_SPLIT[i] ?? 0,
      locked: false,
    }));
    const lines = buildSchedule({ netCents, rate }, plan);

    const inserted = await db
      .insert(installments)
      .values(
        lines.map((line, i) => {
          const due = new Date(contractDate);
          due.setMonth(due.getMonth() + i * 3);
          return {
            contractId: contract.id,
            seq: line.seq,
            label: line.label,
            labelEl: DEFAULT_STAGES[i]?.labelEl ?? null,
            percentage: line.percentage.toFixed(4),
            netAmount: fromCents(line.netCents),
            vatAmount: fromCents(line.vatCents),
            totalAmount: fromCents(line.totalCents),
            vatRateApplied: line.rateApplied.toFixed(3),
            dueDate: due,
          };
        }),
      )
      .returning({
        id: installments.id,
        seq: installments.seq,
        total: installments.totalAmount,
        dueDate: installments.dueDate,
      });

    // Paid up to where the build has got to, except every fourth buyer, who
    // stopped after the first two stages. That is what gives the ageing report
    // something to show, which is the whole point of sample data.
    const behind = index % 4 === 0;
    for (const line of inserted) {
      const due = line.dueDate ? new Date(line.dueDate) : null;
      if (!due || due > new Date()) continue;
      if (behind && line.seq > 2) continue;

      await db.insert(payments).values({
        contractId: contract.id,
        installmentId: line.id,
        amount: line.total,
        paidOn: new Date(due.getTime() + 3 * 24 * 60 * 60 * 1000),
        method: "bank transfer",
        receiptNumber: `SAMPLE-R-${index + 1}-${line.seq}`,
      });

      await db
        .update(installments)
        .set({ lockedAt: new Date() })
        .where(eq(installments.id, line.id));
    }

    await db
      .update(units)
      .set({ status: "SOLD", clientId: client.id })
      .where(eq(units.id, row.unit.id));

    if (agentId) {
      const agent = agentRows.find((a) => a.id === agentId);
      const commissionRate = Number(agent?.commissionRate ?? 4);
      await db.insert(commissions).values({
        contractId: contract.id,
        agentId,
        kind: "RATE",
        baseAmount: fromCents(netCents),
        rate: commissionRate.toFixed(3),
        amount: fromCents(Math.round((netCents * commissionRate) / 100)),
      });
    }

    sold += 1;
  }

  // Leads, spread over the year and over the ways they arrive.
  const sources = ["WEBSITE", "ENQUIRY", "AGENT", "WHATSAPP", "OTHER"] as const;
  for (let index = 0; index < 40; index += 1) {
    const monthsBack = index % 12;
    const source = sources[index % sources.length];
    const converted = index % 5 === 0;
    await db.insert(leads).values({
      firstName: FIRST[index % FIRST.length],
      lastName: `${LAST[index % LAST.length]} (sample)`,
      email: `lead${index}@example.com`,
      phone: `+357 99 4000${String(index).padStart(2, "0")}`,
      message: "Sample lead. Delete before going live.",
      sourceKind: source,
      source: source.toLowerCase(),
      status: converted ? "CONVERTED" : index % 3 === 0 ? "CONTACTED" : "NEW",
      createdAt: monthsAgo(monthsBack, 3 + (index % 25)),
      updatedAt: monthsAgo(monthsBack, 3 + (index % 25)),
    });
  }

  // What the company pays, every month, so the costs report has a shape.
  for (let monthsBack = 0; monthsBack < 12; monthsBack += 1) {
    for (const supplier of SUPPLIERS) {
      if (supplier.category === "LEGAL" && monthsBack % 3 !== 0) continue;
      if (supplier.category === "MARKETING" && monthsBack % 2 !== 0) continue;

      const issued = monthsAgo(monthsBack, 4);
      const due = new Date(issued);
      due.setDate(due.getDate() + 30);
      const net = supplier.amount;
      const vat = Math.round(net * 0.19);
      const paid = monthsBack === 0 ? 0 : net + vat;

      await db.insert(expenses).values({
        supplier: supplier.name,
        category: supplier.category,
        reference: `SMP-${monthsBack}-${supplier.category}`,
        description: "Sample invoice. Delete before going live.",
        issueDate: issued,
        dueDate: due,
        netAmount: fromCents(net),
        vatAmount: fromCents(vat),
        totalAmount: fromCents(net + vat),
        paidAmount: fromCents(paid),
        status: paid === 0 ? "UNPAID" : "PAID",
        paidOn: paid === 0 ? null : due,
      });
    }
  }

  console.log(`Sample data written: ${sold} sales, 40 leads, a year of invoices.`);
  console.log("Everything it wrote is marked SAMPLE or (sample), so it can be found and removed.");
  process.exit(0);
}

main();
