"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { keysIn, requiredKeys } from "@/lib/templates";

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
      subjectEl: subjectEl || null,
      bodyEl: bodyEl || null,
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
