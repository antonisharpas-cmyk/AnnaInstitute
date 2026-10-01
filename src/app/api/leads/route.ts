import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { keyFromRequest, touchApiKey } from "@/lib/apiKeys";
import { matchProject, readLeadPayload, recentDuplicate } from "@/lib/leads";
import { recordAudit } from "@/lib/audit";

/**
 * Where the website posts a lead.
 *
 *   POST {APP_URL}/api/leads
 *   X-Api-Key: the key made in the CRM, under Leads, API access
 *   Content-Type: application/json
 *
 * Server to server only. The key must never sit in a page's JavaScript, so this
 * endpoint answers no browser preflight and sends no CORS headers: the website's
 * own server takes the form, then posts it here.
 *
 * Everything in the payload is data. It is read field by field, trimmed, cut to
 * length and stored. Nothing in it is executed or followed as an instruction,
 * and a lead is never a client until somebody in the office makes it one.
 */

const MAX_BODY = 64 * 1024;
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 120;

const seen = new Map<string, { count: number; until: number }>();

function withinRate(keyId: string): boolean {
  const now = Date.now();
  const entry = seen.get(keyId);
  if (!entry || entry.until < now) {
    seen.set(keyId, { count: 1, until: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

function callerIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}

export async function POST(request: Request) {
  const key = await keyFromRequest(request);
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "unauthorised", detail: "Send a live key in the X-Api-Key header." },
      { status: 401 },
    );
  }

  if (!withinRate(key.id)) {
    return NextResponse.json(
      { ok: false, error: "too many requests", detail: `At most ${MAX_PER_WINDOW} a minute.` },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    payload = contentType.includes("application/json")
      ? (JSON.parse(raw || "{}") as Record<string, unknown>)
      : (Object.fromEntries(new URLSearchParams(raw)) as Record<string, unknown>);
  } catch {
    return NextResponse.json(
      { ok: false, error: "unreadable payload", detail: "The body is not valid JSON." },
      { status: 400 },
    );
  }

  await touchApiKey(key.id, key.useCount);

  // A rehearsal from the website developer. The key is checked, the payload is
  // read, and nothing is written, so they can prove the wiring before go live.
  if (payload.test === true || payload.test === "true") {
    return NextResponse.json({ ok: true, test: true, read: readLeadPayload(payload) });
  }

  const fields = readLeadPayload(payload);
  if (!fields.email && !fields.phone) {
    return NextResponse.json(
      {
        ok: false,
        error: "no way to reply",
        detail: "Send at least an email or a phone number.",
      },
      { status: 400 },
    );
  }

  const duplicate = await recentDuplicate(fields.email, fields.phone);
  if (duplicate) {
    return NextResponse.json({ ok: true, id: duplicate, duplicate: true }, { status: 200 });
  }

  const projectId = await matchProject(fields.projectName);

  const inserted = await db
    .insert(leads)
    .values({
      ...fields,
      projectId,
      payload: raw.slice(0, MAX_BODY),
      apiKeyId: key.id,
      remoteIp: callerIp(request),
    })
    .returning({ id: leads.id });

  await recordAudit({
    action: "lead.received",
    entity: "lead",
    entityId: inserted[0].id,
    detail: `${key.name}: ${fields.email ?? fields.phone ?? ""}`,
    userEmail: `api:${key.prefix}`,
  });

  return NextResponse.json({ ok: true, id: inserted[0].id }, { status: 201 });
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "method not allowed",
      detail: "Post a lead here with an X-Api-Key header. Nothing is readable over this endpoint.",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
