import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subowners } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { saveCompanyLogo } from "@/lib/companyLogo";
import { issuerDetails } from "@/lib/issuer";
import { logoBytes } from "@/lib/paymentPdf";

/** The logo a company's papers carry, for its own page to show. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const issuer = new URL(request.url).searchParams.get("issuer") ?? "";
  const company = await issuerDetails(issuer);
  const bytes = await logoBytes({ company });
  if (!bytes) return new NextResponse("No logo", { status: 404 });
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": png ? "image/png" : "image/jpeg",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

/**
 * A new logo for a company, or none.
 *
 * Sent straight from the company's page the moment a picture is chosen, so the
 * page can show it at once and say it was saved, without waiting on a form.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Only an administrator can do this" }, { status: 403 });

  const form = await request.formData();
  const issuer = String(form.get("issuer") ?? "");
  const [company] = issuer ? await db.select({ id: subowners.id }).from(subowners).where(eq(subowners.id, issuer)).limit(1) : [];
  if (!company) return NextResponse.json({ error: "That company is not there." }, { status: 404 });

  const remove = String(form.get("remove") ?? "") === "yes";
  let logoPath: string | null = null;
  if (!remove) {
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a picture first." }, { status: 400 });
    try {
      logoPath = await saveCompanyLogo(file);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }
  await db.update(subowners).set({ logoPath, updatedAt: new Date() }).where(eq(subowners.id, issuer));
  await recordAudit({
    action: "subowner.logo",
    entity: "subowner",
    entityId: issuer,
    detail: remove ? "removed" : "uploaded",
    userId: user.id,
    userEmail: user.email,
  });
  revalidatePath(`/subowners/${issuer}`);
  return NextResponse.json({ ok: true, logoPath });
}
