/**
 * Bring in the office's own sheet of apartments, buyers and land exchanges.
 *
 *   npm run db:import1
 *
 * The source is the document the office sent on 21 September 2026: three tables
 * of apartments, one per building, with the price, the status and the buyer
 * against each one, plus the two antiparochi and two notes about how they are
 * handled. Everything here is that document, translated into English, and
 * nothing else.
 *
 * What it does, and what it deliberately does not do:
 *
 *   It fills in what was missing. Not one buyer in the CRM had an email address
 *   or a telephone number, and the document has both for every one of them.
 *
 *   It sets the price and the status of every apartment to what the document
 *   says, and puts each buyer against their apartment. An apartment the
 *   document calls available is released: its price is set and whoever was
 *   standing against it is taken off.
 *
 *   It creates the two land exchanges, with their owners, at nought VAT.
 *
 *   It never renames anybody. Six names are spelled differently in the document
 *   from the way they are in the CRM, and a script is the wrong place to decide
 *   which spelling is the person's real one. It prints both and leaves them
 *   alone, so the office can settle it in the CRM in a minute.
 *
 *   It records no client and no contract for the money paid towards an
 *   unchosen apartment in Magnum Opus Tre, because the office asked for exactly
 *   that. The instruction is written onto the development so nobody undoes it
 *   by accident.
 *
 * Run it as often as you like. Every run reads the document again and writes
 * what differs, so a second run changes nothing and says so.
 */
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { connectionOptions, DatabaseUrlError, target } from "../src/db/url";

/* --------------------------------------------------------------------------
   THE DOCUMENT

   One entry per apartment, in the document's own order. `price` is the figure
   in its Price column, null where the document shows a dash. `beds` is kept as
   the document writes it, because "1+1" is not a number and the office means
   something by it.
   -------------------------------------------------------------------------- */

type Person = {
  first: string;
  last: string;
  email?: string;
  alsoEmail?: string;
  phone?: string;
  alsoPhone?: string;
};

type Row = {
  code: string;
  beds: string;
  price: number | null;
  status: "SOLD" | "AVAILABLE";
  buyer?: Person;
};

const UNO: Row[] = [
  {
    code: "101",
    beds: "2",
    price: 170000,
    status: "SOLD",
    buyer: {
      first: "Aristotelis",
      last: "Komodromou",
      email: "a.komodromos@cytanet.com.cy",
      phone: "99 617520",
    },
  },
  {
    code: "102",
    beds: "2",
    price: 180000,
    status: "SOLD",
    buyer: {
      first: "Andreas Konstantinos Peter",
      last: "Gaughan",
      email: "mariagaughan00@gmail.com",
      phone: "99 744222",
    },
  },
  {
    code: "103",
    beds: "2",
    price: 180000,
    status: "SOLD",
    buyer: {
      first: "Constantinos Raymond",
      last: "Gaughan",
      email: "mariagaughan00@gmail.com",
      phone: "97 692169",
    },
  },
  {
    code: "104",
    beds: "2",
    price: 170000,
    status: "SOLD",
    buyer: {
      first: "Nektarios",
      last: "Siakallis",
      email: "nekarios29@hotmail.com",
      phone: "99 762507",
    },
  },
  {
    code: "201",
    beds: "1+1",
    price: 140000,
    status: "SOLD",
    buyer: {
      first: "Alina",
      last: "Ismailova",
      email: "alina_ismailova@yahoo.com",
      phone: "7 9162830455",
    },
  },
  {
    code: "202",
    beds: "2",
    price: 185000,
    status: "SOLD",
    buyer: {
      first: "Konstantinos",
      last: "Iacovides",
      email: "g.iacovides@anco.com.cy",
      phone: "96 425009",
    },
  },
  {
    code: "203",
    beds: "2",
    price: 183000,
    status: "SOLD",
    buyer: {
      first: "Stavrina Rokopou and Zenios",
      last: "Maos",
      email: "rinakopou@gmail.com",
      phone: "96 424009",
    },
  },
  {
    code: "204",
    beds: "2",
    price: 181000,
    status: "SOLD",
    buyer: {
      first: "Adamos",
      last: "Anastasiou",
      email: "anadamos2@gmail.com",
      phone: "96 424009",
    },
  },
  {
    code: "301",
    beds: "1+1",
    price: 180000,
    status: "SOLD",
    buyer: {
      first: "Panagiota",
      last: "Trifilli",
      email: "pantrifilli@gmail.com",
      phone: "97 775772",
    },
  },
  {
    code: "302",
    beds: "2",
    price: 245000,
    status: "SOLD",
    buyer: {
      first: "Maria",
      last: "Anastasiou",
      email: "marsianastasiou@gmail.com",
      alsoEmail: "mariosiosif5@gmail.com",
      phone: "99 654922",
    },
  },
  {
    code: "303",
    beds: "2",
    price: 240000,
    status: "SOLD",
    buyer: {
      first: "Ersia",
      last: "Louroutziati",
      email: "elouroutziati@gmail.com",
      phone: "99 941641",
    },
  },
  { code: "304", beds: "2", price: 260000, status: "AVAILABLE" },
];

