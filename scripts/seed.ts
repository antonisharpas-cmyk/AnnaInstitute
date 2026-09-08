/**
 * Seed the database.
 *
 *   npm run db:seed
 *
 * Creates the first administrator and the four One Eleven developments with
 * their units, plus one demonstration contract put on one of the apartments.
 * Safe to run more than once: it skips anything that already exists.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import {
  agents,
  clients,
  contractUnits,
  contracts,
  installments,
  payments,
  projects,
  units,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/passwords";
import { fromCents, toCents } from "../src/lib/money";
import { DEFAULT_STAGES, buildSchedule } from "../src/lib/vat";

type UnitSeed = {
  code: string;
  floor: string;
  bedrooms: number;
  coveredArea: number;
  verandaArea: number;
  price: number;
};

const PROJECTS: {
  name: string;
  slug: string;
  location: string;
  completionBy: string;
  description: string;
  units: UnitSeed[];
}[] = [
  {
    name: "Magnum Opus Uno",
    slug: "magnum_opus_uno",
    location: "Aradippou, Larnaca",
    completionBy: "Q2 2026",
    description: "Twelve apartments of one and two bedrooms.",
    units: Array.from({ length: 12 }, (_, i) => ({
      code: `${Math.floor(i / 4) + 1}0${(i % 4) + 1}`,
      floor: String(Math.floor(i / 4) + 1),
      bedrooms: i % 3 === 0 ? 1 : 2,
      coveredArea: i % 3 === 0 ? 62 : 84,
      verandaArea: i % 3 === 0 ? 12 : 18,
      price: 140000 + (i % 3) * 15000 + Math.floor(i / 4) * 5000,
    })),
  },
  {
    name: "Magnum Opus Due",
    slug: "magnum_opus_due",
    location: "Nea Drosia, Larnaca",
    completionBy: "Q2 2027",
    description: "Seven apartments of two and three bedrooms.",
    units: Array.from({ length: 7 }, (_, i) => ({
      code: `${Math.floor(i / 3) + 1}0${(i % 3) + 1}`,
      floor: String(Math.floor(i / 3) + 1),
      bedrooms: i % 2 === 0 ? 2 : 3,
      coveredArea: i % 2 === 0 ? 96 : 118,
      verandaArea: 20,
      price: 210000 + (i % 2) * 40000 + Math.floor(i / 3) * 6000,
    })),
  },
  {
    name: "Magnum Opus Tre",
    slug: "magnum_opus_tre",
    location: "Nea Drosia, Larnaca",
    completionBy: "Q2 2027",
    description: "Nine apartments of one and two bedrooms.",
    units: Array.from({ length: 9 }, (_, i) => ({
      code: `${Math.floor(i / 3) + 1}0${(i % 3) + 1}`,
      floor: String(Math.floor(i / 3) + 1),
      bedrooms: i % 3 === 0 ? 1 : 2,
      coveredArea: i % 3 === 0 ? 65 : 88,
      verandaArea: 15,
      price: 150000 + (i % 3) * 18000 + Math.floor(i / 3) * 5000,
    })),
  },
  {
    name: "Magnum Opus",
    slug: "magnum_opus_vergina",
    location: "Vergina, Larnaca",
    completionBy: "to be confirmed",
    description: "Details to be confirmed with the client.",
    units: [],
  },
];

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "info@ergonsite.com").toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    console.log(`Administrator ${email} already exists, left alone.`);
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD?.trim() || randomBytes(9).toString("base64url");
  await db.insert(users).values({
    email,
    name: process.env.SEED_ADMIN_NAME ?? "ErgonSite",
    passwordHash: await hashPassword(password),
    role: "ADMIN",
    locale: "en",
  });

  console.log("");
  console.log("  Administrator created");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log("  Change it after the first sign in.");
  console.log("");
}

async function seedProjects() {
  for (const p of PROJECTS) {
    const existing = await db.select().from(projects).where(eq(projects.slug, p.slug)).limit(1);
    let projectId = existing[0]?.id;

    if (!projectId) {
      const inserted = await db
        .insert(projects)
        .values({
          name: p.name,
          slug: p.slug,
          location: p.location,
          completionBy: p.completionBy,
          description: p.description,
          status: p.units.length > 0 ? "UNDER_CONSTRUCTION" : "PLANNING",
        })
        .returning({ id: projects.id });
      projectId = inserted[0].id;
      console.log(`Project created: ${p.name}`);
    }

    const alreadyThere = await db
      .select({ id: units.id })
      .from(units)
      .where(eq(units.projectId, projectId));

    if (alreadyThere.length > 0) continue;

    if (p.units.length > 0) {
      await db.insert(units).values(
        p.units.map((u) => ({
          projectId,
          code: u.code,
          floor: u.floor,
          bedrooms: u.bedrooms,
          coveredArea: u.coveredArea.toFixed(2),
          verandaArea: u.verandaArea.toFixed(2),
          parkingSpaces: 1,
          netPrice: u.price.toFixed(2),
          status: "AVAILABLE" as const,
        })),
      );
      console.log(`  ${p.units.length} units added to ${p.name}`);
    }
  }
}

/**
 * One demonstration contract, built so the two rules are visible immediately:
 * a split VAT rate, and a first installment that has been paid at 19 percent
 * while the rest of the schedule sits at the reduced rate.
 */
