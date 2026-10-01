/**
 * Apply the SQL migrations in ./drizzle to whatever DATABASE_URL points at,
 * a local PGlite folder or a real Postgres server.
 *
 *   npm run db:migrate
 *
 * Safe to run repeatedly: migrations already applied are skipped. On Render this
 * runs as part of the build, so a deploy brings the schema up to date by itself.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { connectionOptions, DatabaseUrlError, leanPglite, target } from "../src/db/url";

/**
 * A local database can only be opened by one process at a time, so this is the
 * one thing that catches people out: the development server has it open.
 */
async function openLocal(dataDir: string): Promise<PGlite> {
  try {
    const client = new PGlite(dataDir, leanPglite());
    await client.waitReady;
    return client;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/lock|EBUSY|in use/i.test(message)) {
      console.error(
        "\n  The local database is already open by another process." +
          "\n  Stop npm run dev, run this again, then start it back up.\n",
      );
      process.exit(1);
    }
    throw error;
  }
}

/*
 * A new local database starts from a ready made empty one.
 *
 * A database kept as a folder lives inside the memory of the process that
 * opens it. Creating one from nothing is by far the most expensive moment of
 * its life: about 650 MB, which a 512 MB server cannot give, so the server
 * stopped it half way and the CRM never came up. Opening one that already
 * exists takes under 200 MB. So the CRM ships an empty database, created once
 * on a machine with memory to spare (scripts/make-empty-database.mjs), and a
 * new folder is unpacked from it rather than created. The migrations then run
 * as usual and need under 300 MB.
 */
const TEMPLATE = path.join(process.cwd(), "assets", "empty-database.tgz");

function startFromTemplate(dataDir: string) {
  if (existsSync(dataDir)) return;
  if (!existsSync(TEMPLATE)) return;
  const parent = path.dirname(dataDir);
  mkdirSync(parent, { recursive: true });
  const unpacked = mkdtempSync(path.join(parent, ".oe-new-database-"));
  execFileSync("tar", ["-xzf", TEMPLATE, "-C", unpacked]);
  renameSync(path.join(unpacked, "db"), dataDir);
  rmSync(unpacked, { recursive: true, force: true });
  console.log(`  A new, empty database was set up in ${dataDir}`);
}

async function main() {
  let resolved: ReturnType<typeof target>;
  try {
    resolved = target();
  } catch (error) {
    if (error instanceof DatabaseUrlError) {
      console.error(`\n  ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  console.log(`  Applying migrations to ${resolved.label}`);

  if (resolved.kind === "pglite") {
    startFromTemplate(resolved.dataDir);
    const client = await openLocal(resolved.dataDir);
    await migratePglite(drizzlePglite(client), { migrationsFolder: "./drizzle" });
    await client.close();
  } else {
    const client = postgres(resolved.url, { ...connectionOptions(1), connect_timeout: 10 });
    await migratePostgres(drizzlePostgres(client), { migrationsFolder: "./drizzle" });
    await client.end();
  }

  console.log("  Migrations applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
