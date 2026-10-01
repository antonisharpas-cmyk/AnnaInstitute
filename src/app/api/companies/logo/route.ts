import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
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
