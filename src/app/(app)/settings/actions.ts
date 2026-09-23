"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { recordAudit } from "@/lib/audit";
import { writeSetting } from "@/lib/settings";
import { sendDailySummary } from "@/lib/appointmentSummary";

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
