"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession } from "@/lib/auth";
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
