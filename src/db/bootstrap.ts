import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { driver } from "@/db";

/**
 * Bringing the database up to date without anybody having to remember a command.
 *
 * On a Postgres server this is safe and it is what happens: one database, many
 * app processes, and the migrations are applied once inside a transaction. A
 * release that adds a field is then just a deploy.
 *
 * On the local PGlite database it is deliberately NOT done, and this is the
 * important part. PGlite is a file opened by one process, held in memory by
 * that process, and written back. A second process opening the same folder does
 * not see the first one's changes and can leave the file damaged: I managed
 * exactly that while building this, which is why it is now refused rather than
 * attempted. Locally the app says what to run instead, and the command is safe
 * because the app is stopped while it runs.
 *
 * AUTO_MIGRATE=on forces it anyway, for somebody who knows their local setup
 * runs a single process; AUTO_MIGRATE=off turns it off on a server.
 */
export async function bringSchemaUpToDate(): Promise<"done" | "skipped" | "failed"> {
  const wanted = process.env.AUTO_MIGRATE;
  if (wanted === "off") return "skipped";

  let it: ReturnType<typeof driver>;
  try {
    it = driver();
  } catch {
    return "failed";
  }

  if (it.kind === "pglite" && wanted !== "on") return "skipped";

  try {
    if (it.kind === "pglite") {
      await migratePglite(drizzlePglite(it.client), { migrationsFolder: "./drizzle" });
    } else {
      await migratePostgres(drizzlePostgres(it.client), { migrationsFolder: "./drizzle" });
    }
    return "done";
  } catch (error) {
    /**
     * Never stop the app from starting over this. Somebody still has to be able
     * to sign in and read the page that explains what is wrong.
     */
    console.error(
      "The database could not be brought up to date automatically. Stop the app and run npm run db:migrate.",
      error,
    );
    return "failed";
  }
}
