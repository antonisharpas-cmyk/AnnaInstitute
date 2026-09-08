import { NextResponse } from "next/server";
import { looksLikeStop } from "@/lib/messaging/text";
import { suppressAndMarkClients } from "@/lib/suppression";
import { recordAudit } from "@/lib/audit";

/**
 * Inbound text messages from SMS.to.
 *
 * This is what makes "reply STOP to opt out" a real promise rather than a
 * sentence in a message. Point the inbound webhook of the SMS.to account at:
 *
 *   POST {APP_URL}/api/webhooks/sms-inbound?secret={SMSTO_CALLBACK_SECRET}
 *
 * The payload is treated as data only. Nothing in it is followed as an
 * instruction: the number is normalised, the text is checked against a list of
 * stop words, and that is all that happens.
 */
function authorised(request: Request): boolean {
  const expected = process.env.SMSTO_CALLBACK_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  const given = url.searchParams.get("secret") ?? request.headers.get("x-webhook-secret") ?? "";
  return given === expected;
}

function readPayload(payload: Record<string, unknown>) {
  const from =
    (payload.from as string) ??
    (payload.sender as string) ??
    (payload.msisdn as string) ??
    (payload.originator as string) ??
    "";
  const text =
    (payload.message as string) ??
    (payload.text as string) ??
    (payload.body as string) ??
    (payload.content as string) ??
    "";
  return { from: String(from ?? ""), text: String(text ?? "") };
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "not authorised" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = (await request.json()) as Record<string, unknown>;
    } else {
      payload = Object.fromEntries(new URLSearchParams(await request.text()));
    }
  } catch {
    return NextResponse.json({ error: "unreadable payload" }, { status: 400 });
  }

  const { from, text } = readPayload(payload);
  if (!from) return NextResponse.json({ error: "no sender" }, { status: 400 });

  if (!looksLikeStop(text)) {
    await recordAudit({
      action: "sms.inbound",
      entity: "message",
      detail: `${from}: ${text.slice(0, 140)}`,
      userEmail: "sms webhook",
    });
    return NextResponse.json({ ok: true, action: "logged" });
  }

  const result = await suppressAndMarkClients({
    channel: "PHONE",
    value: from,
    reason: `Replied with a stop keyword: ${text.slice(0, 60)}`,
    source: "sms webhook",
  });

  return NextResponse.json({ ok: true, action: "suppressed", clientsMarked: result.clientsMarked });
}
