import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { projectReportData, projectReportPdf } from "@/lib/projectReport";
import { readSetting } from "@/lib/settings";
import { sendAndRecord } from "@/lib/messaging";
import { emailList } from "@/lib/buyers";
import { recordAudit } from "@/lib/audit";

/**
 * A development's status report for its shareholders.
 *
 *   GET  ?project=ID&for=Name                    the PDF, to look at or download
 *   POST { project, recipients: [{ name, email }], note }   one personal email each
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

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ ok: false, detail: "Not allowed" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as {
    project?: string;
    recipients?: { name?: string; email?: string }[];
    note?: string;
  };
  const data = await projectReportData(body.project ?? "");
  if (!data) return NextResponse.json({ ok: false, detail: "Choose the development." }, { status: 400 });
  const people = (body.recipients ?? [])
    .map((one) => ({ name: (one.name ?? "").trim(), email: emailList(one.email ?? "")[0] ?? "" }))
    .filter((one) => one.email);
  if (people.length === 0) return NextResponse.json({ ok: false, detail: "Tick or type at least one email address." }, { status: 400 });

  const company = await readSetting("company.name");
  const sent: string[] = [];
  const failed: string[] = [];
  for (const person of people) {
    const pdf = await projectReportPdf(data, person.name, company);
    const lines = [
      person.name ? `Dear ${person.name},` : "Dear shareholder,",
      "",
      `Attached is the status of ${data.project.name} as it stands today: the apartments and their buyers, where each buyer's payments stand, and the payments to the constructor.`,
      ...(body.note?.trim() ? ["", body.note.trim()] : []),
      "",
      "Kind regards,",
      company,
    ];
    const result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: person.name || person.email, email: person.email },
      subject: `${data.project.name}: project status, ${new Date().toLocaleDateString("en-GB")}`,
      body: lines.join("\n"),
      withOptOut: false,
      attachments: [{ filename: fileName(data.project.name), content: pdf, contentType: "application/pdf" }],
    });
    if (result.status === "SENT") sent.push(person.email);
    else failed.push(`${person.email} (${result.error ?? result.status})`);
  }
  await recordAudit({
    action: "project.report",
    entity: "project",
    entityId: data.project.id,
    detail: `${data.project.name}: sent to ${sent.join(", ") || "nobody"}${failed.length ? `; not sent to ${failed.join(", ")}` : ""}`,
    userId: user.id,
    userEmail: user.email,
  });
  const ok = failed.length === 0;
  return NextResponse.json(
    { ok, detail: ok ? `Sent to ${sent.join(", ")}.` : `${sent.length ? `Sent to ${sent.join(", ")}. ` : ""}Not sent to ${failed.join(", ")}.` },
    { status: ok ? 200 : 400 },
  );
}
