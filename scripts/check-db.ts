/**
 * Tell me why the database is not working.
 *
 *   npm run db:check
 *
 * It checks the things that go wrong, in the order they go wrong, and says what
 * to do about each one instead of printing a stack trace. Works for both a local
 * PGlite folder and a real Postgres server.
 */
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { connectionOptions, DatabaseUrlError, target } from "../src/db/url";

const EXPECTED_TABLES = [
  "users",
  "projects",
  "units",
  "clients",
  "contracts",
  "installments",
  "payments",
  "agents",
  "commissions",
  "documents",
  "campaigns",
  "messages",
  "suppressions",
];

type Rows = Record<string, unknown>[];
type Ask = (sql: string) => Promise<Rows>;

function fail(message: string, whatToDo: string[]): never {
  console.log(`\n  NOT WORKING: ${message}\n`);
  for (const line of whatToDo) console.log(`   ${line}`);
  console.log("");
  process.exit(1);
}

async function connect(): Promise<{ ask: Ask; close: () => Promise<void> }> {
  let resolved: ReturnType<typeof target>;
  try {
    resolved = target();
  } catch (error) {
    if (error instanceof DatabaseUrlError) {
      fail(error.message, [
        "1. Open .env.local",
        '2. For a local database with nothing to install: DATABASE_URL="pglite://./.localdb"',
        "3. Run npm run db:check again",
      ]);
    }
    throw error;
  }

  console.log(`\n  Target:  ${resolved.label}`);

  if (resolved.kind === "pglite") {
    let client: PGlite;
    try {
      client = new PGlite(resolved.dataDir);
      await client.waitReady;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/lock|EBUSY|in use/i.test(message)) {
        fail("the local database folder is already open by another process", [
          "A local database can only be opened by one process at a time.",
          "Stop npm run dev, then run this again.",
        ]);
      }
      fail(message, ["Delete the folder and run npm run db:migrate to start again."]);
    }

    return {
      ask: async (sql) => (await client.query(sql)).rows as Rows,
      close: () => client.close(),
    };
  }

  const client = postgres(resolved.url, { ...connectionOptions(1), connect_timeout: 10 });
  return {
    ask: async (sql) => (await client.unsafe(sql)) as unknown as Rows,
    close: () => client.end(),
  };
}

async function main() {
  const { ask, close } = await connect();
  const resolved = target();

  try {
    const [row] = await ask("select version() as version, current_database() as db");
    console.log(`  Server:   ${String(row.version).split(" ").slice(0, 2).join(" ")}`);
    console.log(`  Database: ${row.db}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string }).code ?? "";

    if (/CONNECT_TIMEOUT|ETIMEDOUT/.test(message) || code === "CONNECT_TIMEOUT") {
      fail(`${resolved.label} did not answer in time`, [
        "Usually the host name is wrong, or the database is asleep or still starting.",
        "On Render, check the database is not suspended and copy the External Database URL again.",
      ]);
    }
    if (code === "ECONNREFUSED" || /ECONNREFUSED/.test(message)) {
      fail(`nothing is listening at ${resolved.label}`, [
        "Either the address is wrong or the database is not running.",
        'For a local database with nothing to install, use DATABASE_URL="pglite://./.localdb"',
      ]);
    }
    if (code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/.test(message)) {
      fail(`the host in DATABASE_URL cannot be found: ${resolved.label}`, [
        "The host name is wrong or still a placeholder.",
        "On Render the host looks like dpg-xxxxxxxx-a.frankfurt-postgres.render.com",
      ]);
    }
    if (code === "28P01" || /password authentication failed/i.test(message)) {
      fail("the user name or password in DATABASE_URL is wrong", [
        "Copy the whole connection string again rather than typing it.",
        "A password containing @ or : must be percent encoded inside a URL.",
      ]);
    }
    if (code === "3D000" || /database .* does not exist/i.test(message)) {
      fail("that database name does not exist on the server", [
        "Check the name at the end of DATABASE_URL.",
        "Locally you can create it with: createdb oneeleven",
      ]);
    }
    if (/self signed|certificate/i.test(message)) {
      fail("the TLS certificate was refused", [
        "Add ?sslmode=require to the end of DATABASE_URL,",
        "or set DATABASE_SSL=false in .env.local for a local server.",
      ]);
    }
    fail(message, ["This one is not in the list above, so send me the line exactly as it appears."]);
  }

  const tables = await ask(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  const present = new Set(tables.map((t) => String(t.table_name)));
  const missing = EXPECTED_TABLES.filter((t) => !present.has(t));

  if (present.size === 0) {
    await close();
    fail("the database is reachable but completely empty", [
      "Run: npm run db:migrate",
      "Then: npm run db:seed",
    ]);
  }

  if (missing.length > 0) {
    await close();
    fail(`these tables are missing: ${missing.join(", ")}`, [
      "The migrations are behind the code.",
      "Run: npm run db:migrate",
    ]);
  }

  console.log(`  Tables:   ${present.size} present, nothing missing`);

  const [counted] = await ask("select count(*)::text as count from users");
  if (String(counted.count) === "0") {
    await close();
    fail("there are no users, so nobody can sign in", ["Run: npm run db:seed"]);
  }

  console.log(`  Users:    ${counted.count}`);
  const users = await ask("select email, role from users order by created_at limit 5");
  for (const u of users) console.log(`            ${u.email} (${String(u.role).toLowerCase()})`);

  const [projects] = await ask("select count(*)::text as projects from projects");
  console.log(`  Projects: ${projects.projects}`);

  await close();
  console.log("\n  Everything checks out. Run npm run dev and sign in.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
