"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { LISTS, removeView, saveColumns, saveView, updateView, type ListKey } from "@/lib/lists";
import { recordAudit } from "@/lib/audit";

/** A list name from a form, checked against the four the CRM knows. */
function listFrom(value: unknown): ListKey {
  const name = String(value ?? "");
  if ((LISTS as readonly string[]).includes(name)) return name as ListKey;
  throw new Error(`Unknown list: ${name}`);
}

/** Name what is on screen, so it can be come back to in one click. */
export async function createSavedView(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const list = listFrom(formData.get("list"));
  const query = String(formData.get("query") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    await flash("said.viewNeedsName", "bad");
    revalidatePath(`/${list}`);
    return;
  }

  await saveView({
    userId: user.id,
    list,
    name,
    query,
    everyone: String(formData.get("everyone") ?? "") === "on",
  });

  await recordAudit({
    action: "view.create",
    entity: "savedView",
    detail: `${list}: ${name}`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.viewSaved");
  revalidatePath(`/${list}`);
}

/** Keep the changed filters against the view that is open. */
export async function updateSavedView(formData: FormData) {
  await requireUser(["ADMIN"]);
  const list = listFrom(formData.get("list"));
  const id = String(formData.get("id") ?? "");
  const query = String(formData.get("query") ?? "");

  await updateView(id, query);
  await flash("said.viewSaved");
  revalidatePath(`/${list}`);
}

export async function deleteSavedView(formData: FormData) {
  await requireUser(["ADMIN"]);
  const list = listFrom(formData.get("list"));

  await removeView(String(formData.get("id") ?? ""));
  await flash("said.viewGone");
  revalidatePath(`/${list}`);
  redirect(`/${list}?all=1`);
}

/** Which columns this person wants on this list. */
export async function saveListColumns(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const list = listFrom(formData.get("list"));
  const hidden = formData.getAll("hidden").map(String);
  await saveColumns(user.id, list, hidden);
  revalidatePath(`/${list}`);
}
