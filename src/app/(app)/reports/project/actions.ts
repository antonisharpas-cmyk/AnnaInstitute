"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { readSetting } from "@/lib/settings";
import { sendAndRecord } from "@/lib/messaging";
import { projectReportData, projectReportPdf } from "@/lib/projectReport";
import { fillReportText } from "@/lib/projectReportMail";

/**
 * The status report, emailed to the people the office wrote in.
 *
 * Each line on the form is a name and an email address. Each person gets their
 * own email, with their own name where the text says {name}, and the PDF made
 * out to them ("Update for ..."). Recorded with the other messages, so it
 * shows what went to whom and when.
 */
export async function emailProjectReport(projectId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const data = await projectReportData(projectId);
  if (!data) return;

  const names = formData.getAll("toName").map((one) => String(one).trim());
  const emails = formData.getAll("toEmail").map((one) => String(one).trim());
  /* One email per address, the first name written for it. */
  const seen = new Set<string>();
  const recipients = emails
    .map((email, i) => ({ name: names[i] ?? "", email }))
    .filter((one) => {
      const key = one.email.toLowerCase();
      if (!one.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(one.email) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (recipients.length === 0) {
    await flash("said.reportNoneChosen", "bad");
    return;
  }
  if (!subject || !body) {
    await flash("said.reportNeedsText", "bad");
    return;
  }

  const companyName = await readSetting("company.name");
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const fileName = `Project status ${data.project.name} ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|]/g, " ");

  let sent = 0;
  const failed: string[] = [];
  for (const one of recipients) {
    const values = { name: one.name, project: data.project.name, date };
    const pdf = await projectReportPdf(data, one.name, companyName);
    const result = await sendAndRecord({
      channel: "EMAIL",
      recipient: { name: one.name, email: one.email },
      subject: fillReportText(subject, values),
      body: fillReportText(body, values),
      withOptOut: false,
      attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
    });
    if (result.status === "SENT" || result.status === "SIMULATED") sent += 1;
    else failed.push(`${one.name}: ${result.error ?? result.status}`);
  }

  await recordAudit({
    action: "report.project.email",
    entity: "project",
    entityId: projectId,
    detail: `${data.project.name}: ${sent} of ${recipients.length} sent${failed.length ? `. Not sent: ${failed.join("; ").slice(0, 300)}` : ""}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(
    failed.length === 0
      ? `said.reportSent|${recipients.map((one) => one.name).join(", ").slice(0, 200)}`
      : `said.reportPartly|${sent} sent. Not sent: ${failed.join("; ").slice(0, 200)}`,
    failed.length === 0 ? "good" : "bad",
  );
  revalidatePath("/reports/project");
}
