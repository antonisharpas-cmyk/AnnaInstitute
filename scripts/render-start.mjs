/*
 * Get the database ready, then hand over to the app.
 *
 *   node scripts/render-start.mjs && next start
 *
 * Used on a server whose database is a folder on its disk, Render with a disk
 * for instance. Plain JavaScript on purpose: it needs nothing installed beyond
 * what the app itself runs on, and it uses as little memory as it can, because
 * on a 512 MB server every process counts.
 *
 * 1. A new database folder is unpacked from the empty one shipped in assets,
 *    because creating one from nothing takes more memory than the server has.
 * 2. The migrations are applied, so the tables match the code.
 * 3. The first administrator is created from SEED_ADMIN_EMAIL and
 *    SEED_ADMIN_PASSWORD, once. Nothing else is added: no sample data.
 *
 * Then it exits, and the start command starts the app. With a real Postgres
 * (DATABASE_URL starting postgresql://) it only applies the migrations.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const raw = (process.env.DATABASE_URL ?? "").trim();
if (!raw) {
  console.error("  DATABASE_URL is not set. For a database on the disk: pglite:///var/data/crm");
  process.exit(1);
}

const local = raw.startsWith("pglite:") || raw.startsWith("file:");

/* The same frugal settings the app opens it with (src/db/url.ts). */
const LEAN = {
  startParams: [
    "--single", "-F", "-O", "-j",
    "-c", "search_path=public",
    "-c", "exit_on_error=false",
    "-c", "log_checkpoints=false",
    "-c", "max_worker_processes=0",
    "-c", "max_parallel_workers=0",
    "-c", "max_parallel_workers_per_gather=0",
    "-c", "io_method=sync",
    "-c", "max_parallel_maintenance_workers=0",
    "-c", "shared_buffers=8MB",
    "-c", "work_mem=4MB",
    "-c", "maintenance_work_mem=16MB",
    "-c", "temp_buffers=4MB",
  ],
};

function startFromTemplate(dataDir) {
  if (existsSync(dataDir)) return;
  const template = path.join(process.cwd(), "assets", "empty-database.tgz");
  if (!existsSync(template)) return;
  const parent = path.dirname(dataDir);
  mkdirSync(parent, { recursive: true });
  const unpacked = mkdtempSync(path.join(parent, ".oe-new-database-"));
  execFileSync("tar", ["-xzf", template, "-C", unpacked]);
  renameSync(path.join(unpacked, "db"), dataDir);
  rmSync(unpacked, { recursive: true, force: true });
  console.log(`  A new, empty database was set up in ${dataDir}`);
}

async function firstAdministrator(query) {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email) return;
  const found = await query("select id from users where email = $1 limit 1", [email]);
  if (found.length > 0) {
    console.log(`  Administrator ${email} is there.`);
    return;
  }
  const password = (process.env.SEED_ADMIN_PASSWORD ?? "").trim() || randomBytes(9).toString("base64url");
  await query(
    `insert into users (id, email, password_hash, name, role, locale)
     values ($1, $2, $3, $4, 'ADMIN', 'en')`,
    [randomBytes(12).toString("base64url"), email, await bcrypt.hash(password, 12), process.env.SEED_ADMIN_NAME ?? "ErgonSite"],
  );
  console.log(`  Administrator ${email} created.`);
  if (!process.env.SEED_ADMIN_PASSWORD) console.log(`  Password: ${password}  (change it after the first sign in)`);
}

async function main() {
  if (local) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const withoutScheme = raw.replace(/^pglite:(\/\/)?/, "").replace(/^file:(\/\/)?/, "");
    const dataDir = path.resolve(process.cwd(), withoutScheme || "./.localdb");

    startFromTemplate(dataDir);
    const client = new PGlite(dataDir, LEAN);
    await client.waitReady;
    console.log(`  Applying migrations to ${dataDir}`);
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    await firstAdministrator(async (sql, params) => (await client.query(sql, params)).rows);
    await client.close();
  } else {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const host = new URL(raw).hostname;
    const nearby = ["localhost", "127.0.0.1", "::1"].includes(host);
    const ssl = process.env.DATABASE_SSL === "false" || nearby ? false : "require";
    const sql = postgres(raw, { max: 1, ssl, connect_timeout: 10 });
    console.log(`  Applying migrations to ${host}`);
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    await firstAdministrator(async (text, params) => await sql.unsafe(text, params));
    await sql.end();
  }
  console.log(`  Ready. Memory used: ${(process.resourceUsage().maxRSS / 1024) | 0} MB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
