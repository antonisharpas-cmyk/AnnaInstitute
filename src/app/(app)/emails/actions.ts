"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { keysIn, requiredKeys } from "@/lib/templates";
import { readSetting, writeSetting } from "@/lib/settings";
import { isTestKey, sendTestLetter } from "@/lib/testLetters";

/**
 * The automatic emails: switched on or off, and rewritten.
 *
 * Two deliberate limits. One of these letters cannot be deleted, because the
 * CRM sends it by itself and a missing letter would be a silence nobody
 * notices. And the keys in braces cannot be dropped: the office is welcome to
 * every word around them, in either language, but {{first_name}} is where the
 * buyer's name goes, and a letter saved without it would go out addressed to
 * nobody. The save says which key is missing rather than quietly putting it
 * back, because it is their letter and they should decide where it belongs.
 */

export async function switchAutomatic(templateId: string, on: boolean) {
  const user = await requireUser(["ADMIN"]);

  await db
    .update(emailTemplates)
    .set({ isActive: on, updatedAt: new Date() })
    .where(eq(emailTemplates.id, templateId));

  await recordAudit({
    action: on ? "email.automatic.on" : "email.automatic.off",
    entity: "email_template",
    entityId: templateId,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saved");
  revalidatePath("/emails");
}

export async function saveAutomatic(templateId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);

  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.id, templateId))
    .limit(1);
  if (!template) return;

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const subjectEl = String(formData.get("subjectEl") ?? "").trim();
  const bodyEl = String(formData.get("bodyEl") ?? "").trim();

  if (!body) {
    await flash("said.emailNeedsWords", "bad");
    revalidatePath("/emails");
    return;
  }

  /* Every key the shipped letter carries has to still be there, in whichever
     language is being saved. A language left empty is not checked, because an
     empty Greek letter simply means the English one is used. */
  const wanted = requiredKeys(template.key);
  const check = (text: string) => wanted.filter((key) => !keysIn(text).includes(key));

  const missing = new Set<string>([
    ...check(`${subject} ${body}`),
    ...(subjectEl || bodyEl ? check(`${subjectEl} ${bodyEl}`) : []),
  ]);

  if (missing.size > 0) {
    await flash("said.emailKeyMissing", "bad");
    revalidatePath("/emails");
    return;
  }

  await db
    .update(emailTemplates)
    .set({
      subject: subject || null,
      body,
      /* The Greek wording is no longer offered: kept as it was if not sent. */
      subjectEl: formData.has("subjectEl") ? subjectEl || null : undefined,
      bodyEl: formData.has("bodyEl") ? bodyEl || null : undefined,
      updatedAt: new Date(),
    })
    .where(eq(emailTemplates.id, templateId));

  await recordAudit({
    action: "email.automatic.reworded",
    entity: "email_template",
    entityId: templateId,
    detail: template.key,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saved");
  revalidatePath("/emails");
}

/**
 * Where the tests go.
 *
 * Kept, so the office types its own address once and then presses Send test
 * down the list, one letter after another.
 */
export async function saveTestAddress(formData: FormData) {
  await requireUser(["ADMIN"]);
  const to = String(formData.get("to") ?? "").trim();
  if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    await flash("said.testAddressBad", "bad");
    return;
  }
  await writeSetting("emails.testAddress", to);
  await flash("said.saved");
  revalidatePath("/emails");
}

/** One automatic email, as a test, to the office's own address. */
export async function sendTestLetterNow(key: string) {
  const user = await requireUser(["ADMIN"]);
  if (!isTestKey(key)) return;
  const to = (await readSetting("emails.testAddress"))?.trim() || user.email;

  const result = await sendTestLetter(key, to);
  await recordAudit({
    action: "email.automatic.test",
    entity: "email_template",
    entityId: key,
    detail: `${to}: ${result.detail}`.slice(0, 300),
    userId: user.id,
    userEmail: user.email,
  });
  await flash(
    result.ok ? `said.testLetterSent|${result.detail}` : `said.testLetterFailed|${result.detail.slice(0, 200)}`,
    result.ok ? "good" : "bad",
  );
  revalidatePath("/emails");
}
