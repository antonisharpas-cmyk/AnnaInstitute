import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, leads } from "@/db/schema";
import { addSuppression } from "@/lib/suppression";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

/**
 * One click unsubscribe from an email footer. No login, no confirmation step.
 * The address goes on the suppression list and the client record is marked, and
 * neither of those can be undone from the interface.
 */
async function unsubscribe(clientId: string, token: string) {
  if (!clientId || !verifyUnsubscribeToken(clientId, token)) return { ok: false as const };

  const rows = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  const client = rows[0];
  if (!client) return { ok: false as const };

  if (client.email) {
    await addSuppression({
      channel: "EMAIL",
      value: client.email,
      reason: "Unsubscribed from an email link",
      source: "unsubscribe link",
    });
  }

  await db
    .update(clients)
    .set({
      marketingOptIn: false,
      unsubscribedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));

  return { ok: true as const, name: client.firstName };
}

/** A lead: their address goes on the suppression list, which every send checks. */
async function unsubscribeLead(leadId: string, token: string) {
  if (!leadId || !verifyUnsubscribeToken(`lead:${leadId}`, token)) return { ok: false as const };
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { ok: false as const };
  if (lead.email) {
    await addSuppression({
      channel: "EMAIL",
      value: lead.email,
      reason: "Unsubscribed from an email link",
      source: "unsubscribe link",
    });
  }
  return { ok: true as const, name: lead.firstName ?? "" };
}

const either = (url: URL) =>
  url.searchParams.get("l")
    ? unsubscribeLead(url.searchParams.get("l") ?? "", url.searchParams.get("t") ?? "")
    : unsubscribe(url.searchParams.get("c") ?? "", url.searchParams.get("t") ?? "");

function page(title: string, message: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f9faf9;font-family:system-ui,Arial,sans-serif;color:#121111">
<div style="max-width:28rem;padding:2rem;text-align:center">
<h1 style="font-size:1.25rem;margin:0 0 .75rem">${title}</h1>
<p style="font-size:.95rem;line-height:1.6;color:#4d4d4f;margin:0">${message}</p>
</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await either(url);

  return result.ok
    ? page(
        "You have been removed",
        "You will not receive any more messages from us. Nothing else about your purchase changes, and your account and payment schedule are untouched.",
      )
    : page(
        "That link is not valid",
        "The link may be old or incomplete. Reply to any of our emails and we will remove you by hand.",
      );
}

/** Mail clients that support one click unsubscribe send a POST. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const result = await either(url);
  return new Response(null, { status: result.ok ? 200 : 400 });
}
