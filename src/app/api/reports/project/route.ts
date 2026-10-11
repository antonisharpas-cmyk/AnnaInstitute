import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { projectReportData, projectReportPdf } from "@/lib/projectReport";
import { readSetting } from "@/lib/settings";

/**
 * A development's status report for its shareholders.
 *
 *   GET  ?project=ID&for=Name   the PDF, to look at or download. The office emails it itself.
 */
export const dynamic = "force-dynamic";

const fileName = (project: string) =>
  `Project status ${project} ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|]/g, " ");

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return new NextResponse("Not allowed", { status: 403 });
  const url = new URL(request.url);
  const data = await projectReportData(url.searchParams.get("project") ?? "");
  if (!data) return new NextResponse("Not found", { status: 404 });
  const pdf = await projectReportPdf(data, (url.searchParams.get("for") ?? "").trim(), await readSetting("company.name"));
  const name = fileName(data.project.name);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name.replace(/[^\x20-\x7E]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
