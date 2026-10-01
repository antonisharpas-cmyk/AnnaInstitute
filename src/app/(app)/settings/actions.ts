"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { recordAudit } from "@/lib/audit";
import { writeSetting } from "@/lib/settings";
import { sendDailySummary } from "@/lib/appointmentSummary";
import { sendEmail } from "@/lib/messaging/email";

/**
 * The few things the office sets once.
 *
 * Saved as they are typed and read back on the same page, so there is never a
 * question of whether a setting took.
 */
export async function saveAppointmentSettings(formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const hour = Number(String(formData.get("hour") ?? "21"));
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.trunc(hour))) : 21;

  await writeSetting("appointments.summaryOn", formData.get("on") === "on" ? "yes" : "no");
  await writeSetting("appointments.summaryHour", String(safeHour));
  await writeSetting(
    "appointments.summaryWhenEmpty",
    formData.get("whenEmpty") === "on" ? "yes" : "no",
  );

  /* The buyer's reminder the day before. Not after 20:00, so it never lands at night. */
  const reminder = Number(String(formData.get("reminderHour") ?? "10"));
  const safeReminder = Number.isFinite(reminder) ? Math.min(20, Math.max(0, Math.trunc(reminder))) : 10;
  await writeSetting("appointments.reminderOn", formData.get("reminderOn") === "on" ? "yes" : "no");
  await writeSetting("appointments.reminderHour", String(safeReminder));

  await recordAudit({
    action: "settings.appointments",
    entity: "settings",
    entityId: "appointments",
    detail: `hour ${safeHour}, on ${formData.get("on") === "on"}, empty ${formData.get("whenEmpty") === "on"}`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saved");
  revalidatePath("/settings");
}

/** Sent by hand, so the office can see it work rather than wait until nine. */
export async function sendSummaryNow() {
  const user = await requireUser(["ADMIN"]);
  await sendDailySummary({ byHand: true, who: { id: user.id, email: user.email } });
  await flash("said.summarySent");
  revalidatePath("/settings");
}

/** The company as its invoices and receipts name it, and where the numbers carry on from. */
const COMPANY_FIELDS = [
  "name",
  "registration",
  "vat",
  "tic",
  "address",
  "phone",
  "mobile",
  "fax",
  "email",
  "website",
  "bankName",
  "beneficiary",
  "bankAccount",
  "iban",
  "swift",
] as const;

export async function saveCompanySettings(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  for (const field of COMPANY_FIELDS) {
    await writeSetting(`company.${field}`, String(formData.get(field) ?? "").trim());
  }
  for (const [field, key] of [
    ["nextInvoice", "numbers.nextInvoice"],
    ["nextReceipt", "numbers.nextReceipt"],
    ["nextCreditNote", "numbers.nextCreditNote"],
  ] as const) {
    const n = Math.trunc(Number(String(formData.get(field) ?? "").replace(/\D/g, "")));
    if (Number.isFinite(n) && n > 0) await writeSetting(key, String(n));
  }
  await recordAudit({
    action: "settings.company",
    entity: "settings",
    detail: "company details and numbering",
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  revalidatePath("/settings");
}

/**
 * Send one plain email to prove the mail account works.
 *
 * It says exactly what the mail server answered, because when email does not
 * arrive the only useful thing is the server's own words.
 */
export async function sendTestEmail(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const to = String(formData.get("to") ?? "").trim() || user.email;
  const result = await sendEmail({
    to,
    subject: "One Eleven CRM: test email",
    text: "This is a test from the One Eleven CRM. If you are reading it, the automatic emails can go out.",
    html: "<p>This is a test from the One Eleven CRM. If you are reading it, the automatic emails can go out.</p>",
    /* The test goes only to the office itself, so it is allowed even while
       every other email is switched off: that is when it is most useful. */
    pastTheSwitch: true,
  });
  await recordAudit({
    action: "settings.testEmail",
    entity: "settings",
    detail: `${to}: ${result.status}${result.error ? `, ${result.error}` : ""}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(
    result.status === "SENT"
      ? `said.testEmailSent|${to}`
      : `said.testEmailFailed|${String(result.error ?? "no answer").slice(0, 200)}`,
    result.status === "SENT" ? "good" : "bad",
  );
  revalidatePath("/settings");
}

/** The master switch: every email from the CRM, on or off. */
export async function setAllEmails(on: boolean) {
  const user = await requireUser(["ADMIN"]);
  await writeSetting("mail.enabled", on ? "yes" : "no");
  await recordAudit({
    action: on ? "settings.emailsOn" : "settings.emailsOff",
    entity: "settings",
    detail: on ? "all emails switched on" : "all emails switched off",
    userId: user.id,
    userEmail: user.email,
  });
  await flash(on ? "said.emailsOn" : "said.emailsOff", on ? "good" : "bad");
  revalidatePath("/", "layout");
}
