"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession, requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { applyUndo, forgetUndo, readUndo } from "@/lib/undo";
import { LOCALE_COOKIE } from "@/i18n";

export async function signOut() {
  await destroySession();
  redirect("/login");
}

export async function setLocale(formData: FormData) {
  const locale = String(formData.get("locale") ?? "en") === "el" ? "el" : "en";
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

/**
 * The Undo button on the line at the bottom of the screen.
 *
 * It reads what the last action left behind, puts those records back the way
 * they were, and says how many. If the offer has already expired, or has been
 * used, it says so rather than pretending to work.
 */
export async function undoLast() {
  const user = await requireUser(["ADMIN"]);
  const undo = await readUndo();

  if (!undo) {
    await flash("said.nothingToUndo", "bad");
    revalidatePath("/", "layout");
    return;
  }

  const touched = await applyUndo(undo, { id: user.id, email: user.email });
  await forgetUndo();
  await flash(touched > 0 ? "said.undone" : "said.nothingToUndo", touched > 0 ? "good" : "bad");
  revalidatePath("/", "layout");
}
