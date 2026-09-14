"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectPartners, subowners } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export type SubownerState = { ok: true } | { error: string } | null;

function read(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    company: String(formData.get("company") ?? "").trim() || null,
    contactName: String(formData.get("contactName") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    country: String(formData.get("country") ?? "").trim() || null,
    vatNumber: String(formData.get("vatNumber") ?? "").trim() || null,
    registryNumber: String(formData.get("registryNumber") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    isActive: String(formData.get("isActive") ?? "") === "on",
  };
}

export async function createSubowner(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = read(formData);
  if (!parsed.name) throw new Error("A partner needs a name.");

  const inserted = await db.insert(subowners).values(parsed).returning({ id: subowners.id });

  await recordAudit({
    action: "subowner.create",
    entity: "subowner",
    entityId: inserted[0].id,
    detail: parsed.name,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/subowners");
  redirect(`/subowners/${inserted[0].id}`);
}

/**
 * The profile card saves in place, so the action answers rather than redirects.
 */
export async function updateSubowner(
  subownerId: string,
  _prev: SubownerState,
  formData: FormData,
): Promise<SubownerState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = read(formData);
  if (!parsed.name) return { error: "A partner needs a name." };

  await db
    .update(subowners)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(subowners.id, subownerId));

  await recordAudit({
    action: "subowner.update",
    entity: "subowner",
    entityId: subownerId,
    detail: parsed.name,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/subowners/${subownerId}`);
  revalidatePath("/subowners");
  return { ok: true };
}

/** Add a partner to a development, with the share they hold of it. */
export async function addPartner(projectId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const subownerId = String(formData.get("subownerId") ?? "").trim();
  if (!subownerId) return;

  const share = String(formData.get("sharePercent") ?? "").trim();

  const existing = await db
    .select({ id: projectPartners.id })
    .from(projectPartners)
    .where(
      and(eq(projectPartners.projectId, projectId), eq(projectPartners.subownerId, subownerId)),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(projectPartners)
      .set({
        sharePercent: share ? Number(share).toFixed(3) : null,
        role: String(formData.get("role") ?? "").trim() || null,
      })
      .where(eq(projectPartners.id, existing[0].id));
  } else {
    await db.insert(projectPartners).values({
      projectId,
      subownerId,
      sharePercent: share ? Number(share).toFixed(3) : null,
      role: String(formData.get("role") ?? "").trim() || null,
    });
  }

  await recordAudit({
    action: "project.partner.add",
    entity: "project",
    entityId: projectId,
    detail: `${subownerId} at ${share || "no"} percent`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/subowners/${subownerId}`);
}

export async function removePartner(partnerId: string, projectId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.delete(projectPartners).where(eq(projectPartners.id, partnerId));

  await recordAudit({
    action: "project.partner.remove",
    entity: "project",
    entityId: projectId,
    detail: partnerId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/subowners");
}
