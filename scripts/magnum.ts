/**
 * Put the real One Eleven data in, and take the practice data out.
 *
 *   npm run db:magnum
 *
 * Up to now the CRM has been carrying made up partners, made up developments
 * and made up buyers so that every screen had something to show. This replaces
 * all of it with the four Magnum Opus buildings, the two partner companies that
 * hold them, and the apartments exactly as the office's own price list has
 * them. The pictures, the architectural drawings, the brochure and the
 * technical specification are copied in from the folder the office keeps them
 * in, so the developments arrive complete rather than as four empty names.
 *
 * It is written to be run again without fear. Every run clears the same things
 * and puts the same things back, so a half finished run is fixed by running it
 * once more. What it never touches: the office's own user accounts, the agents,
 * the email templates and the saved views, because those are the office's work
 * rather than practice data.
 *
 * Where the files come from:
 *
 *   npm run db:magnum                       the PRICELIST-TABLE folder here
 *   npm run db:magnum -- "D:\\somewhere\\PRICELIST-TABLE"
 *
 * The folder is expected to hold one subfolder per building, named after it. A
 * building with no folder still gets its apartments, and the script says which
 * files it could not find rather than failing.
 */
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { connectionOptions, DatabaseUrlError, target } from "../src/db/url";

/* --------------------------------------------------------------------------
   The partner companies.
   -------------------------------------------------------------------------- */

const PARTNERS = [
  {
    name: "DEX-INNO GREEN PROPERTIES LTD",
    registryNumber: "ΗΕ 449137",
    directors: [
      {
        name: "Andreas Kailis",
        role: "Director",
        email: "andreas.moscow@gmail.com",
        emailAlternate: "dexinno@yahoo.com",
        phone: "99 616761",
      },
    ],
    shares: [
      { holder: "One Eleven", sharePercent: 50 },
      { holder: "Vladimir", sharePercent: 50 },
    ],
  },
  {
    name: "TRIVEST PROPERTY DEVELOPMENT LIMITED",
    registryNumber: "ΗΕ 476522",
    directors: [
      { name: "George", role: "Director", email: "gm@oliverlandon.com", phone: "97566567" },
      {
        name: "Adel",
        role: "Director",
        email: "adel@asa-consultants.com",
        phone: "+973 3952 1225",
      },
    ],
    shares: [
      { holder: "One Eleven", sharePercent: 33.3 },
      { holder: "Marvenus Holding", sharePercent: 33.3 },
      { holder: "ASA Consultants", sharePercent: 33.3 },
    ],
  },
];

/**
 * Two different questions, and this script answers both.
 *
 * Who owns the partner company is the block above, and it belongs to the
 * company: DEX-INNO is half ours and half Vladimir's wherever it builds. What
 * the partner holds of one development is the figure below, and it belongs to
 * that development, so the same partner can be on different terms on different
 * buildings. Keeping them apart is the whole point, because they are agreed at
 * different times with different people.
 */
const PARTNER_SHARE = 60;

/* --------------------------------------------------------------------------
   The developments, and the apartments in them.
   -------------------------------------------------------------------------- */

/**
 * The buyer of an apartment.
 *
 * The key is what makes one buyer of two apartments one record rather than two:
 * the same key on two apartments means the same person, and the second
 * apartment is added to the client already created rather than to a copy of
 * them with a number after their name.
 */
type Buyer = {
  key: string;
  firstName: string;
  lastName: string;
  /** About the person, not about the sale. */
  note?: string;
};

/** An apartment as the price list has it. */
type Apartment = {
  code: string;
  floor?: string;
  bedrooms?: number;
  covered?: number;
  veranda?: number;
  roofGarden?: number;
  parking?: number;
  /** Euro. Left out where the price list does not say, and then PRICE_UNKNOWN. */
  price?: number;
  /**
   * Nineteen per cent unless the buyer is entitled to the reduced rate, which
   * is why an apartment nobody has bought yet carries the ordinary one.
   */
  vatRate?: number;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED";
  /** What the price list says that the record has no column of its own for. */
  note?: string;
  /** Who bought it, where the office has told us. */
  buyer?: Buyer;
  /** A term of that sale: cash agreed, something held back until delivery. */
  contractNote?: string;
};

