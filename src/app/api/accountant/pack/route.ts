import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { buildPack, emailPack, monthsFrom, packCompanies, rememberAccountant } from "@/lib/accountantPack";
import { emailList } from "@/lib/buyers";

/**
 * The papers for the accountant, of one month or several, of one company or all.
 *
 *   POST { months: ["2026-09"], company: "ours" | id | "", keys: [...], mode: "download" }  the ZIP itself
 *   POST { months, company, keys, mode: "send", to, note }                                  emailed, and the address kept
 *
 * Each company has its own accountant, so the address is kept for the company
 * it went for, and comes back filled in the next time that company is chosen.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, detail: "Not signed in" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ ok: false, detail: "Only an administrator can do this" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    months?: string[];
    month?: string;
    company?: string;
    keys?: string[];
    mode?: string;
    to?: string;
    note?: string;
  };
  const months = monthsFrom(body.months ?? body.month ?? "");
  const keys = Array.isArray(body.keys) ? body.keys.filter((one) => typeof one === "string").slice(0, 5000) : [];
  if (months.length === 0) return NextResponse.json({ ok: false, detail: "Choose at least one month." }, { status: 400 });
  if (keys.length === 0) return NextResponse.json({ ok: false, detail: "Tick at least one paper." }, { status: 400 });

  /* "ours" is One Eleven itself, an id is one of the companies, nothing is all of them. */
  const raw = String(body.company ?? "").trim();
  const companies = await packCompanies();
  const companyId = raw === "ours" ? "" : raw && companies.some((one) => one.id === raw) ? raw : null;
  const companyName = companyId === null ? "" : (companies.find((one) => one.id === companyId)?.name ?? "");

  if (body.mode === "send") {
    const to = emailList(body.to ?? "").join(", ");
    if (to) await rememberAccountant(companyId === null ? "" : raw, to);
    const result = await emailPack({ months, companyId, keys, to, note: body.note, who: { id: user.id, email: user.email } });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  const pack = await buildPack(months, keys, companyName);
  return new NextResponse(new Uint8Array(pack.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(pack.zip.length),
      "Content-Disposition": `attachment; filename="${pack.filename.replace(/[^\x20-\x7E]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(pack.filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
