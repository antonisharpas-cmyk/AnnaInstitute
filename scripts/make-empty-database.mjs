/*
 * Make assets/empty-database.tgz: a brand new, empty local database.
 *
 *   node scripts/make-empty-database.mjs
 *
 * Creating a database from nothing takes about 650 MB of memory, more than a
 * small server has, so it is done once here and shipped. scripts/migrate.ts
 * unpacks it wherever a new local database is needed. Run this again only
 * after upgrading @electric-sql/pglite, so the empty database matches it.
 */
import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const work = mkdtempSync(path.join(tmpdir(), "oe-empty-"));
const db = new PGlite(path.join(work, "db"));
await db.waitReady;
await db.close();
const target = path.join(process.cwd(), "assets", "empty-database.tgz");
execFileSync("tar", ["-czf", target, "-C", work, "db"]);
rmSync(work, { recursive: true, force: true });
console.log(`  Written ${target}`);
