import { randomBytes } from "node:crypto";

/** Short, unguessable, url safe identifier. */
export function createId(): string {
  return randomBytes(12).toString("base64url");
}
