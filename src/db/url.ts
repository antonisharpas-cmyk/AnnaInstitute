/**
 * Where the data lives.
 *
 * Two shapes are supported and they behave identically to the application:
 *
 *   pglite://./.localdb                        a Postgres that lives in a folder
 *                                              in this project, nothing to install
 *   postgresql://user:pass@host:5432/oneeleven  a real Postgres server, which is
 *                                              what Render gives us
 *
 * PGlite is genuine Postgres compiled to WebAssembly, so the same schema, the
 * same migrations and the same SQL run in both. Moving to Render later is one
 * line in .env.local and nothing else.
 */
import path from "node:path";

const PLACEHOLDERS = [
  "postgresql://user:password@host:5432/oneeleven",
  "postgres://user:password@host:5432/oneeleven",
];

export class DatabaseUrlError extends Error {}

export type Target =
  | { kind: "pglite"; dataDir: string; label: string }
  | { kind: "postgres"; url: string; label: string };

function raw(): string {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new DatabaseUrlError(
      'DATABASE_URL is not set. For a local database with nothing to install, put DATABASE_URL="pglite://./.localdb" in .env.local, then run npm run db:migrate and npm run db:seed.',
    );
  }

  if (
    PLACEHOLDERS.includes(value) ||
    /@host:\d+\//.test(value) ||
    value.includes("user:password@")
  ) {
    throw new DatabaseUrlError(
      'DATABASE_URL is still the example line from .env.example, so there is no database to talk to. For a local database with nothing to install, set DATABASE_URL="pglite://./.localdb". For Render, paste the External Database URL of the Postgres instance. Then run npm run db:check.',
    );
  }

  return value;
}

export function target(): Target {
  const value = raw();

  if (value.startsWith("pglite:") || value.startsWith("file:")) {
    const withoutScheme = value.replace(/^pglite:(\/\/)?/, "").replace(/^file:(\/\/)?/, "");
    const dataDir = path.resolve(process.cwd(), withoutScheme || "./.localdb");
    return {
      kind: "pglite",
      dataDir,
      label: `a local database in ${withoutScheme || "./.localdb"}`,
    };
  }

  if (!/^postgres(ql)?:\/\//.test(value)) {
    throw new DatabaseUrlError(
      `DATABASE_URL should start with postgresql:// for a server, or pglite:// for a local folder. It currently starts with ${value.slice(0, 12)}`,
    );
  }

  const url = new URL(value);
  return {
    kind: "postgres",
    url: value,
    label: `${url.hostname}:${url.port || "5432"}${url.pathname}`,
  };
}

export function databaseUrl(): string {
  const resolved = target();
  if (resolved.kind !== "postgres") {
    throw new DatabaseUrlError("This target is a local PGlite folder, not a server URL.");
  }
  return resolved.url;
}

/** A local server needs no TLS. Anything remote gets it unless told otherwise. */
export function connectionOptions(max = 5) {
  const resolved = target();
  if (resolved.kind !== "postgres") return { max, ssl: false } as const;

  const url = new URL(resolved.url);
  const host = url.hostname;
  const sslMode = url.searchParams.get("sslmode");
  const override = process.env.DATABASE_SSL;

  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.");

  let ssl: false | "require" | "prefer" = local ? false : "require";
  if (sslMode === "disable") ssl = false;
  if (sslMode === "prefer") ssl = "prefer";
  if (sslMode === "require" || sslMode === "verify-full") ssl = "require";
  if (override === "false") ssl = false;
  if (override === "true") ssl = "require";

  return { max, ssl } as const;
}

export function describeTarget(): string {
  return target().label;
}

/*
 * A database kept as a folder runs inside the app's own memory, so it is told
 * to be frugal. Postgres' own defaults are sized for a machine of its own, and
 * on a small server they would take most of the memory there is, above all
 * the first time, when the empty database is created and every migration runs.
 * The CRM's tables are small, so smaller buffers cost nothing noticeable.
 */
export function leanPglite() {
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