type Building = {
  name: string;
  /** UNO, DUE: the short form that goes in front of a contract reference. */
  short: string;
  slug: string;
  /** The folder its files are in, under the source folder. */
  folder: string;
  /** The partner company holding it, by name, or null for ours alone. */
  partner: string | null;
  status: "PLANNING" | "UNDER_CONSTRUCTION" | "COMPLETED" | "DELIVERED";
  location: string;
  completionBy: string;
  description: string;
  apartments: Apartment[];
};

/**
 * The price the office asked for where the list does not give one.
 *
 * An apartment with no price is an apartment nobody can quote on, and a nought
 * in a price column reads as free. Two hundred thousand is the office's own
 * stand in, obvious enough on the screen that somebody will correct it.
 */
const PRICE_UNKNOWN = 200_000;

/**
 * The four buildings, straight off the office's own price list.
 *
 * Every figure here was read from the price list picture in each building's
 * folder and nothing was rounded or filled in: internal area is the covered
 * area, the covered balcony is the veranda, and what the schema has no column
 * for, the bathrooms, the store room, the uncovered balcony and the total area,
 * is kept in the apartment's note so that the price list can still be read back
 * off the record.
 *
 * Where the price list leaves the price blank the apartment is priced at the
 * office's stand in figure, since a blank reads as free and nobody can quote on
 * it. Those are the ones to go back over.
 */
