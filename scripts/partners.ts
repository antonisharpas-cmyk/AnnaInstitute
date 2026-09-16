/**
 * Set up the partner companies and the share each one holds.
 *
 *   npm run db:partners
 *
 * One Eleven builds some developments alone and others with a partner company.
 * The CRM keeps a line for every partner and works our own share out as the
 * rest, so a development held with Trivest at 60 shows One Eleven at 40 without
 * anybody typing a line for us, and a development of ours alone simply shows
 * 100 with no lines at all.
 *
 * This puts that in place for the developments already in the database: Trivest
 * becomes a partner company, and every development recorded as Trivest's gets a
 * Trivest line at 60. It never touches a development that already has partner
 * lines, so running it twice changes nothing the second time, and it prints
 * every decision it made rather than working quietly.
 *
 * The share can be changed afterwards on the development's own page, which is
 * where it belongs; this only saves the office from typing the first few in.
 */
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { connectionOptions, DatabaseUrlError, target } from "../src/db/url";

/** The partner, and what it holds of a development it is in. */
const PARTNER = "Trivest";
const PARTNER_SHARE = 60;

type Ask = (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;

const newId = () => randomBytes(12).toString("base64url");

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
        "would be thrown away the next time the app writes. Stop it first, then",
        "run npm run db:partners again.",
      ]);
    }
    const client = new PGlite(resolved.dataDir);
    await client.waitReady;
    ask = async (text, values = []) =>
      (await client.query(text, values)).rows as Record<string, unknown>[];
    close = () => client.close();
  } else {
    const client = postgres(resolved.url, { ...connectionOptions(1), connect_timeout: 10 });
    ask = async (text, values = []) =>
      (await client.unsafe(text, values as never[])) as unknown as Record<string, unknown>[];
    close = () => client.end();
  }

  // 1. The partner company itself, matched by name so this is safe to repeat.
  const found = await ask("select id, name from subowners where lower(name) = lower($1) limit 1", [
    PARTNER,
  ]);

  let partnerId = found[0] ? String(found[0].id) : "";

  if (!partnerId) {
    partnerId = newId();
    await ask(
      "insert into subowners (id, name, company, is_active, notes) values ($1, $2, $3, true, $4)",
      [
        partnerId,
        PARTNER,
        PARTNER,
        "Added by npm run db:partners. Contact details can be filled in on the partner page.",
      ],
    );
    console.log(`  Added ${PARTNER} as a partner company.`);
  } else {
    console.log(`  ${PARTNER} is already a partner company.`);
  }

  // 2. The developments recorded as that company's.
  const theirs = await ask(
    `select p.id, p.name,
            (select count(*) from project_partners pp where pp.project_id = p.id)::int as lines
       from projects p
       left join companies c on c.id = p.company_id
      where lower(coalesce(c.name, '')) = lower($1)
      order by p.name`,
    [PARTNER],
  );

  if (theirs.length === 0) {
    console.log(`\n  No development is recorded as ${PARTNER}'s, so there is nothing to share.`);
    console.log("  Add the partner on a development's own page when you need to.\n");
    await close();
    return;
  }

  console.log("");
  for (const row of theirs) {
    const projectId = String(row.id);
    const name = String(row.name);

    if (Number(row.lines) > 0) {
      console.log(`  left alone   ${name} already has partner lines`);
      continue;
    }

    await ask(
      "insert into project_partners (id, project_id, subowner_id, share_percent, role) values ($1, $2, $3, $4, $5)",
      [newId(), projectId, partnerId, PARTNER_SHARE.toFixed(3), "Development partner"],
    );
    console.log(
      `  set          ${name}: ${PARTNER} ${PARTNER_SHARE}, One Eleven ${100 - PARTNER_SHARE}`,
    );
  }

  // 3. Say where every development now stands, so nothing is taken on trust.
  const all = await ask(
    `select p.name,
            coalesce(sum(pp.share_percent), 0)::float as taken
       from projects p
       left join project_partners pp on pp.project_id = p.id
      group by p.id, p.name
      order by p.name`,
  );

  console.log("\n  Where every development stands now:\n");
  for (const row of all) {
    const taken = Number(row.taken);
    const ours = Math.max(0, 100 - taken);
    console.log(
      `  ${String(row.name).padEnd(24)} One Eleven ${ours}${taken > 0 ? `, partners ${taken}` : " (ours alone)"}`,
    );
  }

  await close();
  console.log("\n  Done. The shares can be changed on each development's own page.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
