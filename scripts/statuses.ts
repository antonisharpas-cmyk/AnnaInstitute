/**
 * Bring every apartment and development into line with the money, once.
 *
 *   npm run db:statuses
 *
 * From now on the CRM does this by itself: a payment recorded moves the
 * apartment to sold, a contract paid in full moves it to delivered, and a
 * development whose apartments are all delivered is delivered too. Records
 * entered before that rule existed have never been through it, so this walks
 * every contract once and prints what changed.
 *
 * Anything a person set by hand is left exactly as it is, here as everywhere
 * else. Running this twice changes nothing the second time.
 */
import { createConnection } from "node:net";
import { target } from "../src/db/url";

function somethingOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = (answer: boolean) => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(700);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function main() {
  const resolved = target();
  console.log(`\n  Database: ${resolved.label}`);

  if (resolved.kind === "pglite") {
    const port = Number(process.env.PORT ?? 3000);
    if (await somethingOnPort(port)) {
      console.log(
        `\n  The app is still running on port ${port}, so nothing was changed.` +
          "\n  Stop it and run npm run db:statuses again.\n",
      );
      process.exit(1);
    }
  }

  // Imported here rather than at the top, so the checks above run first.
  const { followTheMoneyEverywhere } = await import("../src/lib/statuses");
  const { db } = await import("../src/db");
  const { units, projects } = await import("../src/db/schema");
  const { sql } = await import("drizzle-orm");

  const before = await db
    .select({ status: units.status, howMany: sql<number>`count(*)::int` })
    .from(units)
    .groupBy(units.status);

  const seen = await followTheMoneyEverywhere();

  const after = await db
    .select({ status: units.status, howMany: sql<number>`count(*)::int` })
    .from(units)
    .groupBy(units.status);

  const buildings = await db
    .select({ name: projects.name, status: projects.status })
    .from(projects)
    .orderBy(projects.name);

  const count = (rows: { status: string; howMany: number }[], status: string) =>
    rows.find((row) => row.status === status)?.howMany ?? 0;

  console.log(`\n  Contracts looked at: ${seen}\n`);
  console.log("  Apartments            before   after");
  for (const status of ["AVAILABLE", "RESERVED", "SOLD", "DELIVERED"]) {
    console.log(
      `  ${status.toLowerCase().padEnd(22)}${String(count(before, status)).padStart(4)}${String(
        count(after, status),
      ).padStart(9)}`,
    );
  }

  console.log("\n  Developments now:\n");
  for (const row of buildings) {
    console.log(`  ${row.name.padEnd(24)} ${row.status.toLowerCase().replace("_", " ")}`);
  }

  console.log("\n  Done.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