const MAGNUM_OPUS: Building[] = [
  {
    name: "MAGNUM OPUS UNO",
    short: "UNO",
    slug: "magnum-opus-uno",
    folder: "MAGNUM OPUS UNO",
    partner: "DEX-INNO GREEN PROPERTIES LTD",
    status: "UNDER_CONSTRUCTION",
    location: "Aradippou, Larnaca",
    completionBy: "Q2 2026",
    description: [
      "Apartments of 1 and 2 bedrooms, marble and HPL surfaces, spacious layouts.",
      "Green area next to a park, five minutes from Metropolis Mall, close to the Larnaca and Limassol highway.",
      "https://maps.app.goo.gl/b9baa91XZtZqKUsz7",
    ].join(" "),
    apartments: [
      {
        code: "101",
        floor: "1st",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 0,
        parking: 1,
        price: 170000,
        vatRate: 19,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 101 m2.",
        buyer: { key: "uno-komodromou", firstName: "Aristotelis", lastName: "Komodromou" },
      },
      {
        code: "102",
        floor: "1st",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 0,
        parking: 1,
        price: 180000,
        vatRate: 5,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 101 m2.",
        buyer: { key: "uno-a-gaughan", firstName: "Andreas", lastName: "Gaughan" },
      },
      {
        code: "103",
        floor: "1st",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 0,
        parking: 1,
        price: 180000,
        vatRate: 5,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 101 m2.",
        buyer: { key: "uno-k-gaughan", firstName: "Konstantinos", lastName: "Gaughan" },
      },
      {
        code: "104",
        floor: "1st",
        bedrooms: 2,
        covered: 80.3,
        veranda: 25.2,
        roofGarden: 0,
        parking: 1,
        price: 170000,
        vatRate: 5,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 105.5 m2.",
        buyer: { key: "uno-siakallis", firstName: "Nektarios", lastName: "Siakallis" },
        contractNote:
          "A further 10,000 on delivery. 10,000 will be refunded from the second payment and the buyer pays that amount on delivery.",
      },
      {
        code: "201",
        floor: "2nd",
        bedrooms: 1,
        covered: 50,
        veranda: 13,
        roofGarden: 0,
        parking: 1,
        price: 140000,
        vatRate: 5,
        status: "SOLD",
        note: "Beds 1+1. Bathrooms 1. Store room yes. Total area 98 m2.",
        buyer: { key: "uno-ismailova", firstName: "Alina", lastName: "Ismailova" },
      },
      {
        code: "202",
        floor: "2nd",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 0,
        parking: 1,
        price: 171000,
        vatRate: 5,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 101 m2.",
        buyer: { key: "uno-iakovides", firstName: "Konstantinos", lastName: "Iakovides" },
        contractNote: "15,000 in cash.",
      },
      {
        code: "203",
        floor: "2nd",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 0,
        parking: 1,
        price: 183000,
        vatRate: 5,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 101 m2.",
        buyer: { key: "uno-rokopou", firstName: "Stavrina", lastName: "Rokopou" },
      },
      {
        code: "204",
        floor: "2nd",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 0,
        parking: 1,
        price: 181000,
        vatRate: 5,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 101 m2.",
        buyer: { key: "uno-adamos", firstName: "Adamos", lastName: "Anastasiou" },
      },
      {
        code: "301",
        floor: "3rd",
        bedrooms: 1,
        covered: 50,
        veranda: 13,
        roofGarden: 42,
        parking: 1,
        price: 180000,
        vatRate: 19,
        status: "RESERVED",
        note: "Beds 1+1. Bathrooms 1. Store room yes. Total area 102 m2.",
        buyer: { key: "uno-trifilli", firstName: "Panagiota", lastName: "Trifilli" },
      },
      {
        code: "302",
        floor: "3rd",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 42,
        parking: 1,
        price: 225000,
        vatRate: 5,
        status: "RESERVED",
        note: "Bathrooms 2. Store room yes. Total area 143 m2.",
        buyer: { key: "uno-marios", firstName: "Marios", lastName: "Anastasiou" },
        contractNote: "20,000 in cash.",
      },
      {
        code: "303",
        floor: "3rd",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 42,
        parking: 1,
        price: 240000,
        vatRate: 5,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 143 m2.",
        buyer: { key: "uno-louroutziati", firstName: "Ersia", lastName: "Louroutziati" },
      },
      {
        code: "304",
        floor: "3rd",
        bedrooms: 2,
        covered: 80,
        veranda: 21,
        roofGarden: 42,
        parking: 1,
        price: 260000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 143 m2.",
      },
    ],
  },
  {
    name: "MAGNUM OPUS DUE",
    short: "DUE",
    slug: "magnum-opus-due",
    folder: "MAGNUM OPUS DUE",
    partner: "TRIVEST PROPERTY DEVELOPMENT LIMITED",
    status: "UNDER_CONSTRUCTION",
    location: "Nea Drosia, Larnaca, Metropolis area",
    completionBy: "Q2 2027",
    description: [
      "Prime location in Nea Drosia, Larnaca. Six apartments of 2 bedrooms and one of 3 bedrooms.",
      "Modern architectural design, a limited number of apartments for greater privacy, close to the hospital, the mall and schools, easy access to the highways and the city centre.",
      "https://maps.app.goo.gl/mfzPFrKpbVA5oi417",
    ].join(" "),
    apartments: [
      {
        code: "101",
        floor: "1st",
        bedrooms: 2,
        covered: 85,
        veranda: 15,
        roofGarden: 0,
        parking: 1,
        price: 230000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 100 m2.",
      },
      {
        code: "102",
        floor: "1st",
        bedrooms: 2,
        covered: 83,
        veranda: 20,
        roofGarden: 0,
        parking: 1,
        price: 230000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 103 m2.",
      },
      {
        code: "201",
        floor: "2nd",
        bedrooms: 2,
        covered: 85,
        veranda: 15,
        roofGarden: 0,
        parking: 1,
        price: 240000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 100 m2.",
      },
      {
        code: "202",
        floor: "2nd",
        bedrooms: 2,
        covered: 83,
        veranda: 20,
        roofGarden: 0,
        parking: 1,
        price: 185000,
        vatRate: 5,
        status: "RESERVED",
        note: "Bathrooms 2. Store room yes. Total area 103 m2.",
        buyer: { key: "due-panayi", firstName: "Maria", lastName: "Panayi" },
        contractNote: "20,000 in cash, paid.",
      },
      {
        code: "301",
        floor: "3rd",
        bedrooms: 2,
        covered: 85,
        veranda: 15,
        roofGarden: 0,
        parking: 1,
        price: 270000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 100 m2.",
      },
      {
        code: "302",
        floor: "3rd",
        bedrooms: 2,
        covered: 83,
        veranda: 28.5,
        roofGarden: 0,
        parking: 1,
        price: 280000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Beds 2+1. Bathrooms 2. Store room yes. Total area 111.5 m2.",
      },
      {
        code: "401",
        floor: "4th",
        bedrooms: 3,
        covered: 120,
        veranda: 33.6,
        roofGarden: 38.3,
        parking: 1,
        vatRate: 19,
        status: "SOLD",
        note: "Bathrooms 3. Store room yes. Uncovered balcony 38.5 m2. Total area 230.4 m2.",
      },
    ],
  },
  {
    name: "MAGNUM OPUS TRE",
    short: "TRE",
    slug: "magnum-opus-tre",
    folder: "MAGNUM OPUS TRE",
    partner: "TRIVEST PROPERTY DEVELOPMENT LIMITED",
    status: "UNDER_CONSTRUCTION",
    location: "Larnaca, Metropolis area",
    completionBy: "Q2 2027",
    description: [
      "Boutique residential building of three storeys. Six apartments of 2 bedrooms and three of 1 bedroom.",
      "Modern design with premium finishes, low density living for added privacy, close to the hospital, the mall and schools. An excellent location to live in or to invest in.",
      "https://maps.app.goo.gl/mfzPFrKpbVA5oi417",
    ].join(" "),
    apartments: [
      {
        code: "101",
        floor: "1st",
        bedrooms: 2,
        covered: 85,
        veranda: 17,
        roofGarden: 0,
        parking: 1,
        price: 195300,
        vatRate: 5,
        status: "SOLD",
        note: "Bathrooms 2. Store room yes. Total area 102 m2.",
        buyer: {
          key: "tre-saifan",
          firstName: "Rami Saifan and Annie",
          lastName: "Abdallah",
          note: "Joint buyers: Rami Saifan and Annie Abdallah. They hold two apartments in this building.",
        },
      },
      {
        code: "102",
        floor: "1st",
        bedrooms: 2,
        covered: 85,
        veranda: 17,
        roofGarden: 0,
        parking: 1,
        price: 230000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 102 m2.",
      },
      {
        code: "103",
        floor: "1st",
        bedrooms: 1,
        covered: 51,
        veranda: 10,
        roofGarden: 0,
        parking: 1,
        price: 109150,
        vatRate: 19,
        status: "SOLD",
        note: "Bathrooms 1. Store room yes. Total area 61 m2.",
        buyer: {
          key: "tre-saifan",
          firstName: "Rami Saifan and Annie",
          lastName: "Abdallah",
          note: "Joint buyers: Rami Saifan and Annie Abdallah. They hold two apartments in this building.",
        },
        contractNote: "35,000 in cash, paid.",
      },
      {
        code: "201",
        floor: "2nd",
        bedrooms: 2,
        covered: 85,
        veranda: 17,
        roofGarden: 0,
        parking: 1,
        price: 217000,
        vatRate: 5,
        status: "RESERVED",
        note: "Bathrooms 2. Store room yes. Total area 102 m2.",
        buyer: {
          key: "tre-abboud",
          firstName: "Daniele Maouad and Bassam",
          lastName: "Abboud",
          note: "Joint buyers: Daniele Maouad, spouse of Abboud, and Bassam Abboud.",
        },
      },
      {
        code: "202",
        floor: "2nd",
        bedrooms: 2,
        covered: 85,
        veranda: 17,
        roofGarden: 0,
        parking: 1,
        vatRate: 19,
        status: "RESERVED",
        note: "Bathrooms 2. Store room yes. Total area 102 m2.",
      },
      {
        code: "203",
        floor: "2nd",
        bedrooms: 1,
        covered: 51,
        veranda: 10,
        roofGarden: 0,
        parking: 1,
        price: 170000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 1. Store room yes. Total area 61 m2.",
      },
      {
        code: "301",
        floor: "3rd",
        bedrooms: 2,
        covered: 85,
        veranda: 17,
        roofGarden: 49,
        parking: 1,
        price: 250000,
        vatRate: 5,
        status: "RESERVED",
        note: "Bathrooms 2. Store room yes. Total area 151 m2.",
        buyer: { key: "tre-athanasiades", firstName: "Michalis", lastName: "Athanasiades" },
        contractNote: "30,000 in cash.",
      },
      {
        code: "302",
        floor: "3rd",
        bedrooms: 2,
        covered: 85,
        veranda: 17,
        roofGarden: 49,
        parking: 1,
        price: 300000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 151 m2.",
      },
      {
        code: "303",
        floor: "3rd",
        bedrooms: 1,
        covered: 51,
        veranda: 10,
        roofGarden: 0,
        parking: 1,
        price: 180000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 1. Store room yes. Total area 61 m2.",
      },
    ],
  },
  {
    name: "MAGNUM OPUS QUATTRO",
    short: "QUATTRO",
    slug: "magnum-opus-quattro",
    folder: "MAGNUM OPUS QUATTRO",
    partner: null,
    status: "PLANNING",
    location: "Larnaca Marina area",
    completionBy: "Q2 2028",
    description: [
      "Prime location in Larnaca, near the Land of Tomorrow project.",
      "One apartment of 1 bedroom, three of 2 bedrooms, two of 2+1 bedrooms and one of 3 bedrooms.",
      "Modern architectural design and a limited number of apartments for greater privacy. Under study.",
      "https://maps.app.goo.gl/V5sQPgaJZyaz5f1o8",
    ].join(" "),
    apartments: [
      {
        code: "101",
        floor: "1st",
        bedrooms: 1,
        covered: 51,
        veranda: 26,
        roofGarden: 0,
        parking: 1,
        price: 175000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 1. Store room yes. Total area 77 m2.",
      },
      {
        code: "102",
        floor: "1st",
        bedrooms: 2,
        covered: 78,
        veranda: 43,
        parking: 1,
        price: 265000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Ground floor garden. Total area 121 m2.",
      },
      {
        code: "201",
        floor: "2nd",
        bedrooms: 2,
        covered: 81,
        veranda: 24,
        roofGarden: 0,
        parking: 1,
        price: 250000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 105 m2.",
      },
      {
        code: "202",
        floor: "2nd",
        bedrooms: 2,
        covered: 87,
        veranda: 32,
        roofGarden: 0,
        parking: 1,
        price: 270000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Beds 2+1. Bathrooms 2. Store room yes. Total area 119 m2.",
      },
      {
        code: "301",
        floor: "3rd",
        bedrooms: 2,
        covered: 81,
        veranda: 24,
        roofGarden: 0,
        parking: 1,
        price: 260000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Bathrooms 2. Store room yes. Total area 105 m2.",
      },
      {
        code: "302",
        floor: "3rd",
        bedrooms: 2,
        covered: 87,
        veranda: 32,
        roofGarden: 0,
        parking: 1,
        price: 280000,
        vatRate: 19,
        status: "AVAILABLE",
        note: "Beds 2+1. Bathrooms 2. Store room yes. Total area 119 m2.",
      },
      {
        code: "401",
        floor: "4th",
        bedrooms: 3,
        covered: 113,
        veranda: 37,
        roofGarden: 50,
        parking: 1,
        vatRate: 19,
        status: "SOLD",
        note: "Bathrooms 3. Store room yes. Total area 230.4 m2.",
      },
    ],
  },
];

