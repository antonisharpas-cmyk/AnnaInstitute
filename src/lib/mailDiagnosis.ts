import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { MAIL_KEYS } from "@/lib/messaging/email";

/**
 * Why email is or is not set up, without ever showing a password.
 *
 * "It says not set up but I did set it up" has a handful of causes, and each
 * one can be seen from here: the lines were written in .env.example instead of
 * .env.local; .env.local has the names but empty values, copied from the
 * example, which then hide the real ones in .env; a name spelled another way;
 * or the file was changed after the CRM started, since it is only read at
 * start. Only the names and whether each has a value are ever shown.
 */
export type MailDiagnosis = {
  folder: string;
  startedAt: Date;
  settings: {
    setting: string;
    foundAs: string | null;
    required: boolean;
    /**
     * Whether the value the CRM runs with is the one written in .env.local.
     * Null when .env.local has no value for it. Only this yes or no is ever
     * shown, never the value, except the address the mail signs in with.
     */
    sameAsLocal: boolean | null;
    /** The sign in address itself, which is not a secret and is where typing mistakes hide. */
    shown?: string;
  }[];
  /** The app password as the CRM reads it: how long, and whether it is only letters. */
  password: { length: number; lettersOnly: boolean } | null;
  files: { name: string; exists: boolean; changedAfterStart: boolean; keys: { key: string; hasValue: boolean }[] }[];
  hints: string[];
};

const FILES = [".env.local", ".env", ".env.development.local", ".env.development", ".env.production.local", ".env.production", ".env.example"];

const ALL_KEYS = new Set<string>(Object.values(MAIL_KEYS).flat());

const unquote = (value: string) => value.replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim();

/** The mail values written in a file, kept here to compare and never returned. */
function valuesIn(file: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(raw.trim());
      if (match && ALL_KEYS.has(match[1])) out.set(match[1], unquote(match[2]));
    }
  } catch {
    /* No file, nothing to compare with. */
  }
  return out;
}

function keysIn(file: string): { key: string; hasValue: boolean }[] {
  try {
    const out: { key: string; hasValue: boolean }[] = [];
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match || !ALL_KEYS.has(match[1])) continue;
      const value = match[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim();
      out.push({ key: match[1], hasValue: value.length > 0 });
    }
    return out;
  } catch {
    return [];
  }
}

export function diagnoseMail(): MailDiagnosis {
  const folder = process.cwd();
  const startedAt = new Date(Date.now() - process.uptime() * 1000);

  const written = valuesIn(path.join(folder, ".env.local"));
  const running = (key: string) => (process.env[key] ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const settings = (Object.keys(MAIL_KEYS) as (keyof typeof MAIL_KEYS)[]).map((setting) => {
    const found = MAIL_KEYS[setting].find((key) => running(key));
    const inFile = MAIL_KEYS[setting].map((key) => written.get(key) ?? "").find(Boolean) ?? "";
    const now = found ? running(found) : "";
    /* The password is compared the way it is used, spaces taken out. */
    const same =
      setting === "password" ? now.replace(/\s+/g, "") === inFile.replace(/\s+/g, "") : now === inFile;
    return {
      setting,
      foundAs: found ?? null,
      required: setting === "host" || setting === "user" || setting === "password",
      sameAsLocal: inFile ? same : null,
      shown: setting === "user" && now ? now : undefined,
    };
  });
  const pass = (() => {
    const key = MAIL_KEYS.password.find((one) => running(one));
    if (!key) return null;
    const value = running(key).replace(/\s+/g, "");
    return { length: value.length, lettersOnly: /^[a-z]+$/i.test(value) };
  })();

  const files = FILES.map((name) => {
    const full = path.join(folder, name);
    const exists = existsSync(full);
    let changedAfterStart = false;
    if (exists) {
      try {
        changedAfterStart = statSync(full).mtime > startedAt;
      } catch {
        changedAfterStart = false;
      }
    }
    return { name, exists, changedAfterStart, keys: exists ? keysIn(full) : [] };
  });

  const hints: string[] = [];
  const local = files.find((one) => one.name === ".env.local");
  const example = files.find((one) => one.name === ".env.example");
  const hostLoaded = settings.find((one) => one.setting === "host")?.foundAs;

  /* The file hints only matter while the CRM cannot see a mail server. */
  if (!hostLoaded && !local?.exists) {
    hints.push("There is no .env.local file in the folder the CRM runs from. Create it next to package.json and put the SMTP lines in it.");
  }
  if (!hostLoaded && local?.exists && !local.keys.some((key) => MAIL_KEYS.host.includes(key.key as never))) {
    hints.push(".env.local has no SMTP_HOST line. Add the SMTP lines to it.");
  }
  if (!hostLoaded && local?.keys.some((key) => MAIL_KEYS.host.includes(key.key as never) && !key.hasValue)) {
    hints.push(".env.local has SMTP_HOST with nothing after the = sign. Fill in smtp.gmail.com, or delete the empty line if the value is in another file, because an empty line in .env.local hides the value in .env.");
  }
  if (example?.keys.some((key) => MAIL_KEYS.host.includes(key.key as never) && key.hasValue) && !hostLoaded) {
    hints.push("The SMTP settings are filled in .env.example, which the CRM never reads. Copy those lines into .env.local.");
  }
  const changed = files.filter((one) => one.exists && one.changedAfterStart && one.name !== ".env.example");
  if (changed.length > 0) {
    hints.push(`${changed.map((one) => one.name).join(" and ")} changed after the CRM started. Stop the CRM and start it again: these files are read only when it starts.`);
  }
  const passwordMissing = !settings.find((one) => one.setting === "password")?.foundAs;
  const userSet = Boolean(settings.find((one) => one.setting === "user")?.foundAs);
  if (hostLoaded && userSet && passwordMissing) {
    hints.push("SMTP_HOST is set but there is no SMTP_PASSWORD. For Google Workspace it is the 16 letter app password.");
  }
  /*
   * A value that is not the one in .env.local came from somewhere else, and
   * that somewhere wins: a Windows environment variable, or a terminal where it
   * was set by hand. The CRM never lets .env.local overwrite those.
   */
  const differ = settings.filter((one) => one.sameAsLocal === false);
  if (differ.length > 0) {
    hints.push(
      `The CRM is not using the ${differ.map((one) => one.foundAs).join(", ")} written in .env.local. A value set in Windows (System, Environment variables) or in the terminal the CRM was started from wins over the file. Remove it there, close the terminal, open a new one and start the CRM again.`,
    );
  }
  if (pass && (pass.length !== 16 || !pass.lettersOnly)) {
    hints.push(
      `The password the CRM reads has ${pass.length} characters${pass.lettersOnly ? "" : " and not only letters"}. A Google app password is 16 letters. Your normal Gmail password does not work here.`,
    );
  }
  return { folder, startedAt, settings, files, hints, password: pass };
}
