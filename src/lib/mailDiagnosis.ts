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
  settings: { setting: string; foundAs: string | null; required: boolean }[];
  files: { name: string; exists: boolean; changedAfterStart: boolean; keys: { key: string; hasValue: boolean }[] }[];
  hints: string[];
};

const FILES = [".env.local", ".env", ".env.development.local", ".env.development", ".env.production.local", ".env.production", ".env.example"];

const ALL_KEYS = new Set<string>(Object.values(MAIL_KEYS).flat());

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

  const settings = (Object.keys(MAIL_KEYS) as (keyof typeof MAIL_KEYS)[]).map((setting) => {
    const found = MAIL_KEYS[setting].find((key) => (process.env[key] ?? "").trim().replace(/^["']|["']$/g, "").trim());
    return { setting, foundAs: found ?? null, required: setting === "host" || setting === "user" || setting === "password" };
  });

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
  return { folder, startedAt, settings, files, hints };
}
