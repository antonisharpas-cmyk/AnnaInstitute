"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { startFresh, type FreshResult } from "@/lib/startFresh";

export type FreshState = { ok: true; result: FreshResult } | { ok: false; error: string; wrongWord?: boolean } | null;

/** Clear the sales records, once the admin has typed the word that says they mean it. */
export async function startFreshAction(_before: FreshState, formData: FormData): Promise<FreshState> {
  const user = await requireUser(["ADMIN"]);
  if (String(formData.get("confirm") ?? "").trim() !== "CLEAR") return { ok: false, error: "", wrongWord: true };
  try {
    const result = await startFresh({ id: user.id, email: user.email });
    revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
