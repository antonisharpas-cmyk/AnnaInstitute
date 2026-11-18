/**
 * Countries and their telephone codes, for the country picker beside every
 * telephone number. Cyprus first, then the countries the office deals with
 * most, then the rest in alphabetical order. No server code here.
 */

export type Country = { iso: string; name: string; code: string };

const FIRST = ["CY", "GR", "GB", "IL", "LB", "RU", "UA", "KZ", "QA", "AE", "DE"];

const ALL: Country[] = [
  { iso: "AF", name: "Afghanistan", code: "+93" },
  { iso: "AL", name: "Albania", code: "+355" },
  { iso: "DZ", name: "Algeria", code: "+213" },
  { iso: "AD", name: "Andorra", code: "+376" },
  { iso: "AO", name: "Angola", code: "+244" },
  { iso: "AR", name: "Argentina", code: "+54" },
  { iso: "AM", name: "Armenia", code: "+374" },
  { iso: "AU", name: "Australia", code: "+61" },
  { iso: "AT", name: "Austria", code: "+43" },
  { iso: "AZ", name: "Azerbaijan", code: "+994" },
  { iso: "BH", name: "Bahrain", code: "+973" },
  { iso: "BD", name: "Bangladesh", code: "+880" },
  { iso: "BY", name: "Belarus", code: "+375" },
  { iso: "BE", name: "Belgium", code: "+32" },
  { iso: "BA", name: "Bosnia and Herzegovina", code: "+387" },
  { iso: "BR", name: "Brazil", code: "+55" },
  { iso: "BG", name: "Bulgaria", code: "+359" },
  { iso: "CA", name: "Canada", code: "+1" },
  { iso: "CL", name: "Chile", code: "+56" },
  { iso: "CN", name: "China", code: "+86" },
  { iso: "CO", name: "Colombia", code: "+57" },
  { iso: "HR", name: "Croatia", code: "+385" },
  { iso: "CY", name: "Cyprus", code: "+357" },
  { iso: "CZ", name: "Czech Republic", code: "+420" },
  { iso: "DK", name: "Denmark", code: "+45" },
  { iso: "EG", name: "Egypt", code: "+20" },
  { iso: "EE", name: "Estonia", code: "+372" },
  { iso: "ET", name: "Ethiopia", code: "+251" },
  { iso: "FI", name: "Finland", code: "+358" },
  { iso: "FR", name: "France", code: "+33" },
  { iso: "GE", name: "Georgia", code: "+995" },
  { iso: "DE", name: "Germany", code: "+49" },
  { iso: "GH", name: "Ghana", code: "+233" },
  { iso: "GR", name: "Greece", code: "+30" },
  { iso: "HK", name: "Hong Kong", code: "+852" },
  { iso: "HU", name: "Hungary", code: "+36" },
  { iso: "IS", name: "Iceland", code: "+354" },
  { iso: "IN", name: "India", code: "+91" },
  { iso: "ID", name: "Indonesia", code: "+62" },
  { iso: "IR", name: "Iran", code: "+98" },
  { iso: "IQ", name: "Iraq", code: "+964" },
  { iso: "IE", name: "Ireland", code: "+353" },
  { iso: "IL", name: "Israel", code: "+972" },
  { iso: "IT", name: "Italy", code: "+39" },
  { iso: "JP", name: "Japan", code: "+81" },
  { iso: "JO", name: "Jordan", code: "+962" },
  { iso: "KZ", name: "Kazakhstan", code: "+7" },
  { iso: "KE", name: "Kenya", code: "+254" },
  { iso: "KW", name: "Kuwait", code: "+965" },
  { iso: "KG", name: "Kyrgyzstan", code: "+996" },
  { iso: "LV", name: "Latvia", code: "+371" },
  { iso: "LB", name: "Lebanon", code: "+961" },
  { iso: "LY", name: "Libya", code: "+218" },
  { iso: "LI", name: "Liechtenstein", code: "+423" },
  { iso: "LT", name: "Lithuania", code: "+370" },
  { iso: "LU", name: "Luxembourg", code: "+352" },
  { iso: "MY", name: "Malaysia", code: "+60" },
  { iso: "MT", name: "Malta", code: "+356" },
  { iso: "MX", name: "Mexico", code: "+52" },
  { iso: "MD", name: "Moldova", code: "+373" },
  { iso: "MC", name: "Monaco", code: "+377" },
  { iso: "MN", name: "Mongolia", code: "+976" },
  { iso: "ME", name: "Montenegro", code: "+382" },
  { iso: "MA", name: "Morocco", code: "+212" },
  { iso: "NL", name: "Netherlands", code: "+31" },
  { iso: "NZ", name: "New Zealand", code: "+64" },
  { iso: "NG", name: "Nigeria", code: "+234" },
  { iso: "MK", name: "North Macedonia", code: "+389" },
  { iso: "NO", name: "Norway", code: "+47" },
  { iso: "OM", name: "Oman", code: "+968" },
  { iso: "PK", name: "Pakistan", code: "+92" },
  { iso: "PS", name: "Palestine", code: "+970" },
  { iso: "PH", name: "Philippines", code: "+63" },
  { iso: "PL", name: "Poland", code: "+48" },
  { iso: "PT", name: "Portugal", code: "+351" },
  { iso: "QA", name: "Qatar", code: "+974" },
  { iso: "RO", name: "Romania", code: "+40" },
  { iso: "RU", name: "Russia", code: "+7" },
  { iso: "SA", name: "Saudi Arabia", code: "+966" },
  { iso: "RS", name: "Serbia", code: "+381" },
  { iso: "SG", name: "Singapore", code: "+65" },
  { iso: "SK", name: "Slovakia", code: "+421" },
  { iso: "SI", name: "Slovenia", code: "+386" },
  { iso: "ZA", name: "South Africa", code: "+27" },
  { iso: "KR", name: "South Korea", code: "+82" },
  { iso: "ES", name: "Spain", code: "+34" },
  { iso: "LK", name: "Sri Lanka", code: "+94" },
  { iso: "SE", name: "Sweden", code: "+46" },
  { iso: "CH", name: "Switzerland", code: "+41" },
  { iso: "SY", name: "Syria", code: "+963" },
  { iso: "TW", name: "Taiwan", code: "+886" },
  { iso: "TJ", name: "Tajikistan", code: "+992" },
  { iso: "TH", name: "Thailand", code: "+66" },
  { iso: "TN", name: "Tunisia", code: "+216" },
  { iso: "TR", name: "Turkey", code: "+90" },
  { iso: "TM", name: "Turkmenistan", code: "+993" },
  { iso: "UA", name: "Ukraine", code: "+380" },
  { iso: "AE", name: "United Arab Emirates", code: "+971" },
  { iso: "GB", name: "United Kingdom", code: "+44" },
  { iso: "US", name: "United States", code: "+1" },
  { iso: "UZ", name: "Uzbekistan", code: "+998" },
  { iso: "VN", name: "Vietnam", code: "+84" },
  { iso: "YE", name: "Yemen", code: "+967" },
];

