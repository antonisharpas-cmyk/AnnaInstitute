"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { partners } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { isAllowed } from "@/lib/choices";

const typed = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

/** A link as typed, with https:// in front when it was left off. */
const link = (value: string | null) => (value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null);

/** What the form says, or the reason it cannot be saved. */
async function read(formData: FormData) {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    email: typed(formData, "email")?.toLowerCase() ?? null,
    mobile: typed(formData, "mobile"),
    locationUrl: link(typed(formData, "locationUrl")),
    notes: typed(formData, "notes"),
  };
  if (!values.name) return { error: "partners.needName" as const, values };
  if (!values.category || !(await isAllowed("partnerCategory", values.category))) return { error: "partners.needCategory" as const, values };
  return { error: null, values };
}

export async function createPartner(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const { error, values } = await read(formData);
  if (error) {
    await flash(error, "bad");
    redirect("/partners/new");
  }
  const [row] = await db.insert(partners).values(values).returning({ id: partners.id });
  await recordAudit({ action: "partner.create", entity: "partner", entityId: row.id, detail: `${values.name}, ${values.category}`, userId: user.id, userEmail: user.email });
  await flash("said.saved");
  revalidatePath("/partners");
  redirect("/partners");
}

export async function updatePartner(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const { error, values } = await read(formData);
  if (error) {
    await flash(error, "bad");
    revalidatePath(`/partners/${id}`);
    return;
  }
  await db.update(partners).set({ ...values, updatedAt: new Date() }).where(eq(partners.id, id));
  await recordAudit({ action: "partner.update", entity: "partner", entityId: id, detail: `${values.name}, ${values.category}`, userId: user.id, userEmail: user.email });
  await flash("said.saved");
  revalidatePath("/partners");
  redirect("/partners");
}

export async function deletePartner(id: string) {
  const user = await requireUser(["ADMIN"]);
  const [row] = await db.delete(partners).where(eq(partners.id, id)).returning({ name: partners.name });
  if (row) await recordAudit({ action: "partner.delete", entity: "partner", entityId: id, detail: row.name, userId: user.id, userEmail: user.email });
  await flash("said.deleted");
  revalidatePath("/partners");
  redirect("/partners");
}
