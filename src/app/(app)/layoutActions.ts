"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { flash } from "@/lib/flash";
import {
  forgetLayout,
  layoutFromForm,
  readLayout,
  writeLayout,
  type PanelWidth,
} from "@/lib/dashboard";

/**
 * Trying to save, and saying so plainly when it cannot be done.
 *
 * The only real reason a save fails is a database that has not had the
 * migration run on it yet, and that must not throw the person out of the CRM
 * with a server error page: they get a line at the bottom of the screen, and
 * the detail goes to the log where a developer will look for it.
 */
async function attempt(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error("The dashboard arrangement could not be saved.", error);
    await flash("said.notSaved", "bad");
  }
}

/**
 * Saving a dashboard.
 *
 * The arrange panel sends the whole list back as one field, which is read
 * defensively on the way in: an unknown panel, a width nobody offers or a
 * repeated line is dropped rather than stored.
 */
export async function saveDashboard(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const panels = layoutFromForm(String(formData.get("panels") ?? ""));

  await attempt(async () => {
    await writeLayout(user.id, panels);
    await flash("panel.saved");
  });
  revalidatePath("/");
}

/** Back to the screen everybody starts with. */
export async function resetDashboard() {
  const user = await requireUser(["ADMIN"]);
  await attempt(async () => {
    await forgetLayout(user.id);
    await flash("panel.wasReset");
  });
  revalidatePath("/");
}

/** Bring one panel back, from the chips at the foot of the dashboard. */
export async function showPanel(key: string) {
  const user = await requireUser(["ADMIN"]);
  const panels = await readLayout(user.id);

  await attempt(() =>
    writeLayout(
      user.id,
      panels.map((panel) => (panel.key === key ? { ...panel, shown: true } : panel)),
    ),
  );
  revalidatePath("/");
}

/**
 * The same three moves, made from the panel itself.
 *
 * Somebody who wants one box higher up should not have to open a dialog to do
 * it, so every panel carries its own little menu and these are what it calls.
 */
export async function movePanel(key: string, direction: "up" | "down") {
  const user = await requireUser(["ADMIN"]);
  const panels = await readLayout(user.id);

  const from = panels.findIndex((panel) => panel.key === key);
  if (from < 0) return;

  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= panels.length) return;

  const next = [...panels];
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken);

  await attempt(() => writeLayout(user.id, next));
  revalidatePath("/");
}

export async function hidePanel(key: string) {
  const user = await requireUser(["ADMIN"]);
  const panels = await readLayout(user.id);

  await attempt(() =>
    writeLayout(
      user.id,
      panels.map((panel) => (panel.key === key ? { ...panel, shown: false } : panel)),
    ),
  );
  revalidatePath("/");
}

export async function setPanelWidth(key: string, width: number) {
  const user = await requireUser(["ADMIN"]);
  const panels = await readLayout(user.id);

  await writeLayout(
    user.id,
    panels.map((panel) => (panel.key === key ? { ...panel, width: width as PanelWidth } : panel)),
  );
  revalidatePath("/");
}
