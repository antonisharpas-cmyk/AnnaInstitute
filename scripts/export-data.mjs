/*
 * Pack this computer's CRM data into one file, for the server.
 *
 *   npm run data:export
 *
 * Makes oneeleven-data.tar in the project folder, holding the database folder
 * and the uploaded files. Stop the CRM first: a database copied while it is
 * open may be copied half way through a change. Upload the file from the
 * server's Settings, Move data onto this server.
 *
 * The file holds every client and payment, so it is never committed: it is in
 * .gitignore. Delete it once it is on the server.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function envValue(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((one) => one.trim().startsWith(`${name}=`));
    if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const url = envValue("DATABASE_URL") || "pglite://./.localdb";
if (!url.startsWith("pglite:") && !url.startsWith("file:")) {
  console.error("\n  This CRM uses a database server, not a local folder, so there is nothing to pack.\n");
  process.exit(1);
}
const dataDir = path.resolve(url.replace(/^pglite:(\/\/)?/, "").replace(/^file:(\/\/)?/, "") || "./.localdb");
const storage = path.resolve(envValue("STORAGE_DIR") || "./storage");

if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
  console.error(`\n  There is no database in ${dataDir}.\n`);
  process.exit(1);
}

const out = path.resolve("oneeleven-data.tar");
const parts = ["-C", path.dirname(dataDir), path.basename(dataDir)];
if (existsSync(storage)) parts.push("-C", path.dirname(storage), path.basename(storage));
execFileSync("tar", ["-cf", out, ...parts], { stdio: "inherit" });

const mb = Math.round(statSync(out).size / 1048576);
console.log(`\n  Written ${out} (${mb} MB)`);
console.log("  Upload it in the server's Settings, Move data onto this server, then delete it here.\n");
