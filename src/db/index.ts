import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "./schema";
import { connectionOptions, target } from "./url";

type Database = PostgresJsDatabase<typeof schema>;

/*
 * A database kept as a folder runs inside the app's own memory, so it is told
 * to be frugal: Postgres' own defaults are sized for a machine of its own, and
 * on a small server they would take most of the memory the app has. The CRM's
 * tables are small, so smaller buffers cost nothing noticeable.
 */
function lean() {
  const mb = (name: string, fallback: number) => {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
  };
  return {
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
      "-c", `shared_buffers=${mb("PGLITE_SHARED_BUFFERS_MB", 8)}MB`,
      "-c", "work_mem=4MB",
      "-c", "maintenance_work_mem=16MB",
      "-c", "temp_buffers=4MB",
    ],
  };
}

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
  pglite?: PGlite;
  db?: Database;
};

/**
 * The connection is made on first use rather than on import.
 *
 * That matters: if DATABASE_URL is missing or still the example line, the error
 * appears where somebody can act on it, for example the sign in screen saying the
 * database is not set up, instead of every page returning 500 because a module
 * threw while it was being loaded.
 */
function getDb(): Database {
  if (globalForDb.db) return globalForDb.db;

  const resolved = target();
  let instance: Database;

  if (resolved.kind === "pglite") {
    const client = globalForDb.pglite ?? new PGlite(resolved.dataDir, lean());
    globalForDb.pglite = client;
    instance = drizzlePglite(client, { schema }) as unknown as Database;
  } else {
    const client = globalForDb.sql ?? postgres(resolved.url, connectionOptions());
    globalForDb.sql = client;
    instance = drizzlePostgres(client, { schema });
  }

  globalForDb.db = instance;
  return instance;
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const actual = getDb() as unknown as Record<string | symbol, unknown>;
    const value = actual[property];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(actual)
      : value;
  },
  has(_target, property) {
    return property in (getDb() as unknown as object);
  },
});

export { schema };

/**
 * The client underneath, for the one job that needs it.
 *
 * Bringing the schema up to date has to happen on the very connection the app
 * is already holding: a local database can only be opened by one process at a
 * time, so a migration run from anywhere else while the app is up is either
 * refused or, worse, applied to a copy that is then thrown away. Nothing else
 * should reach past the query builder.
 */
export function driver():
  { kind: "pglite"; client: PGlite } | { kind: "postgres"; client: ReturnType<typeof postgres> } {
  getDb();

  if (globalForDb.pglite) return { kind: "pglite", client: globalForDb.pglite };
  if (globalForDb.sql) return { kind: "postgres", client: globalForDb.sql };
  throw new Error("The database has not been opened yet.");
}