async function seedDemoContract() {
  const reference = "DEMO-2026-0001";
  const existing = await db
    .select()
    .from(contracts)
    .where(eq(contracts.reference, reference))
    .limit(1);
  if (existing[0]) {
    console.log("Demonstration contract already exists, left alone.");
    return;
  }

  const unitRows = await db.select().from(units).where(eq(units.status, "AVAILABLE")).limit(1);
  const unit = unitRows[0];
  if (!unit) {
    console.log("No available unit found, skipping the demonstration contract.");
    return;
  }

  const agentRows = await db.select().from(agents).limit(1);
  const agentId =
    agentRows[0]?.id ??
    (
      await db
        .insert(agents)
        .values({ name: "Demo Agent", company: "Larnaca Properties", commissionRate: "3.000" })
        .returning({ id: agents.id })
    )[0].id;

  const clientRows = await db
    .insert(clients)
    .values({
      firstName: "Demo",
      lastName: "Buyer",
      email: "demo.buyer@example.com",
      phone: "+357 99 000000",
      country: "Cyprus",
      source: "BUYER",
      marketingOptIn: false,
      notes: "Seeded example. Delete once the real data is in.",
    })
    .returning({ id: clients.id });

  const netCents = toCents("200000");
  const rate = 5;
  const setup = { netCents, rate };

  const contractRows = await db
    .insert(contracts)
    .values({
      reference,
      contractDate: new Date(),
      netPrice: fromCents(netCents),
      vatRate: rate.toFixed(3),
      scheduleType: "STANDARD",
      status: "ACTIVE",
      notes: "Seeded example. One contract, put on an apartment, with the first stage paid.",
    })
    .returning({ id: contracts.id });

  const contractId = contractRows[0].id;

  // The contract stands on its own; this row is what puts it on an apartment.
  const assignmentRows = await db
    .insert(contractUnits)
    .values({ contractId, unitId: unit.id, clientId: clientRows[0].id, agentId })
    .returning({ id: contractUnits.id });
  const assignmentId = assignmentRows[0].id;

  const plan = DEFAULT_STAGES.map((s, i) => ({
    seq: i + 1,
    label: s.label,
    percentage: s.percentage,
    locked: false,
  }));
  const lines = buildSchedule(setup, plan);

  // The contract's own plan: the shape, with no dates on it.
  await db.insert(installments).values(
    lines.map((line, i) => ({
      contractId,
      seq: line.seq,
      label: line.label,
      labelEl: DEFAULT_STAGES[i]?.labelEl ?? null,
      percentage: line.percentage.toFixed(4),
      netAmount: fromCents(line.netCents),
      vatAmount: fromCents(line.vatCents),
      totalAmount: fromCents(line.totalCents),
      vatRateApplied: line.rateApplied.toFixed(3),
    })),
  );

  // The apartment's own copy, on its own dates.
  const inserted = await db
    .insert(installments)
    .values(
      lines.map((line, i) => {
        const due = new Date();
        due.setMonth(due.getMonth() + i * 3 - 3);
        return {
          contractId,
          assignmentId,
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
    .returning({ id: installments.id, seq: installments.seq, total: installments.totalAmount });

  const first = inserted.find((i) => i.seq === 1);
  if (first) {
    await db.insert(payments).values({
      contractId,
      assignmentId,
      installmentId: first.id,
      amount: first.total,
      paidOn: new Date(),
      method: "bank transfer",
      receiptNumber: "R-0001",
    });
    await db
      .update(installments)
      .set({ lockedAt: new Date() })
      .where(eq(installments.id, first.id));
  }

  await db.update(units).set({ status: "SOLD" }).where(eq(units.id, unit.id));

  console.log(`Demonstration contract created: ${reference}`);
}

async function main() {
  try {
    await db.select({ id: users.id }).from(users).limit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/lock|EBUSY|in use/i.test(message)) {
      console.error(
        "\n  The local database is already open by another process." +
          "\n  Stop npm run dev, run this again, then start it back up.\n",
      );
      process.exit(1);
    }
    if (/relation .* does not exist/i.test(message)) {
      console.error("\n  The tables are not there yet. Run npm run db:migrate first.\n");
      process.exit(1);
    }
    throw error;
  }

  await seedAdmin();
  await seedProjects();
  await seedDemoContract();
  console.log("Seed finished.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
