import { NextResponse } from "next/server";
import { keyFromRequest, touchApiKey } from "@/lib/apiKeys";
import { sendDailySummary, summaryIsDue } from "@/lib/appointmentSummary";
import { sendAppointmentReminders } from "@/lib/automaticEmails";
import { readSettings } from "@/lib/settings";

/**
 * Where the day's summaries are asked for.
 *
 *   POST {APP_URL}/api/appointments/summary
 *   X-Api-Key: a key made in the CRM, under Leads, API access
 *
 * Two callers. The CRM's own evening ticker knocks here every ten minutes with
 * an internal token and the body {"due":true}, which means "only if the hour
 * has come and today's summary has not gone". And anybody with an API key can
 * call it outright, which is how a scheduler drives it and how the office
 * proves it works without waiting until nine.
 *
 * Server to server only: a key must never sit in a page's JavaScript, so there
 * is no CORS header here and no browser preflight is answered.
 */
export async function POST(request: Request) {
  /*
   * The CRM's own ticker, which lives in this same process and shares its
   * environment. A token made fresh at start up, so nothing outside the
   * process can have it.
   */
  const tick = request.headers.get("x-internal-tick");
  const expected = process.env.OE_TICK_TOKEN;
  const fromInside = Boolean(tick && expected && tick === expected);

  if (!fromInside) {
    const key = await keyFromRequest(request);
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "unauthorised", detail: "Send a live key in the X-Api-Key header." },
        { status: 401 },
      );
    }
    await touchApiKey(key.id, key.useCount);
  }

  /* "Only if it is due" is what the ticker means. Anybody else meant now. */
  let onlyIfDue = false;
  try {
    const body = (await request.json()) as { due?: boolean };
    onlyIfDue = body?.due === true;
  } catch {
    onlyIfDue = false;
  }

  /*
   * The reminders ride on the same clock.
   *
   * Every knock also looks for tomorrow's appointments that have not had their
   * reminder, inside the hours the office set. It answers to itself, so the
   * ten minute ticker sends each reminder exactly once, and it never gets in
   * the way of the summary, which carries on below whatever happens here.
   */
  let reminders = { sent: 0, looked: 0 };
  try {
    const config = await readSettings(["appointments.reminderOn", "appointments.reminderHour"]);
    if (config["appointments.reminderOn"] !== "no") {
      reminders = await sendAppointmentReminders({
        hour: Number.isFinite(Number(config["appointments.reminderHour"]))
          ? Number(config["appointments.reminderHour"])
          : 10,
        byHand: !onlyIfDue,
      });
    }
  } catch {
    /* A reminder that fails is recorded as failed where it failed. */
  }

  if (onlyIfDue && !(await summaryIsDue())) {
    return NextResponse.json({ ok: true, skipped: true, reminders });
  }

  const outcomes = await sendDailySummary({ byHand: !onlyIfDue });

  return NextResponse.json({
    ok: true,
    sent: outcomes.filter((one) => one.sent).length,
    of: outcomes.length,
    outcomes,
    reminders,
  });
}
