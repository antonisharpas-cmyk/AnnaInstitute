import "server-only";
import { cookies } from "next/headers";

/**
 * What just happened, said once.
 *
 * A server action drops a short line in a cookie, the shell shows it as a
 * message at the bottom of the screen, and the cookie is cleared as it is read.
 * That is the whole mechanism: no client state to keep in step, and it survives
 * the redirect that usually follows a save.
 */
const COOKIE = "oe_said";

export type FlashTone = "good" | "bad";

export async function flash(message: string, tone: FlashTone = "good"): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, JSON.stringify({ message, tone }), {
    path: "/",
    maxAge: 30,
    httpOnly: false,
    sameSite: "lax",
  });
}

export async function readFlash(): Promise<{ message: string; tone: FlashTone } | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { message?: string; tone?: FlashTone };
    if (!parsed.message) return null;
    return { message: parsed.message, tone: parsed.tone === "bad" ? "bad" : "good" };
  } catch {
    return null;
  }
}
