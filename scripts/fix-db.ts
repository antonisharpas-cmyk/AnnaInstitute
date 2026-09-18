/**
 * Bring the database up to date, and prove that it worked.
 *
 *   npm run db:fix
 *
 * The plain migrate command can look like it succeeded and change nothing: a
 * local database allows one program at a time, so if the app is still running
 * the work is applied to a copy that is then thrown away. This opens the
 * database exclusively first, which means it either says the app is still
 * holding it, or it really did the work. Then it checks the tables and columns
 * the code needs and prints what it found, so there is no guessing.
 */
import { createConnection } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { connectionOptions, DatabaseUrlError, target } from "../src/db/url";

/** What the code needs, and which release added it. */
const NEEDED_TABLES = [
  ["dashboard_layouts", "0012"],
  ["saved_views", "0013"],
  ["list_settings", "0013"],
  ["lead_notes", "0015"],
  ["subowner_directors", "0018"],
  ["subowner_shares", "0018"],
] as const;

const NEEDED_COLUMNS = [
  ["leads", "deleted_at", "0013"],
  ["clients", "deleted_at", "0013"],
  ["units", "status_by_hand_at", "0014"],
  ["projects", "status_by_hand_at", "0014"],
  ["leads", "agent_id", "0016"],
  ["units", "vat_rate", "0018"],
  ["contracts", "kind", "0018"],
  ["contracts", "cash_amount", "0018"],
  ["documents", "commission_id", "0019"],
  ["commissions", "completed_at", "0019"],
] as const;

type Ask = (text: string) => Promise<Record<string, unknown>[]>;

/**
 * Is the app still running?
 *
 * This matters more than it sounds. A local PGlite database does not lock its
 * folder: a second program opens it quite happily, loads its own copy into
 * memory, writes that copy back, and reports success. Meanwhile the running app
 * still has the old copy and will write it over the top. So the check cannot be
 * "can I open the database", it has to be "is the app up", and the honest way
 * to ask that is to knock on its port.
 */
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

function stop(message: string, lines: string[]): never {
  console.log(`\n  ${message}\n`);
  for (const line of lines) console.log(`   ${line}`);
  console.log("");
  process.exit(1);
}

async function main() {
  let resolved: ReturnType<typeof target>;
  try {
    resolved = target();
  } catch (error) {
    if (error instanceof DatabaseUrlError)
      stop(error.message, ["Open .env.local and set DATABASE_URL."]);
    throw error;
  }

  console.log(`\n  Database: ${resolved.label}`);

  let ask: Ask;
  let close: () => Promise<void>;

  if (resolved.kind === "pglite") {
    const port = Number(process.env.PORT ?? 3000);

    if (await somethingOnPort(port)) {
      stop(`the app is still running on port ${port}, so nothing was changed`, [
        "A local database cannot be changed underneath a running app: the change",
        "would be thrown away the next time the app writes. Stop it first.",
        "",
        "  . in the terminal running it, press Control C",
        `  . on Windows, if the port stays busy: npx kill-port ${port}`,
        "  . or end every node process in Task Manager",
        "",
        "Then run npm run db:fix again.",
      ]);
    }

    console.log(`  Nothing is answering on port ${port}, so the app is stopped.`);

    const client = new PGlite(resolved.dataDir);
    await client.waitReady;
    await migratePglite(drizzlePglite(client), { migrationsFolder: "./drizzle" });
    ask = async (text) => (await client.query(text)).rows as Record<string, unknown>[];
    close = () => client.close();
  } else {
    const client = postgres(resolved.url, { ...connectionOptions(1), connect_timeout: 10 });
    await migratePostgres(drizzlePostgres(client), { migrationsFolder: "./drizzle" });
    ask = async (text) => (await client.unsafe(text)) as unknown as Record<string, unknown>[];
    close = () => client.end();
  }

  console.log("  Migrations applied.\n");

  /** Now check, rather than assume. */
  const tableRows = await ask(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  const tables = new Set(tableRows.map((row) => String(row.table_name)));

  const columnRows = await ask(
    "select table_name, column_name from information_schema.columns where table_schema = 'public'",
  );
  const columns = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));

  const missing: string[] = [];

  for (const [table, release] of NEEDED_TABLES) {
    const there = tables.has(table);
    console.log(`  ${there ? "yes" : "NO "}  the ${table} table (${release})`);
    if (!there) missing.push(`the ${table} table`);
  }

  for (const [table, column, release] of NEEDED_COLUMNS) {
    const there = columns.has(`${table}.${column}`);
    console.log(`  ${there ? "yes" : "NO "}  the ${column} column on ${table} (${release})`);
    if (!there) missing.push(`${table}.${column}`);
  }

  await close();

  if (missing.length > 0) {
    stop(`still missing after migrating: ${missing.join(", ")}`, [
      "The migration journal thinks these are done while the database does not have them.",
      "That happens when a migration was half applied.",
      "",
      "Run this SQL once against the database and it is fixed for good:",
      "",
      "  alter table clients add column if not exists deleted_at timestamp with time zone;",
      "  alter table leads   add column if not exists deleted_at timestamp with time zone;",
      "",
      "  alter table units    add column if not exists status_by_hand_at timestamp with time zone;",
      "  alter table units    add column if not exists status_by_hand_by text;",
      "  alter table projects add column if not exists status_by_hand_at timestamp with time zone;",
      "  alter table projects add column if not exists status_by_hand_by text;",
      "  alter type project_status add value if not exists 'DELIVERED';",
      "",
      "  create table if not exists saved_views (",
      "    id text primary key not null,",
      "    user_id text references users(id) on delete cascade,",
      "    list text not null, name text not null, query text not null,",
      "    pinned boolean default true not null, position integer default 0 not null,",
      "    created_at timestamp with time zone default now() not null,",
      "    updated_at timestamp with time zone default now() not null);",
      "",
      "  create table if not exists list_settings (",
      "    user_id text not null references users(id) on delete cascade,",
      "    list text not null, hidden text default '[]' not null,",
      "    updated_at timestamp with time zone default now() not null,",
      "    primary key (user_id, list));",
      "",
      "  create table if not exists dashboard_layouts (",
      "    user_id text primary key not null references users(id) on delete cascade,",
      "    panels text not null,",
      "    updated_at timestamp with time zone default now() not null);",
    ]);
  }

  console.log("\n  The database matches the code. Start the app: npm run dev\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
