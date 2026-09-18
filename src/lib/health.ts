import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Is the database up to date with the code?
 *
 * A migration that has not been run shows itself as a raw SQL error on
 * whichever page happens to ask first, which tells the person nothing they can
 * act on. So the parts the code needs are checked once, at the door, and if
 * anything is missing the CRM says exactly that and exactly what to run.
 *
 * The answer is remembered for the life of the process, because a database
 * that is up to date does not become out of date while the app is running, and
 * this must not add a query to every page load.
 */

type Missing = { what: string; migration: string };

/** What each release added, newest last. */
const NEEDS: { probe: string; what: string; migration: string }[] = [
  {
    probe: "select user_id from dashboard_layouts limit 1",
    what: "the dashboard_layouts table",
    migration: "0012",
  },
  {
    probe: "select id from saved_views limit 1",
    what: "the saved_views table",
    migration: "0013",
  },
  {
    probe: "select user_id from list_settings limit 1",
    what: "the list_settings table",
    migration: "0013",
  },
  {
    probe: "select deleted_at from leads limit 1",
    what: "the deleted_at column on leads",
    migration: "0013",
  },
  {
    probe: "select deleted_at from clients limit 1",
    what: "the deleted_at column on clients",
    migration: "0013",
  },
  {
    probe: "select status_by_hand_at from units limit 1",
    what: "the status_by_hand_at column on units",
    migration: "0014",
  },
  {
    probe: "select status_by_hand_at from projects limit 1",
    what: "the status_by_hand_at column on projects",
    migration: "0014",
  },
  {
    probe: "select body from lead_notes limit 1",
    what: "the lead_notes table",
    migration: "0015",
  },
  {
    probe: "select agent_id from leads limit 1",
    what: "the agent_id column on leads",
    migration: "0016",
  },
  {
    probe: "select vat_rate from units limit 1",
    what: "the vat_rate column on units",
    migration: "0018",
  },
  {
    probe: "select kind, cash_amount from contracts limit 1",
    what: "the kind and cash_amount columns on contracts",
    migration: "0018",
  },
  {
    probe: "select holder from subowner_shares limit 1",
    what: "the subowner_shares table",
    migration: "0018",
  },
  {
    probe: "select name from subowner_directors limit 1",
    what: "the subowner_directors table",
    migration: "0018",
  },
  {
    probe: "select commission_id from documents limit 1",
    what: "the commission_id column on documents",
    migration: "0019",
  },
  {
    probe: "select completed_at from commissions limit 1",
    what: "the completed_at column on commissions",
    migration: "0019",
  },
  {
    probe: "select share_percent, plot_reference from contracts limit 1",
    what: "the land exchange columns on contracts",
    migration: "0020",
  },
  {
    probe: "select unit_id from contract_units limit 1",
    what: "the contract_units table",
    migration: "0020",
  },
];

let answer: Missing[] | null = null;
let attempt: Promise<"done" | "skipped" | "failed"> | null = null;

export async function schemaGaps(): Promise<Missing[]> {
  if (answer !== null) return answer;

  const gaps: Missing[] = [];

  for (const need of NEEDS) {
    try {
      await db.execute(sql.raw(need.probe));
    } catch {
      gaps.push({ what: need.what, migration: need.migration });
    }
  }

  answer = gaps;
  return gaps;
}

/** Forget the answer, for the moment after somebody has run the migration. */
export function forgetSchemaGaps(): void {
  answer = null;
}

/**
 * Make it right if it is wrong.
 *
 * The migration is run here rather than when the server boots, because this
 * runs inside the process that is already holding the database. A local
 * database allows exactly one writer, so doing it anywhere else is a coin
 * toss: this way the connection doing the migrating is the same connection
 * that will read the result.
 *
 * It is attempted once per process, however many pages ask at the same moment,
 * and if it cannot be done the gaps are returned so the screen can say so.
 */
export async function ensureSchema(): Promise<Missing[]> {
  const gaps = await schemaGaps();
  if (gaps.length === 0) return gaps;

  if (!attempt) {
    attempt = (async () => {
      const { bringSchemaUpToDate } = await import("@/db/bootstrap");
      return bringSchemaUpToDate();
    })();
  }

  const outcome = await attempt;

  if (outcome !== "done") {
    if (outcome === "skipped") {
      console.warn("  The database is behind the code. Stop the app and run npm run db:migrate.");
    }
    return gaps;
  }

  forgetSchemaGaps();
  const left = await schemaGaps();

  if (left.length === 0) {
    console.log("  The database was brought up to date.");
  } else {
    attempt = null;
  }

  return left;
}
