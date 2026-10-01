import "server-only";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { target } from "@/db/url";

/*
 * Moving the office's data onto the server, in one go.
 *
 * The whole of a local CRM, its database folder and its uploaded files, is
 * packed on the office's computer into one archive (npm run data:export). The
 * archive is uploaded from Settings in pieces, so a large one never has to fit
 * in memory, and kept on the disk beside the database. Nothing is replaced
 * while the CRM is running: on its next start, scripts/render-start.mjs puts
 * the current data aside, unpacks the archive in its place, and carries on.
 */

/** Where an upload waits: beside the database folder, so on the same disk. */
export function importFolder(): string | null {
  const resolved = target();
  if (resolved.kind !== "pglite") return null;
  return path.join(path.dirname(resolved.dataDir), ".import");
}

export const ARCHIVE = "data.tar";
export const PENDING = "pending.json";

export function ensureImportFolder(): string {
  const dir = importFolder();
  if (!dir) throw new Error("This CRM uses a database server, so data is moved into it a different way.");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export type ImportState =
  | { kind: "none" }
  | { kind: "pending"; bytes: number; at: string; by: string }
  | { kind: "done"; at: string; summary: string };

export function importState(): ImportState {
  const dir = importFolder();
  if (!dir) return { kind: "none" };
  const pending = path.join(dir, PENDING);
  if (existsSync(pending)) {
    try {
      const value = JSON.parse(readFileSync(pending, "utf8"));
      return { kind: "pending", bytes: value.bytes ?? 0, at: value.at ?? "", by: value.by ?? "" };
    } catch {
      return { kind: "none" };
    }
  }
  const done = path.join(dir, "last.json");
  if (existsSync(done)) {
    try {
      const value = JSON.parse(readFileSync(done, "utf8"));
      return { kind: "done", at: value.at ?? "", summary: value.summary ?? "" };
    } catch {
      return { kind: "none" };
    }
  }
  return { kind: "none" };
}

export function markPending(by: string): number {
  const dir = ensureImportFolder();
  const bytes = statSync(path.join(dir, ARCHIVE)).size;
  writeFileSync(path.join(dir, PENDING), JSON.stringify({ bytes, at: new Date().toISOString(), by }));
  return bytes;
}

/** Whether the CRM can restart itself: on Render it is started again at once. */
export const canRestartItself = () => Boolean(process.env.RENDER);
