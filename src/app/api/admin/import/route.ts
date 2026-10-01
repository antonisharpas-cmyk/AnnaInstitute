import { NextResponse } from "next/server";
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { getSessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { ARCHIVE, PENDING, canRestartItself, ensureImportFolder, markPending } from "@/lib/dataImport";

/*
 * The upload of a data archive, a piece at a time.
 *
 *   POST ?step=part&index=0..n   the piece itself as the body, written in order
 *   POST ?step=finish&size=N     checks the whole archive and marks it to apply
 *   POST ?step=cancel            throws an unfinished or waiting upload away
 *   POST ?step=restart           restarts the CRM so the archive is applied
 *
 * Each piece is streamed straight to the disk, so the size of the archive has
 * nothing to do with the memory the CRM needs.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Only an administrator can do this" }, { status: 403 });

  let dir: string;
  try {
    dir = ensureImportFolder();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const archive = path.join(dir, ARCHIVE);
  const params = new URL(request.url).searchParams;
  const step = params.get("step");

  if (step === "part") {
    const index = Number(params.get("index"));
    if (!Number.isInteger(index) || index < 0 || !request.body) {
      return NextResponse.json({ error: "A piece is missing" }, { status: 400 });
    }
    if (index === 0) rmSync(path.join(dir, PENDING), { force: true });
    await pipeline(
      Readable.fromWeb(request.body as unknown as WebReadableStream),
      createWriteStream(archive, { flags: index === 0 ? "w" : "a" }),
    );
    return NextResponse.json({ ok: true, bytes: statSync(archive).size });
  }

  if (step === "finish") {
    const size = Number(params.get("size"));
    if (!existsSync(archive)) return NextResponse.json({ error: "Nothing was uploaded" }, { status: 400 });
    const got = statSync(archive).size;
    if (got !== size) {
      return NextResponse.json({ error: `The upload is incomplete: ${got} of ${size} bytes arrived. Try again.` }, { status: 400 });
    }
    /* It has to be an archive made by npm run data:export: a database folder inside. */
    let names: string[];
    try {
      names = execFileSync("tar", ["-tf", archive], { maxBuffer: 64 * 1024 * 1024 }).toString().split("\n");
    } catch {
      return NextResponse.json({ error: "That file is not an archive made by npm run data:export." }, { status: 400 });
    }
    if (!names.some((name) => /(^|\/)PG_VERSION$/.test(name))) {
      return NextResponse.json({ error: "There is no database inside that archive." }, { status: 400 });
    }
    const bytes = markPending(user.email);
    const files = names.filter((name) => name.startsWith("storage/") && !name.endsWith("/")).length;
    await recordAudit({
      action: "data.import.uploaded",
      entity: "settings",
      detail: `${Math.round(bytes / 1048576)} MB, ${files} files`,
      userId: user.id,
      userEmail: user.email,
    });
    return NextResponse.json({ ok: true, bytes, files, canRestart: canRestartItself() });
  }

  if (step === "cancel") {
    rmSync(path.join(dir, PENDING), { force: true });
    rmSync(archive, { force: true });
    return NextResponse.json({ ok: true });
  }

  if (step === "restart") {
    if (!existsSync(path.join(dir, PENDING))) return NextResponse.json({ error: "There is nothing waiting to be applied." }, { status: 400 });
    if (!canRestartItself()) {
      return NextResponse.json({ error: "Stop the CRM and start it again: the data is applied as it starts." }, { status: 400 });
    }
    await recordAudit({ action: "data.import.restart", entity: "settings", userId: user.id, userEmail: user.email });
    /* Answer first, then stop: Render starts the CRM again straight away. */
    setTimeout(() => process.exit(0), 800);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown step" }, { status: 400 });
}