const BUILDINGS: Building[] = MAGNUM_OPUS;

/* --------------------------------------------------------------------------
   Which file goes under which heading.
   -------------------------------------------------------------------------- */

/**
 * The four headings a development's paper falls under.
 *
 * Decided from the file's own name rather than from a list somebody has to
 * keep up to date, because the office names these files well: a brochure says
 * brochure, a specification says specification, and drawings say either
 * drawings or κατόψεις. Anything left over is a picture, which is what the rest
 * of the folder is.
 */
function headingFor(name: string): "PICTURES" | "ARCHITECTURAL" | "BROCHURE" | "TECHNICAL_SPEC" {
  const upper = name.toUpperCase();

  if (upper.includes("BROCHURE") || upper.includes("BROSHURE")) return "BROCHURE";
  if (upper.includes("TECHNICAL") || upper.includes("SPECIFICATION")) return "TECHNICAL_SPEC";
  if (
    upper.includes("ΣΧΕΔΙΑ") ||
    upper.includes("ΚΑΤΟΨΕΙ") ||
    upper.includes("ΚΑΤΟΨΗ") ||
    upper.includes("SXEDIA") ||
    upper.includes("KATOPSEI") ||
    upper.includes("DRAWING")
  ) {
    return "ARCHITECTURAL";
  }
  return "PICTURES";
}