const DUE: Row[] = [
  { code: "101", beds: "2", price: 230000, status: "AVAILABLE" },
  { code: "102", beds: "2", price: 230000, status: "AVAILABLE" },
  { code: "201", beds: "2", price: 240000, status: "AVAILABLE" },
  {
    code: "202",
    beds: "2",
    price: null,
    status: "SOLD",
    buyer: {
      first: "Maria",
      last: "Panayi",
      email: "m.p.panayi@gmail.com",
      phone: "99 646526",
    },
  },
  { code: "301", beds: "2", price: 265000, status: "AVAILABLE" },
  { code: "302", beds: "2+1", price: 275000, status: "AVAILABLE" },
  /* 401 is the Magnum Opus Due antiparochi, and is handled with the exchanges
     below rather than as a sale. */
];

const TRE: Row[] = [
  {
    code: "101",
    beds: "2",
    price: null,
    status: "SOLD",
    buyer: {
      first: "Rami Saaifan and Annie",
      last: "Abdallah",
      email: "rgsaaifan@hotmail.com",
      phone: "974 5584 8490",
    },
  },
  { code: "102", beds: "2", price: 230000, status: "AVAILABLE" },
  {
    code: "103",
    beds: "1",
    price: null,
    status: "SOLD",
    buyer: {
      first: "Rami Saaifan and Annie",
      last: "Abdallah",
      email: "rgsaaifan@hotmail.com",
      phone: "974 5584 8490",
    },
  },
  {
    code: "201",
    beds: "2",
    price: null,
    status: "SOLD",
    buyer: {
      first: "Daniele Maouad and Bassam",
      last: "Abboud",
      email: "danymaouad@gmail.com",
      alsoEmail: "dbaboud@yahoo.com",
      phone: "9613630096",
    },
  },
  { code: "202", beds: "2", price: 230000, status: "AVAILABLE" },
  { code: "203", beds: "1", price: 170000, status: "AVAILABLE" },
  {
    code: "301",
    beds: "2",
    price: null,
    status: "SOLD",
    buyer: {
      first: "Mixalis",
      last: "Athanasiou",
      email: "maria@athanasiadoulaw.com",
      alsoEmail: "mixalis.athanasiades1998@gmail.com",
      phone: "96758072",
      alsoPhone: "964000240",
    },
  },
  { code: "302", beds: "2", price: 300000, status: "AVAILABLE" },
  { code: "303", beds: "1", price: 180000, status: "AVAILABLE" },
];

const BUILDINGS: { project: string; rows: Row[] }[] = [
  { project: "MAGNUM OPUS UNO", rows: UNO },
  { project: "MAGNUM OPUS DUE", rows: DUE },
  { project: "MAGNUM OPUS TRE", rows: TRE },
];

/* --------------------------------------------------------------------------
   THE TWO LAND EXCHANGES
   -------------------------------------------------------------------------- */

/**
 * The VAT arrangement, in the office's own words, translated.
 *
 * The document says to set the VAT at nought and records something the CRM has
 * no field for: that on some exchanges One Eleven agrees to pay the VAT on the
 * apartment the owner receives. Until that has a field of its own it belongs on
 * the contract in writing, where it is read by anybody who opens it.
 */
