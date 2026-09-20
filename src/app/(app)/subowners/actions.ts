"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectPartners, subownerDirectors, subownerShares, subowners } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";

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

  /**
   * The shares have to leave room for us.
   *
   * One Eleven never has a line of its own, our share is whatever the partners
   * do not hold, so partners adding up to more than 100 would make our share a
   * negative number. The line being edited is left out of the sum, otherwise
   * changing 60 to 55 would count the 60 twice.
   */
  if (share) {
    const others = await db
      .select({ id: projectPartners.id, share: projectPartners.sharePercent })
      .from(projectPartners)
      .where(eq(projectPartners.projectId, projectId));

    const taken = others
      .filter((row) => row.id !== existing[0]?.id)
      .reduce((sum, row) => sum + (row.share ? Number(row.share) : 0), 0);

    if (taken + Number(share) > 100) {
      await flash("said.shareTooMuch", "bad");
      revalidatePath(`/projects/${projectId}`);
      return;
    }
  }

  if (existing[0]) {
    await db
      .update(projectPartners)
      .set({
        sharePercent: share ? Number(share).toFixed(3) : null,
        role: String(formData.get("role") ?? "").trim() || null,
        notes: String(formData.get("agreement") ?? "").trim() || null,
      })
      .where(eq(projectPartners.id, existing[0].id));
  } else {
    await db.insert(projectPartners).values({
      projectId,
      subownerId,
      sharePercent: share ? Number(share).toFixed(3) : null,
      role: String(formData.get("role") ?? "").trim() || null,
      notes: String(formData.get("agreement") ?? "").trim() || null,
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

  await flash("said.partnerAdded");
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

/*
 * The company behind the partner.
 *
 * A partner is a company, and two things about a company are not the same as
 * the company itself: the people who run it and the people who own it. Both
 * change without the company changing, so both are their own lines rather than
 * words in a notes field, and both are per company rather than per development,
 * since the share of a development is a separate agreement kept on the
 * development itself.
 */

/** Add a director, or whoever the office actually deals with. */
export async function addDirector(subownerId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.insert(subownerDirectors).values({
    subownerId,
    name,
    role: String(formData.get("role") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    emailAlternate: String(formData.get("emailAlternate") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  await recordAudit({
    action: "subowner.director.add",
    entity: "subowner",
    entityId: subownerId,
    detail: name,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/subowners/${subownerId}`);
}

export async function removeDirector(directorId: string, subownerId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.delete(subownerDirectors).where(eq(subownerDirectors.id, directorId));

  await recordAudit({
    action: "subowner.director.remove",
    entity: "subowner",
    entityId: subownerId,
    detail: directorId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/subowners/${subownerId}`);
}

/**
 * Add a shareholder of the partner company.
 *
 * The shares are not forced to add up to a hundred. Every company here was set
 * up with different investors and the office may know only the holders it deals
 * with, so the page says what is unaccounted for rather than refusing the line.
 */
export async function addShareholder(subownerId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const holder = String(formData.get("holder") ?? "").trim();
  if (!holder) return;

  const share = String(formData.get("sharePercent") ?? "").trim();

  await db.insert(subownerShares).values({
    subownerId,
    holder,
    sharePercent: share ? Number(share).toFixed(3) : null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  await recordAudit({
    action: "subowner.share.add",
    entity: "subowner",
    entityId: subownerId,
    detail: `${holder} at ${share || "no"} percent`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/subowners/${subownerId}`);
}

export async function removeShareholder(shareId: string, subownerId: string) {
  const user = await requireUser(["ADMIN"]);
  await db.delete(subownerShares).where(eq(subownerShares.id, shareId));

  await recordAudit({
    action: "subowner.share.remove",
    entity: "subowner",
    entityId: subownerId,
    detail: shareId,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/subowners/${subownerId}`);
}

/**
 * Getting rid of a partner company.
 *
 * A partner can always go: what they hold of a development is an agreement
 * between us and them, so it goes with them and the development reads as ours
 * outright afterwards. Nothing else is attached to them, which is why this
 * needs no refusal, only the page saying plainly what changes.
 */
export async function deleteSubowner(subownerId: string) {
  const user = await requireUser(["ADMIN"]);

  const [partner] = await db.select().from(subowners).where(eq(subowners.id, subownerId)).limit(1);
  if (!partner) return;

  const held = await db
    .select({ projectId: projectPartners.projectId })
    .from(projectPartners)
    .where(eq(projectPartners.subownerId, subownerId));

  await db.delete(subowners).where(eq(subowners.id, subownerId));

  await recordAudit({
    action: "subowner.delete",
    entity: "subowner",
    entityId: subownerId,
    detail: `${partner.name}, taken off ${held.length} developments`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.deleted");
  for (const row of held) revalidatePath(`/projects/${row.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/subowners");
  redirect("/subowners");
}