const byIso = new Map(ALL.map((one) => [one.iso, one]));

export const COUNTRIES: Country[] = [
  ...FIRST.map((iso) => byIso.get(iso)).filter((one): one is Country => Boolean(one)),
  ...ALL.filter((one) => !FIRST.includes(one.iso)),
];

/**
 * A number as it was saved, split into its country and the rest, so the
 * picker can show it. A number with no + is a Cyprus number when it has eight
 * digits, as the CRM has always read them. One whose code is not in the list
 * keeps its own + and is shown whole, under "Other".
 */
export function splitPhone(raw: string | null | undefined): { iso: string; rest: string } {
  const typed = (raw ?? "").trim();
  if (!typed) return { iso: "CY", rest: "" };
  const plus = typed.startsWith("00") ? `+${typed.slice(2)}` : typed;
  if (!plus.startsWith("+")) return { iso: "CY", rest: plus };
  const compact = plus.replace(/[^\d+]/g, "");
  /* The longest code that fits wins: +357 before +35, +1 only when nothing longer does. */
  const found = [...COUNTRIES]
    .filter((one) => compact.startsWith(one.code))
    .sort((a, b) => b.code.length - a.code.length)[0];
  if (!found) return { iso: "OTHER", rest: plus };
  /* +7 is shared by Russia and Kazakhstan: Kazakh numbers start +7 6 or +7 7. */
  const iso = found.code === "+7" ? (/^\+7[67]/.test(compact) ? "KZ" : "RU") : found.code === "+1" ? "US" : found.iso;
  /* What follows the code's digits, spaces and all, as it was typed. */
  let digitsLeft = found.code.length - 1;
  let at = 1;
  while (at < plus.length && digitsLeft > 0) {
    if (/\d/.test(plus[at])) digitsLeft -= 1;
    at += 1;
  }
  return { iso, rest: plus.slice(at).replace(/^[\s\-./)]+/, "").trim() };
}

/** The country and the number back together, as it is saved: "+357 99 123456". */
export function joinPhone(iso: string, rest: string): string {
  const typed = rest.trim();
  if (!typed) return "";
  if (typed.startsWith("+") || typed.startsWith("00") || iso === "OTHER") return typed;
  const country = byIso.get(iso);
  if (!country) return typed;
  /* A local number typed with its leading 0 (UK 07..., Greece is 69... with none) loses the 0 after the code. */
  const local = typed.replace(/^0+/, "");
  return `${country.code} ${local}`;
}