const VAT_NOTE =
  "VAT on this land exchange is nought. On some land exchanges One Eleven agrees to cover the owner's VAT on the apartment they receive: an apartment valued at 100,000 by the Land Registry carries 19,000 of VAT at 19 per cent, and under such an agreement that is ours to pay rather than theirs.";

const EXCHANGES = [
  {
    project: "MAGNUM OPUS DUE",
    /** The apartment the owner receives, 3 bedrooms. */
    unit: "401",
    reference: "ANTIPAROCHI DUE 401",
    owner: {
      first: "Iacovos",
      last: "Iacovides",
      email: "iacovosiaco@gmail.com",
      phone: "99 443891",
    } as Person,
  },
  {
    project: "MAGNUM OPUS QUATTRO",
    /* The document names no apartment yet, so the contract carries none. */
    unit: null,
    reference: "ANTIPAROCHI QUATTRO",
    owner: {
      first: "Xriso",
      last: "Xristofi",
      phone: "99 329416",
    } as Person,
  },
];

/**
 * The instruction about Magnum Opus Tre, translated, written onto the
 * development so it cannot be lost.
 */
const TRE_NOTE =
  "Money has been received towards an apartment in this building and the buyer has not yet chosen which one. No client and no contract is recorded against that money on purpose. The apartments stay available until the buyer decides, and the office reserves the one they choose.";

/* --------------------------------------------------------------------------
   Machinery.
   -------------------------------------------------------------------------- */

