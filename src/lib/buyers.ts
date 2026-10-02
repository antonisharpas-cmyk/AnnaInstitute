/**
 * The people on a client: the buyer, and a second buyer when the apartment is
 * in two names. Plain functions, so the pages, the papers and the letters all
 * say the names the same way.
 */

type Names = {
  firstName?: string | null;
  lastName?: string | null;
  secondFirstName?: string | null;
  secondLastName?: string | null;
};

const both = (first?: string | null, last?: string | null) => `${first ?? ""} ${last ?? ""}`.trim();

/** The main buyer's whole name. */
export function mainName(c: Names): string {
  return both(c.firstName, c.lastName);
}

/** The second buyer's whole name, or nothing. */
export function secondName(c: Names): string {
  return both(c.secondFirstName, c.secondLastName);
}

export function hasSecondBuyer(c: Names): boolean {
  return secondName(c) !== "";
}

/** Both names, the way a paper writes them: "Maria Georgiou and Andreas Georgiou". */
export function buyersName(c: Names): string {
  const second = secondName(c);
  return second ? `${mainName(c)} and ${second}` : mainName(c);
}

/** Both first names, for the greeting of a letter about their money. */
export function buyersFirstNames(c: Names): string {
  const second = (c.secondFirstName ?? "").trim();
  const first = (c.firstName ?? "").trim();
  return second ? `${first} and ${second}` : first;
}

/**
 * Email addresses out of whatever was typed: commas, semicolons, spaces or new
 * lines between them, each kept once, anything that is not an address left
 * out.
 */
export function emailList(...texts: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    for (const piece of (text ?? "").split(/[\s,;]+/)) {
      const one = piece.trim().replace(/^<|>$/g, "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(one)) continue;
      const key = one.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(one);
    }
  }
  return out;
}

/** A birthday as typed or as stored, made into 1985-03-14, or nothing when it is not a real day. */
export function cleanBirthDate(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  let y: number, m: number, d: number;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (local) [d, m, y] = [Number(local[1]), Number(local[2]), Number(local[3])];
  else return null;
  const day = new Date(y, m - 1, d);
  if (day.getFullYear() !== y || day.getMonth() !== m - 1 || day.getDate() !== d) return null;
  if (y < 1900 || day > new Date()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Is it their birthday today? Somebody born on 29 February has it on the 28th
 * in the years without a 29th.
 */
export function isBirthday(birthDate: string | null | undefined, today: Date): boolean {
  const clean = cleanBirthDate(birthDate);
  if (!clean) return false;
  const [, m, d] = clean.split("-").map(Number);
  const month = today.getMonth() + 1;
  const date = today.getDate();
  if (m === month && d === date) return true;
  if (m === 2 && d === 29 && month === 2 && date === 28) {
    const leap = new Date(today.getFullYear(), 1, 29).getMonth() === 1;
    return !leap;
  }
  return false;
}

/** The birthday as the office reads it, 14/03/1985, with the age it is this year. */
export function birthdayText(birthDate: string | null | undefined, locale = "en"): string {
  const clean = cleanBirthDate(birthDate);
  if (!clean) return "";
  const [y, m, d] = clean.split("-").map(Number);
  const shown = new Date(y, m - 1, d).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB");
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return `${shown} (${age})`;
}
