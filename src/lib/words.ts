/**
 * An amount of money in words, the way a receipt book asks for it.
 *
 * "The sum of Euro: three hundred and fifty seven" in English, and the same in
 * Greek, "τριακόσια πενήντα επτά", because the office's receipts carry both.
 * Whole euro in words, cents after them.
 */

const EN_ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enBelowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${EN_ONES[hundreds]} hundred`);
  if (rest > 0) {
    const words =
      rest < 20
        ? EN_ONES[rest]
        : `${EN_TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${EN_ONES[rest % 10]}` : ""}`;
    parts.push(hundreds > 0 ? `and ${words}` : words);
  }
  return parts.join(" ");
}

export function englishNumber(n: number): string {
  if (n === 0) return "zero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(`${enBelowThousand(millions)} million`);
  if (thousands) parts.push(`${enBelowThousand(thousands)} thousand`);
  if (rest) parts.push(rest < 100 && parts.length > 0 ? `and ${enBelowThousand(rest)}` : enBelowThousand(rest));
  return parts.join(" ");
}

/* Greek: neuter for euro and cents, feminine for the count of thousands. */
const EL_ONES_N = [
  "μηδέν", "ένα", "δύο", "τρία", "τέσσερα", "πέντε", "έξι", "επτά", "οκτώ", "εννέα",
  "δέκα", "έντεκα", "δώδεκα", "δεκατρία", "δεκατέσσερα", "δεκαπέντε", "δεκαέξι",
  "δεκαεπτά", "δεκαοκτώ", "δεκαεννέα",
];
const EL_ONES_F = [...EL_ONES_N];
EL_ONES_F[1] = "μία";
EL_ONES_F[3] = "τρεις";
EL_ONES_F[4] = "τέσσερις";
EL_ONES_F[13] = "δεκατρείς";
EL_ONES_F[14] = "δεκατέσσερις";
const EL_TENS = ["", "", "είκοσι", "τριάντα", "σαράντα", "πενήντα", "εξήντα", "εβδομήντα", "ογδόντα", "ενενήντα"];
const EL_HUNDREDS_N = ["", "εκατό", "διακόσια", "τριακόσια", "τετρακόσια", "πεντακόσια", "εξακόσια", "επτακόσια", "οκτακόσια", "εννιακόσια"];
const EL_HUNDREDS_F = ["", "εκατό", "διακόσιες", "τριακόσιες", "τετρακόσιες", "πεντακόσιες", "εξακόσιες", "επτακόσιες", "οκτακόσιες", "εννιακόσιες"];

function elBelowThousand(n: number, feminine: boolean): string {
  const ones = feminine ? EL_ONES_F : EL_ONES_N;
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) {
    /* Εκατό on its own, εκατόν when something follows it. */
    if (hundreds === 1) parts.push(rest > 0 ? "εκατόν" : "εκατό");
    else parts.push((feminine ? EL_HUNDREDS_F : EL_HUNDREDS_N)[hundreds]);
  }
  if (rest > 0) {
    parts.push(
      rest < 20
        ? ones[rest]
        : `${EL_TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ones[rest % 10]}` : ""}`,
    );
  }
  return parts.join(" ");
}

export function greekNumber(n: number): string {
  if (n === 0) return "μηδέν";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "ένα εκατομμύριο" : `${elBelowThousand(millions, false)} εκατομμύρια`);
  if (thousands) parts.push(thousands === 1 ? "χίλια" : `${elBelowThousand(thousands, true)} χιλιάδες`);
  if (rest) parts.push(elBelowThousand(rest, false));
  return parts.join(" ");
}

/** "Three hundred and fifty seven euro" or "... euro and 50 cents". */
export function amountInEnglish(cents: number): string {
  const whole = Math.floor(Math.abs(cents) / 100);
  const part = Math.abs(cents) % 100;
  const euro = `${englishNumber(whole)} euro`;
  const said = part ? `${euro} and ${englishNumber(part)} cent${part === 1 ? "" : "s"}` : euro;
  return said.charAt(0).toUpperCase() + said.slice(1);
}

export function amountInGreek(cents: number): string {
  const whole = Math.floor(Math.abs(cents) / 100);
  const part = Math.abs(cents) % 100;
  const euro = `${greekNumber(whole)} ευρώ`;
  const said = part ? `${euro} και ${greekNumber(part)} ${part === 1 ? "λεπτό" : "λεπτά"}` : euro;
  return said.charAt(0).toUpperCase() + said.slice(1);
}