type Ask = (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;

const newId = () => randomBytes(12).toString("base64url");
const money = (value: number) => value.toFixed(2);

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

/** Everything the run changed, and everything it wants the office to look at. */
const changed: string[] = [];
const asks: string[] = [];

/** One line added to a notes field, only if it is not already in there. */
function withLine(existing: string | null, line: string): string | null {
  const now = (existing ?? "").trim();
  if (now.includes(line)) return null;
  return now ? `${now}\n${line}` : line;
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
  console.log("  Source:   the office's document of 21 September 2026\n");

  let ask: Ask;
  let close: () => Promise<void>;

  if (resolved.kind === "pglite") {
    const port = Number(process.env.PORT ?? 3000);
    if (await somethingOnPort(port)) {
      stop(`the app is still running on port ${port}, so nothing was changed`, [
        "A local database cannot be changed underneath a running app: the change",
        "would be thrown away the next time the app writes. Stop it first, then",
        "run npm run db:import1 again.",
      ]);
    }
    const client = new PGlite(resolved.dataDir);
    await client.waitReady;
    await migratePglite(drizzlePglite(client), { migrationsFolder: "./drizzle" });
    ask = async (text, values = []) =>
      (await client.query(text, values)).rows as Record<string, unknown>[];
    close = () => client.close();
  } else {
    const client = postgres(resolved.url, { ...connectionOptions(1), connect_timeout: 10 });
    await migratePostgres(drizzlePostgres(client), { migrationsFolder: "./drizzle" });
    ask = async (text, values = []) =>
      (await client.unsafe(text, values as never[])) as unknown as Record<string, unknown>[];
    close = () => client.end();
  }

  /** The person this apartment is already against, if anybody. */
  const clientOf = async (clientId: string | null) => {
    if (!clientId) return null;
    const [row] = await ask(`select * from clients where id = $1 limit 1`, [clientId]);
    return (row as Record<string, string | null>) ?? null;
  };

  /**
   * The buyer for one apartment, found rather than made where possible.
   *
   * In this order: whoever is already standing against the apartment, then
   * anybody with that email address, then anybody of that exact name. Only when
   * none of those turns anybody up is a client created, which is what keeps a
   * second run from doubling everybody.
   */
  async function findOrMakeBuyer(person: Person, standing: string | null, where: string) {
    const already = await clientOf(standing);
    if (already) return already;

    if (person.email) {
      const [byEmail] = await ask(
        `select * from clients where lower(email) = lower($1) and deleted_at is null limit 1`,
        [person.email],
      );
      if (byEmail) return byEmail as Record<string, string | null>;
    }

    const [byName] = await ask(
      `select * from clients
        where lower(first_name) = lower($1) and lower(last_name) = lower($2)
          and deleted_at is null
        limit 1`,
      [person.first, person.last],
    );
    if (byName) return byName as Record<string, string | null>;

    const id = newId();
    await ask(
      `insert into clients (id, first_name, last_name, email, phone, source)
       values ($1, $2, $3, $4, $5, 'BUYER')`,
      [id, person.first, person.last, person.email ?? null, person.phone ?? null],
    );
    changed.push(`Added ${person.first} ${person.last} as a client (${where})`);
    const [made] = await ask(`select * from clients where id = $1`, [id]);
    return made as Record<string, string | null>;
  }

  /**
   * Fill in an email and a telephone number where the record has none, and put
   * a second address or number in the notes, since a client holds one of each.
   */
  async function fillIn(row: Record<string, string | null>, person: Person, where: string) {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (person.email && !row.email) {
      values.push(person.email);
      sets.push(`email = $${values.length}`);
      changed.push(`${row.first_name} ${row.last_name}: email ${person.email}`);
    }
    if (person.phone && !row.phone) {
      values.push(person.phone);
      sets.push(`phone = $${values.length}`);
      changed.push(`${row.first_name} ${row.last_name}: telephone ${person.phone}`);
    }

    const extras: string[] = [];
    if (person.alsoEmail) extras.push(`Second email address: ${person.alsoEmail}`);
    if (person.alsoPhone) extras.push(`Second telephone: ${person.alsoPhone}`);
    if (extras.length > 0) {
      const line = extras.join(". ");
      const notes = withLine(row.notes ?? null, line);
      if (notes !== null) {
        values.push(notes);
        sets.push(`notes = $${values.length}`);
        changed.push(`${row.first_name} ${row.last_name}: ${line}`);
      }
    }

    if (sets.length === 0) return;
    values.push(row.id);
    await ask(
      `update clients set ${sets.join(", ")}, updated_at = now() where id = $${values.length}`,
      values,
    );
    void where;
  }

  /**
   * The spellings that differ, gathered rather than applied.
   *
   * The document and the CRM disagree about six names, and which one is right
   * is a question for the office, not for a script. So the difference is
   * reported with both spellings and nothing is touched.
   */
  function noteTheName(row: Record<string, string | null>, person: Person, where: string) {
    const inCrm = `${row.first_name} ${row.last_name}`.trim();
    const inDoc = `${person.first} ${person.last}`.trim();
    if (inCrm.toLowerCase() === inDoc.toLowerCase()) return;
    asks.push(`${where}: the CRM says "${inCrm}", the document says "${inDoc}"`);
  }

  /* ----------------------------------------------------------------------
     1. The three tables of apartments.
     ---------------------------------------------------------------------- */

  for (const building of BUILDINGS) {
    const [project] = await ask(`select id, name, description from projects where name = $1`, [
      building.project,
    ]);
    if (!project) {
      asks.push(`${building.project} is not in the CRM, so its apartments were skipped`);
      continue;
    }

    for (const row of building.rows) {
      const [unit] = await ask(`select * from units where project_id = $1 and code = $2`, [
        project.id,
        row.code,
      ]);
      if (!unit) {
        asks.push(`${building.project} ${row.code} is not in the CRM, so it was skipped`);
        continue;
      }

      const where = `${building.project} ${row.code}`;
      const unitRow = unit as Record<string, string | null>;

      /* The price the document gives, where it gives one. */
      if (row.price !== null && Number(unitRow.net_price) !== row.price) {
        await ask(`update units set net_price = $1, updated_at = now() where id = $2`, [
          money(row.price),
          unitRow.id,
        ]);
        changed.push(
          `${where}: price ${Number(unitRow.net_price).toLocaleString("en-GB")} to ${row.price.toLocaleString("en-GB")}`,
        );

        /* Where a contract is on the apartment, the two figures have to agree,
           and when they do not the office has to know rather than the script
           picking one. */
        const [contract] = await ask(
          `select reference, net_price, cash_amount from contracts where unit_id = $1 limit 1`,
          [unitRow.id],
        );
        if (contract) {
          const full =
            Number(contract.net_price ?? 0) + Number((contract.cash_amount as string) ?? 0);
          if (Math.abs(full - row.price) > 0.5) {
            asks.push(
              `${where}: the document says ${row.price.toLocaleString("en-GB")} and contract ${String(
                contract.reference,
              )} adds up to ${full.toLocaleString("en-GB")}`,
            );
          }
        }
      }

      if (row.status === "AVAILABLE") {
        /* Released. Whoever was standing against it comes off, which is what
           the document means by available. */
        if (unitRow.client_id) {
          const person = await clientOf(unitRow.client_id);
          changed.push(
            `${where}: ${person ? `${person.first_name} ${person.last_name}` : "somebody"} taken off, the document has it available`,
          );
        }
        if (unitRow.status !== "AVAILABLE" || unitRow.client_id) {
          await ask(
            `update units set status = 'AVAILABLE', client_id = null,
                 status_by_hand_at = now(), updated_at = now()
               where id = $1`,
            [unitRow.id],
          );
          if (unitRow.status !== "AVAILABLE") {
            changed.push(`${where}: ${String(unitRow.status)} to AVAILABLE`);
          }
        }
        continue;
      }

      /* Sold, with a buyer named. */
      if (!row.buyer) continue;

      const buyer = await findOrMakeBuyer(row.buyer, unitRow.client_id, where);
      noteTheName(buyer, row.buyer, where);
      await fillIn(buyer, row.buyer, where);

      if (unitRow.client_id !== buyer.id) {
        await ask(`update units set client_id = $1, updated_at = now() where id = $2`, [
          buyer.id,
          unitRow.id,
        ]);
        changed.push(`${where}: ${buyer.first_name} ${buyer.last_name} put against it`);
      }

      if (unitRow.status !== "SOLD" && unitRow.status !== "DELIVERED") {
        await ask(
          `update units set status = 'SOLD', status_by_hand_at = now(), updated_at = now()
             where id = $1`,
          [unitRow.id],
        );
        changed.push(`${where}: ${String(unitRow.status)} to SOLD`);
      }
    }
  }

  /* ----------------------------------------------------------------------
     2. The two land exchanges.
     ---------------------------------------------------------------------- */

  for (const exchange of EXCHANGES) {
    const [project] = await ask(`select id, name from projects where name = $1`, [
      exchange.project,
    ]);
    if (!project) {
      asks.push(`${exchange.project} is not in the CRM, so its land exchange was skipped`);
      continue;
    }

    const where = `${exchange.project} antiparochi`;

    /* The owner is a client like any other, with the land owner source on them
       so the office can tell at a glance how they came to be here. */
    let [owner] = await ask(
      `select * from clients
        where lower(first_name) = lower($1) and lower(last_name) = lower($2)
          and deleted_at is null
        limit 1`,
      [exchange.owner.first, exchange.owner.last],
    );
    if (!owner) {
      const id = newId();
      await ask(
        `insert into clients (id, first_name, last_name, email, phone, source)
         values ($1, $2, $3, $4, $5, 'LAND_OWNER')`,
        [
          id,
          exchange.owner.first,
          exchange.owner.last,
          exchange.owner.email ?? null,
          exchange.owner.phone ?? null,
        ],
      );
      changed.push(
        `Added ${exchange.owner.first} ${exchange.owner.last} as a landowner (${where})`,
      );
      [owner] = await ask(`select * from clients where id = $1`, [id]);
    } else {
      await fillIn(owner as Record<string, string | null>, exchange.owner, where);
      if (owner.source !== "LAND_OWNER") {
        await ask(`update clients set source = 'LAND_OWNER', updated_at = now() where id = $1`, [
          owner.id,
        ]);
        changed.push(`${exchange.owner.first} ${exchange.owner.last}: marked as a landowner`);
      }
    }

    /* The apartment they receive, where the document names one. */
    let unitId: string | null = null;
    if (exchange.unit) {
      const [unit] = await ask(`select * from units where project_id = $1 and code = $2`, [
        project.id,
        exchange.unit,
      ]);
      if (unit) {
        unitId = String(unit.id);
        if (unit.client_id !== owner.id || unit.status !== "SOLD") {
          await ask(
            `update units set client_id = $1, status = 'SOLD',
                 status_by_hand_at = now(), updated_at = now()
               where id = $2`,
            [owner.id, unitId],
          );
          changed.push(
            `${exchange.project} ${exchange.unit}: ${exchange.owner.first} ${exchange.owner.last} receives it under the antiparochi`,
          );
        }
      } else {
        asks.push(`${exchange.project} ${exchange.unit} is not in the CRM, so it was not allotted`);
      }
    }

    const [existing] = await ask(`select * from contracts where reference = $1`, [
      exchange.reference,
    ]);

    if (existing) {
      const notes = withLine((existing.notes as string) ?? null, VAT_NOTE);
      if (notes !== null) {
        await ask(`update contracts set notes = $1, updated_at = now() where id = $2`, [
          notes,
          existing.id,
        ]);
        changed.push(`${exchange.reference}: the VAT arrangement written on it`);
      }
      /* Still without a value, which the document never gave. */
      if (Number(existing.net_price ?? 0) === 0) {
        asks.push(
          `${exchange.reference} carries no value, because the document gives none. Put the agreed value on it when you have it.`,
        );
      }
      continue;
    }

    const contractId = newId();
    await ask(
      `insert into contracts (id, reference, kind, client_id, unit_id, net_price, vat_rate,
            schedule_type, status, notes)
       values ($1, $2, 'LAND_EXCHANGE', $3, $4, '0.00', '0.000', 'STANDARD', 'DRAFT', $5)`,
      [contractId, exchange.reference, owner.id, null, VAT_NOTE],
    );

    /* The apartments an exchange covers are their own lines, because an
       exchange is rarely one apartment. */
    if (unitId) {
      await ask(`insert into contract_units (id, contract_id, unit_id) values ($1, $2, $3)`, [
        newId(),
        contractId,
        unitId,
      ]);
    }

    changed.push(
      `${exchange.reference}: land exchange written for ${exchange.owner.first} ${exchange.owner.last}, VAT nought`,
    );

    asks.push(
      `${exchange.reference} carries no value, because the document gives none. Put the agreed value on it when you have it.`,
    );
  }

  /* An apartment reading sold with nobody against it is either a mistake or
     somebody the office has not written down yet, and either way it is not for
     a script to guess at. */
  const orphans = await ask(
    `select p.name as project, u.code as code
       from units u join projects p on p.id = u.project_id
      where u.status in ('SOLD', 'DELIVERED') and u.client_id is null
      order by p.name, u.code`,
  );
  for (const row of orphans) {
    asks.push(`${String(row.project)} ${String(row.code)} reads sold with nobody against it`);
  }

  /* ----------------------------------------------------------------------
     3. The instruction about Magnum Opus Tre.
     ---------------------------------------------------------------------- */

  const [tre] = await ask(`select id, description from projects where name = $1`, [
    "MAGNUM OPUS TRE",
  ]);
  if (tre) {
    const description = withLine((tre.description as string) ?? null, TRE_NOTE);
    if (description !== null) {
      await ask(`update projects set description = $1, updated_at = now() where id = $2`, [
        description,
        tre.id,
      ]);
      changed.push("MAGNUM OPUS TRE: the note about the money with no apartment chosen yet");
    }
  }

  /* ----------------------------------------------------------------------
     What happened.
     ---------------------------------------------------------------------- */

  console.log(`  ${changed.length} change${changed.length === 1 ? "" : "s"}:\n`);
  for (const line of changed) console.log(`   ${line}`);
  if (changed.length === 0) {
    console.log("   Nothing. The CRM already says everything the document says.");
  }

  if (asks.length > 0) {
    console.log(
      `\n  ${asks.length} thing${asks.length === 1 ? "" : "s"} for the office to settle:\n`,
    );
    for (const line of asks) console.log(`   ${line}`);
    console.log("\n   Nothing above was changed. Names and figures that disagree are left as");
    console.log("   they are, because a script should not decide which of two spellings is");
    console.log("   somebody's real name or which of two prices is the agreed one.");
  }

  console.log("\n  Done. Start the app: npm start\n");
  await close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
