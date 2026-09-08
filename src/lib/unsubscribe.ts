import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One click unsubscribe for email. The link carries the client id and a short
 * signature, so it works without a login and without storing a token.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

export function unsubscribeToken(clientId: string): string {
  return createHmac("sha256", secret()).update(`unsubscribe:${clientId}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribeToken(clientId: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(clientId));
  const given = Buffer.from(token ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function unsubscribeUrl(clientId: string): string {
  return `${appUrl()}/api/unsubscribe?c=${encodeURIComponent(clientId)}&t=${unsubscribeToken(clientId)}`;
}
