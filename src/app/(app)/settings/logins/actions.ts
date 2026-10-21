"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword, requireUser, verifyPassword, type SessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";

/*
 * The office's logins: who can sign in, added, renamed, given a new password
 * and switched off, all from Settings rather than from the server's settings.
 *
 * Everyone is an administrator for now. The role is kept on every login, so
 * separate access levels can be added later without touching who is here.
 * No password is ever written to the activity log, only that it changed.
 */

const MIN_PASSWORD = 8;
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** The logins of the office: the people who work in the CRM, not the buyers. */
const office = sql`${users.role} = 'ADMIN'`;

async function officeLogin(id: string) {
  const [row] = await db.select().from(users).where(and(eq(users.id, id), office)).limit(1);
  return row ?? null;
}

/** After a change to one's own login, the session carries the new name and email. */
async function refreshOwnSession(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!row) return;
  const session: SessionUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    locale: row.locale,
    clientId: row.clientId,
    agentId: row.agentId,
  };
  await createSession(session);
}

const done = () => revalidatePath("/settings/logins");

export async function addLogin(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) return flash("said.loginNeedsName", "bad");
  if (!looksLikeEmail(email)) return flash("said.loginBadEmail", "bad");
  if (password.length < MIN_PASSWORD) return flash("said.passwordShort", "bad");
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (taken) return flash("said.loginExists", "bad");

  const [made] = await db
    .insert(users)
    .values({ email, name, passwordHash: await hashPassword(password), role: "ADMIN", isActive: true })
    .returning({ id: users.id });

  await recordAudit({
    action: "login.add",
    entity: "user",
    entityId: made.id,
    detail: `${name} <${email}>, administrator`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(`said.loginAdded|${name}`);
  done();
}

export async function saveLogin(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const row = await officeLogin(id);
  if (!row) return;
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!name) return flash("said.loginNeedsName", "bad");
  if (!looksLikeEmail(email)) return flash("said.loginBadEmail", "bad");
  if (email !== row.email) {
    const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, id))).limit(1);
    if (taken) return flash("said.loginExists", "bad");
  }

  await db.update(users).set({ name, email, updatedAt: new Date() }).where(eq(users.id, id));
  if (id === user.id) await refreshOwnSession(id);
  await recordAudit({
    action: "login.edit",
    entity: "user",
    entityId: id,
    detail: `${row.name} <${row.email}> is now ${name} <${email}>`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.loginSaved");
  done();
}

export async function resetLoginPassword(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const row = await officeLogin(id);
  if (!row) return;
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return flash("said.passwordShort", "bad");

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), sessionsValidFrom: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id));
  /* Resetting one's own password keeps this window signed in, with the new session. */
  if (id === user.id) await refreshOwnSession(id);
  await recordAudit({
    action: "login.reset",
    entity: "user",
    entityId: id,
    detail: `${row.name} <${row.email}>: password reset, signed out everywhere`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.passwordReset");
  done();
}

export async function setLoginActive(id: string, on: boolean) {
  const user = await requireUser(["ADMIN"]);
  const row = await officeLogin(id);
  if (!row) return;
  if (!on) {
    if (id === user.id) return flash("said.loginNotSelf", "bad");
    const [others] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(office, eq(users.isActive, true), ne(users.id, id)));
    if (Number(others?.n ?? 0) === 0) return flash("said.loginLastAdmin", "bad");
  }

  await db.update(users).set({ isActive: on, updatedAt: new Date() }).where(eq(users.id, id));
  await recordAudit({
    action: on ? "login.on" : "login.off",
    entity: "user",
    entityId: id,
    detail: `${row.name} <${row.email}>`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash(`${on ? "said.loginSwitchedOn" : "said.loginSwitchedOff"}|${row.name}`);
  done();
}

/** Anybody signed in changes their own password, knowing the current one. */
export async function changeOwnPassword(formData: FormData) {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const again = String(formData.get("again") ?? "");

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !(await verifyPassword(current, row.passwordHash))) return flash("said.passwordWrong", "bad");
  if (next.length < MIN_PASSWORD) return flash("said.passwordShort", "bad");
  if (next !== again) return flash("said.passwordsDiffer", "bad");

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), sessionsValidFrom: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await refreshOwnSession(user.id);
  await recordAudit({
    action: "login.ownPassword",
    entity: "user",
    entityId: user.id,
    detail: "Changed their own password; other devices signed out",
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.passwordChanged");
  revalidatePath("/account/password");
}
