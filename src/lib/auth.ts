import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

const COOKIE = "oe_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value === "change_me") {
    throw new Error("AUTH_SECRET is not set. See .env.example.");
  }
  return new TextEncoder().encode(value);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "AGENT" | "BUYER";
  locale: string;
  /** Kept on the record for later. Nothing outside the office has a login today. */
  clientId: string | null;
  /** Set on an agent login. */
  agentId: string | null;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user: SessionUser = {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as SessionUser["role"],
      locale: String(payload.locale ?? "en"),
      clientId: payload.clientId ? String(payload.clientId) : null,
      agentId: payload.agentId ? String(payload.agentId) : null,
    };
    const issuedAt = typeof payload.iat === "number" ? payload.iat * 1000 : 0;
    return (await stillAllowed(user.id, issuedAt)) ? user : null;
  } catch {
    return null;
  }
}

/**
 * Is this login still allowed in?
 *
 * A login switched off is out at once, not only at its next sign in, and a
 * session made before its password was reset or changed is no longer
 * accepted. Asked once per request. If the database cannot answer, which
 * before the newest update has run means a missing column, the signed
 * session alone decides, so nobody is locked out by an update.
 */
const stillAllowed = cache(async (userId: string, issuedAt: number): Promise<boolean> => {
  try {
    const [row] = await db
      .select({ isActive: users.isActive, sessionsValidFrom: users.sessionsValidFrom })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row || !row.isActive) return false;
    /* A second of grace: the session made in the same second as the change is the new one. */
    if (row.sessionsValidFrom && issuedAt < row.sessionsValidFrom.getTime() - 1000) return false;
    return true;
  } catch {
    return true;
  }
});

export async function requireUser(roles?: SessionUser["role"][]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  const row = rows[0];
  if (!row || !row.isActive) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    locale: row.locale,
    clientId: row.clientId,
    agentId: row.agentId,
  };
}