const PICTURE_TYPES = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".pdf", "application/pdf"],
]);

/* --------------------------------------------------------------------------
   Plumbing.
   -------------------------------------------------------------------------- */

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

function storageRoot(): string {
  return process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");
}

/** Numbers in a file name so that 2 comes before 10. */
function byNumberThenName(a: string, b: string): number {
  const na = /^(\d+)/.exec(a);
  const nb = /^(\d+)/.exec(b);
  if (na && nb) return Number(na[1]) - Number(nb[1]) || a.localeCompare(b);
  if (na) return -1;
  if (nb) return 1;
  return a.localeCompare(b);
}

async function main() {
  const source = process.argv[2] ?? path.join(process.cwd(), "PRICELIST-TABLE");

  /**
   * Nothing to put in means nothing to take out.
   *
   * This script clears before it fills, so an empty list of buildings would
   * leave the database emptier than it found it. It refuses instead.
   */
  if (BUILDINGS.length === 0) {
    stop("the list of buildings in this script is empty, so nothing was changed", [
      "Nothing was cleared either: a script that clears and then puts nothing back",
      "would leave you with less than you started with.",
    ]);
  }

  let resolved: ReturnType<typeof target>;
  try {
    resolved = target();
  } catch (error) {
    if (error instanceof DatabaseUrlError)
      stop(error.message, ["Open .env.local and set DATABASE_URL."]);
    throw error;
  }

  console.log(`\n  Database: ${resolved.label}`);
  console.log(`  Files:    ${source}\n`);

  let ask: Ask;
  let close: () => Promise<void>;

  if (resolved.kind === "pglite") {
    const port = Number(process.env.PORT ?? 3000);
    if (await somethingOnPort(port)) {
      stop(`the app is still running on port ${port}, so nothing was changed`, [
        "A local database cannot be changed underneath a running app: the change",
        "would be thrown away the next time the app writes. Stop it first, then",
        "run npm run db:magnum again.",
      ]);
    }
    const client = new PGlite(resolved.dataDir);
    await client.waitReady;
    /**
     * Bring the schema up to date first.
     *
     * The four headings a development's files fall under arrived with a
     * migration, so a database that has not had it cannot hold them. Migrating
     * here rather than asking for npm run db:fix first means one command does
     * the whole job and there is no half done state to land in.
     */
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

  /* 1. Out with the practice data. Children before parents, so nothing is
        left pointing at something that has gone. */
  console.log("  Clearing the practice data:");

  const clearing: [string, string][] = [
    ["documents", "files"],
    ["commission_payments", "commission payments"],
    ["commissions", "commission lines"],
    ["payments", "payments"],
    ["installments", "installments"],
    ["change_requests", "change requests"],
    ["vat_changes", "vat changes"],
    ["contracts", "contracts"],
    ["messages", "sent messages"],
    ["lead_notes", "enquiry notes"],
    ["leads", "enquiries"],
    ["units", "apartments"],
    ["project_partners", "partner shares"],
    ["projects", "developments"],
    ["companies", "companies"],
    ["subowner_directors", "partner directors"],
    ["subowner_shares", "partner shareholdings"],
    ["subowners", "partners"],
    ["clients", "clients"],
  ];

  for (const [table, what] of clearing) {
    const [before] = await ask(`select count(*)::int as n from ${table}`);
    await ask(`delete from ${table}`);
    console.log(
      `  removed  ${String(before?.n ?? 0)
        .toString()
        .padStart(4)}  ${what}`,
    );
  }

  /* 2. The partner companies. */
  console.log("\n  Partners:");
  const partnerIds = new Map<string, string>();

  for (const partner of PARTNERS) {
    const id = newId();
    await ask(
      `insert into subowners (id, name, company, registry_number, is_active)
       values ($1, $2, $3, $4, true)`,
      [id, partner.name, partner.name, partner.registryNumber],
    );
    partnerIds.set(partner.name, id);
    console.log(`  added    ${partner.name}  ${partner.registryNumber}`);

    for (const person of partner.directors) {
      await ask(
        `insert into subowner_directors
           (id, subowner_id, name, role, email, email_alternate, phone)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newId(),
          id,
          person.name,
          person.role,
          person.email ?? null,
          "emailAlternate" in person ? (person.emailAlternate ?? null) : null,
          person.phone ?? null,
        ],
      );
      console.log(`           director ${person.name}`);
    }

    for (const holding of partner.shares) {
      await ask(
        `insert into subowner_shares (id, subowner_id, holder, share_percent)
         values ($1, $2, $3, $4)`,
        [newId(), id, holding.holder, holding.sharePercent.toFixed(3)],
      );
    }
    console.log(
      `           owned by ${partner.shares.map((one) => `${one.holder} ${one.sharePercent}`).join(", ")}`,
    );
  }

  /* 3. The developments, their company, their partner share and their
        apartments. */
  const projectIds = new Map<string, string>();
  /* One record per buyer, however many apartments they hold. */
  const clientIds = new Map<string, string>();
  let buyersMade = 0;
  let contractsMade = 0;

  for (const building of BUILDINGS) {
    console.log(`\n  ${building.name}:`);

    let companyId: string | null = null;
    if (building.partner) {
      const found = await ask("select id from companies where name = $1 limit 1", [
        building.partner,
      ]);
      companyId = found[0] ? String(found[0].id) : newId();
      if (!found[0]) {
        await ask("insert into companies (id, name) values ($1, $2)", [
          companyId,
          building.partner,
        ]);
      }
    }

    const projectId = newId();
    await ask(
      `insert into projects (id, name, slug, company_id, location, completion_by,
                             description, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        projectId,
        building.name,
        building.slug,
        companyId,
        building.location,
        building.completionBy,
        building.description,
        building.status,
      ],
    );
    projectIds.set(building.name, projectId);

    if (building.partner) {
      await ask(
        `insert into project_partners (id, project_id, subowner_id, share_percent, role)
         values ($1, $2, $3, $4, $5)`,
        [
          newId(),
          projectId,
          partnerIds.get(building.partner),
          PARTNER_SHARE.toFixed(3),
          "Development partner",
        ],
      );
      console.log(
        `  partner  ${building.partner} ${PARTNER_SHARE}, One Eleven ${100 - PARTNER_SHARE}`,
      );
    } else {
      console.log("  partner  none yet, so it reads as ours outright");
    }

    let guessed = 0;
    for (const flat of building.apartments) {
      const price = flat.price ?? PRICE_UNKNOWN;
      if (flat.price === undefined) guessed += 1;

      const unitId = newId();

      /**
       * A status the office gave us, not one the money proved.
       *
       * Sold and reserved here come off the price list, and there is not a
       * payment on the record to back them up yet. Left to itself the rule
       * would look at a contract with nothing paid against it and put the
       * apartment back to reserved, or to available, and the office would find
       * its own list contradicted overnight. Marking it as set by hand is
       * exactly what that column is for, and the page says so plainly. Once the
       * real payments are in, the button on the apartment hands the status back
       * to the money.
       */
      const byHand = flat.status === "AVAILABLE" ? null : new Date();

      await ask(
        `insert into units
           (id, project_id, code, floor, bedrooms, covered_area, veranda_area,
            roof_garden_area, parking_spaces, net_price, vat_rate, status,
            status_by_hand_at, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          unitId,
          projectId,
          flat.code,
          flat.floor ?? null,
          flat.bedrooms ?? null,
          flat.covered === undefined ? null : flat.covered.toFixed(2),
          flat.veranda === undefined ? null : flat.veranda.toFixed(2),
          flat.roofGarden === undefined ? null : flat.roofGarden.toFixed(2),
          flat.parking ?? 0,
          price.toFixed(2),
          (flat.vatRate ?? 19).toFixed(3),
          flat.status,
          byHand,
          flat.price === undefined
            ? [
                flat.note,
                `Price to be confirmed, shown at ${PRICE_UNKNOWN.toLocaleString("en-GB")} until it is.`,
              ]
                .filter(Boolean)
                .join(" ")
            : (flat.note ?? null),
        ],
      );

      if (!flat.buyer) continue;

      /* The buyer, created once however many apartments they hold. */
      let clientId = clientIds.get(flat.buyer.key);
      if (!clientId) {
        clientId = newId();
        await ask(
          `insert into clients (id, first_name, last_name, source, marketing_opt_in, notes)
           values ($1, $2, $3, 'BUYER', false, $4)`,
          [clientId, flat.buyer.firstName, flat.buyer.lastName, flat.buyer.note ?? null],
        );
        clientIds.set(flat.buyer.key, clientId);
        buyersMade += 1;
      }

      await ask("update units set client_id = $1 where id = $2", [clientId, unitId]);

      /**
       * A draft contract, so the price, the rate and the term agreed have a
       * home.
       *
       * Draft rather than active because two things are still missing and only
       * the office has them: the contract's own number and date, and the
       * payment schedule. Everything else is here, so finishing one is filling
       * in two fields rather than typing a sale in from the beginning.
       */
      await ask(
        `insert into contracts
           (id, reference, kind, unit_id, client_id, net_price, vat_rate,
            schedule_type, status, notes)
         values ($1, $2, 'SALE', $3, $4, $5, $6, 'STANDARD', 'DRAFT', $7)`,
        [
          newId(),
          `${building.short} ${flat.code}`,
          unitId,
          clientId,
          price.toFixed(2),
          (flat.vatRate ?? 19).toFixed(3),
          flat.contractNote ?? null,
        ],
      );
      contractsMade += 1;
    }

    const sold = building.apartments.filter((a) => a.status === "SOLD").length;
    const reserved = building.apartments.filter((a) => a.status === "RESERVED").length;
    const free = building.apartments.filter((a) => a.status === "AVAILABLE").length;
    console.log(
      `  flats    ${building.apartments.length} in, ${free} available, ${reserved} reserved, ${sold} sold` +
        (guessed > 0 ? `, ${guessed} with no price yet` : ""),
    );

    const named = building.apartments.filter((one) => one.buyer).length;
    const unnamed = building.apartments.filter(
      (one) => one.status !== "AVAILABLE" && !one.buyer,
    ).length;
    console.log(
      `  buyers   ${named} named` + (unnamed > 0 ? `, ${unnamed} taken but nobody named yet` : ""),
    );
  }

  /* 4. The files. Copied into the storage folder the app serves them from,
        under the heading their own name gives them. */
  console.log("\n  Files:");

  const now = new Date();
  const folder = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
  const destination = path.join(storageRoot(), folder);
  await mkdir(destination, { recursive: true });

  for (const building of BUILDINGS) {
    const from = path.join(source, building.folder);
    let names: string[];

    try {
      names = (await readdir(from)).filter((name) => !name.startsWith("."));
    } catch {
      console.log(`  ${building.name}: no folder at ${from}, so no files`);
      continue;
    }

    /* The price list picture is the table this script was written from, not a
       picture of the building, so it stays out of the development's pictures. */
    const tableName = `${building.name}.png`.toUpperCase();
    const wanted = names
      .filter((name) => {
        const upper = name.toUpperCase();
        if (upper === tableName || upper === `${tableName}.PNG`) return false;
        return PICTURE_TYPES.has(path.extname(name).toLowerCase());
      })
      .sort(byNumberThenName);

    const counts = new Map<string, number>();

    for (const name of wanted) {
      const heading = headingFor(name);
      const extension = path.extname(name).toLowerCase();
      const stored = `${newId()}${extension}`;

      let size = 0;
      try {
        await copyFile(path.join(from, name), path.join(destination, stored));
        size = (await stat(path.join(destination, stored))).size;
      } catch (error) {
        console.log(`  could not copy ${name}: ${(error as Error).message}`);
        continue;
      }

      const seen = (counts.get(heading) ?? 0) + 1;
      counts.set(heading, seen);

      const title =
        heading === "PICTURES"
          ? `${building.name} ${seen}`
          : path.basename(name, path.extname(name));

      await ask(
        `insert into documents
           (id, category, title, file_path, mime_type, size_bytes, project_id,
            original_name, visible_to_buyer)
         values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [
          newId(),
          heading,
          title,
          path.posix.join(folder.split(path.sep).join("/"), stored),
          PICTURE_TYPES.get(extension) ?? "application/octet-stream",
          size,
          projectIds.get(building.name),
          name,
        ],
      );
    }

    const said = [...counts.entries()].map(([heading, n]) => `${n} ${heading.toLowerCase()}`);
    console.log(`  ${building.name}: ${said.length > 0 ? said.join(", ") : "nothing found"}`);
  }

  /* 5. Say where everything stands, so nothing is taken on trust. */
  const standing = await ask(
    `select p.name,
            (select count(*) from units u where u.project_id = p.id)::int as flats,
            (select count(*) from documents d where d.project_id = p.id)::int as files,
            coalesce((select string_agg(s.name, ', ')
                        from project_partners pp
                        join subowners s on s.id = pp.subowner_id
                       where pp.project_id = p.id), 'ours alone') as partner
       from projects p
      order by p.name`,
  );

  console.log(`\n  Buyers: ${buyersMade} created, ${contractsMade} draft contracts written.`);
  console.log("  The contracts carry the price, the rate and the term agreed. Their own");
  console.log("  number, date and payment schedule are what the office adds.\n");

  console.log("  Where it stands now:\n");
  for (const row of standing) {
    console.log(
      `  ${String(row.name).padEnd(22)} ${String(row.flats).padStart(3)} flats, ` +
        `${String(row.files).padStart(3)} files, ${row.partner}`,
    );
  }

  await close();
  console.log("\n  Done. Start the app: npm start");
  console.log("  The pictures and the PDFs are now the CRM's own copies, so the PRICELIST-TABLE");
  console.log("  folder can be deleted whenever you like.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
