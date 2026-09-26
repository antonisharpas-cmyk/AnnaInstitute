"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { matchProject, recentDuplicate } from "@/lib/leads";
import { recordAudit } from "@/lib/audit";
import { QR_CONSENT_TEXT as CONSENT_TEXT } from "@/lib/qrLead";

/**
 * A person scanning the QR code in the office or at the building.
 *
 * No login, so everything here is treated as a stranger's input: every field is
 * trimmed and cut to length, nothing in it is followed, a hidden field catches
 * the robots that fill in every box, and one address can send only a few in an
 * hour. What arrives is an enquiry like any other, in Leads, marked as coming
 * from the QR code. Marketing consent is recorded only when the person ticked
 * the box themselves, with the words they agreed to, which is what makes it
 * consent.
 */


const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const seen = new Map<string, { count: number; until: number }>();

function allowed(ip: string): boolean {
  const now = Date.now();
  const entry = seen.get(ip);
  if (!entry || entry.until < now) {
    seen.set(ip, { count: 1, until: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

const clean = (value: FormDataEntryValue | null, max = 120) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max) || null;

export async function sendPersonalInformation(formData: FormData) {
  /* The box people never see. Anything in it is a robot: thank it and stop. */
  if (String(formData.get("website") ?? "").trim()) redirect("/personal-information?sent=1");

  const head = await headers();
  const ip = (head.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || head.get("x-real-ip") || "local";
  if (!allowed(ip)) redirect("/personal-information?sent=1");

  const firstName = clean(formData.get("firstName"), 80);
  const lastName = clean(formData.get("lastName"), 80);
  const email = clean(formData.get("email"), 160)?.toLowerCase() ?? null;
  const phone = clean(formData.get("phone"), 40);
  const interest = clean(formData.get("interest"), 160);
  const country = clean(formData.get("country"), 80);
  const message = clean(formData.get("message"), 1000);
  const consent = formData.get("consent") === "on";

  const emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!firstName || !lastName || (!email && !phone) || !emailOk) {
    redirect("/personal-information?missing=1");
  }

  const duplicate = await recentDuplicate(email, phone);
  if (duplicate) redirect("/personal-information?sent=1");

  const projectId = interest ? await matchProject(interest) : null;
  const [row] = await db
    .insert(leads)
    .values({
      firstName,
      lastName,
      email,
      phone,
      country,
      message,
      interest,
      projectName: interest,
      projectId,
      sourceKind: "OTHER",
      source: "QR code",
      formName: "Personal information (QR code)",
      pageUrl: "/personal-information",
      consent,
      consentText: consent ? `QR code form: ${CONSENT_TEXT}` : null,
      remoteIp: ip === "local" ? null : ip,
    })
    .returning({ id: leads.id });

  await recordAudit({
    action: "lead.received",
    entity: "lead",
    entityId: row.id,
    detail: `QR code form: ${email ?? phone ?? ""}${consent ? ", marketing consent given" : ""}`,
    userEmail: "qr-code-form",
  });

  redirect("/personal-information?sent=1");
}
