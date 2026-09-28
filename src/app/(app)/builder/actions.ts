"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { choices } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { recordAudit } from "@/lib/audit";
import { forgetChoices, isListKey, LIST_BY_KEY, listEntries, makeCode, type ListKey } from "@/lib/choices";
import { usageOf } from "@/lib/choices/usage";

/**
 * Saving in the Builder.
 *
 * Three things happen here: a value is renamed, switched on or off or moved
 * (saveChoice), a value is added (addChoice), and a value the office added and
 * never used is taken away (removeChoice). Whatever happens, the kept copy of
 * the lists is forgotten and every page is drawn again, so the new words are
 * everywhere at once.
 */

const clean = (value: FormDataEntryValue | null, max = 60) => String(value ?? "").trim().slice(0, max);

function done(list: string) {
  forgetChoices();
  revalidatePath("/", "layout");
  return list;
}

/** Write one value's row, creating it the first time a built in one is touched. */
async function keep(list: ListKey, code: string, values: Partial<typeof choices.$inferInsert>, builtin: boolean) {
  await db
    .insert(choices)
    .values({ list, code, builtin, ...values })
    .onConflictDoUpdate({
      target: [choices.list, choices.code],
      set: { ...values, updatedAt: new Date() },
    });
}

export async function saveChoice(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const list = String(formData.get("list") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!isListKey(list)) return;

  const entries = await listEntries(list);
  const entry = entries.find((one) => one.code === code);
  if (!entry) {
    await flash("builder.said.notFound", "bad");
    return;
  }

  /* Moving: swap places with the neighbour, and write the whole order down so it holds. */
  const move = String(formData.get("move") ?? "");
  if (move === "up" || move === "down") {
    const at = entries.findIndex((one) => one.code === code);
    const to = move === "up" ? at - 1 : at + 1;
    if (to >= 0 && to < entries.length) {
      const order = [...entries];
      [order[at], order[to]] = [order[to], order[at]];
      for (const [index, one] of order.entries()) {
        await keep(list, one.code, { sortOrder: (index + 1) * 10 }, one.builtin);
      }
    }
    done(list);
    return;
  }

  /* Switching on or off, one press. A value the CRM needs stays on. */
  const toggle = String(formData.get("toggle") ?? "");
  if (toggle === "on" || toggle === "off") {
    if (entry.locked && toggle === "off") {
      await flash("builder.said.locked", "bad");
      return;
    }
    await keep(list, code, { active: toggle === "on", sortOrder: entry.order }, entry.builtin);
    await recordAudit({
      action: `builder.${toggle}`,
      entity: "choice",
      entityId: `${list}:${code}`,
      userId: user.id,
      userEmail: user.email,
    });
    await flash(toggle === "on" ? "builder.said.on" : "builder.said.off");
    done(list);
    return;
  }

  /* Renaming. The CRM's own word again is kept as no word at all. */
  let labelEn: string | null = clean(formData.get("labelEn"));
  let labelEl: string | null = clean(formData.get("labelEl"));
  if (!entry.builtin && !labelEn) {
    await flash("builder.said.needName", "bad");
    return;
  }
  if (entry.builtin) {
    if (!labelEn || labelEn === entry.defaultEn) labelEn = null;
    if (!labelEl || labelEl === entry.defaultEl) labelEl = null;
  } else if (!labelEl) {
    labelEl = null;
  }

  await keep(list, code, { labelEn, labelEl, sortOrder: entry.order }, entry.builtin);
  await recordAudit({
    action: "builder.rename",
    entity: "choice",
    entityId: `${list}:${code}`,
    detail: [labelEn ?? entry.defaultEn, labelEl ?? ""].filter(Boolean).join(" / "),
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  done(list);
}

export async function addChoice(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const list = String(formData.get("list") ?? "");
  if (!isListKey(list)) return;

  const labelEn = clean(formData.get("labelEn"));
  const labelEl = clean(formData.get("labelEl")) || null;
  const countsAs = String(formData.get("countsAs") ?? "");
  const allowed = LIST_BY_KEY[list].builtins.filter((one) => !one.auto).map((one) => one.code);

  if (!labelEn) {
    await flash("builder.said.needName", "bad");
    return;
  }
  if (!allowed.includes(countsAs)) {
    await flash("builder.said.needCountsAs", "bad");
    return;
  }

  const entries = await listEntries(list);
  if (entries.some((one) => (one.labelEn?.trim() || one.defaultEn).toLowerCase() === labelEn.toLowerCase())) {
    await flash("builder.said.twice", "bad");
    return;
  }

  const code = makeCode(countsAs, labelEn);
  const last = entries.reduce((most, one) => Math.max(most, one.order), 0);
  await db.insert(choices).values({ list, code, labelEn, labelEl, builtin: false, active: true, sortOrder: last + 10 });
  await recordAudit({
    action: "builder.add",
    entity: "choice",
    entityId: `${list}:${code}`,
    detail: `${labelEn}, counts as ${countsAs}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("builder.said.added");
  done(list);
}

export async function removeChoice(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const list = String(formData.get("list") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!isListKey(list)) return;

  const entry = (await listEntries(list)).find((one) => one.code === code);
  if (!entry || entry.builtin) {
    await flash("builder.said.cannotRemove", "bad");
    return;
  }

  /* Something that is on a record stays, switched off, so the record still reads. */
  const used = (await usageOf(list)).get(code) ?? 0;
  if (used > 0) {
    await keep(list, code, { active: false }, false);
    await flash(`builder.said.inUse|${used}`, "bad");
    done(list);
    return;
  }

  await db.delete(choices).where(and(eq(choices.list, list), eq(choices.code, code)));
  await recordAudit({
    action: "builder.remove",
    entity: "choice",
    entityId: `${list}:${code}`,
    detail: entry.labelEn ?? "",
    userId: user.id,
    userEmail: user.email,
  });
  await flash("builder.said.removed");
  done(list);
}
