import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildPack, emailPack } from "@/lib/accountantPack";
import { emailList } from "@/lib/buyers";
import { writeSetting } from "@/lib/settings";

/**
 * The month's papers for the accountant.
 *
 *   POST { month: "2026-10", keys: [...], mode: "download" }  the ZIP itself
 *   POST { month, keys, mode: "send", to, note }               emailed, and the address kept
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, detail: "Not signed in" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ ok: false, detail: "Only an administrator can do this" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    month?: string;
    keys?: string[];
    mode?: string;
    to?: string;
    note?: string;
  };
  const month = /^\d{4}-\d{2}$/.test(body.month ?? "") ? (body.month as string) : "";
  const keys = Array.isArray(body.keys) ? body.keys.filter((one) => typeof one === "string").slice(0, 2000) : [];
  if (!month) return NextResponse.json({ ok: false, detail: "Choose the month." }, { status: 400 });
  if (keys.length === 0) return NextResponse.json({ ok: false, detail: "Tick at least one paper." }, { status: 400 });

  if (body.mode === "send") {
    const to = emailList(body.to ?? "").join(", ");
    if (to) await writeSetting("accountant.email", to);
    const result = await emailPack({ month, keys, to, note: body.note, who: { id: user.id, email: user.email } });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  const pack = await buildPack(month, keys);
  return new NextResponse(new Uint8Array(pack.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(pack.zip.length),
      "Content-Disposition": `attachment; filename="${pack.filename.replace(/[^\x20-\x7E]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(pack.filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
