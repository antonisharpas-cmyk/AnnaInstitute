"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, units, unitStatusEnum } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  followTheApartments,
  handProjectBackToApartments,
  handUnitBackToMoney,
  markProjectByHand,
  markUnitByHand,
} from "@/lib/statuses";
import { shownCode, splitChoice } from "@/lib/choices/lists";
import { flash } from "@/lib/flash";
import { fromCents, toCents } from "@/lib/money";
import { readUploadFields, removeDocument, storeDocuments } from "@/lib/uploads";
import { contractsOnUnits } from "@/lib/deletes";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "project";

const projectSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  mapsUrl: z.string().url().optional(),
  completionBy: z.string().optional(),
  status: z.enum(["PLANNING", "UNDER_CONSTRUCTION", "COMPLETED", "DELIVERED"]),
  description: z.string().optional(),
});

/**
 * The Google Maps link as pasted.
 *
 * Maps hands out several shapes of link and all of them are fine. Only a line
 * that is plainly not a link is refused, and it is said in words rather than
 * with a form that will not submit.
 */
function mapsLink(raw: FormDataEntryValue | null): string | undefined {
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    new URL(withScheme);
  } catch {
    throw new Error("The Google Maps link does not look like a link. Copy it from Maps with Share, then Copy link.");
  }
  return withScheme;
}

/* A status may be the office's own from the Builder: the built in one it counts
   as goes in the status column, the office's own beside it. */
function readProject(formData: FormData) {
  const status = splitChoice(String(formData.get("status") || "UNDER_CONSTRUCTION"));
  const parsed = projectSchema.parse({
    name: formData.get("name"),
    location: formData.get("location") || undefined,
    mapsUrl: mapsLink(formData.get("mapsUrl")),
    completionBy: formData.get("completionBy") || undefined,
    status: status.base,
    description: formData.get("description") || undefined,
  });
  return { ...parsed, statusChoice: status.choice };
}

export async function createProject(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = readProject(formData);

  let slug = slugify(parsed.name);
  const clash = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
  if (clash.length > 0) slug = `${slug}_${Date.now().toString(36).slice(-4)}`;


  const inserted = await db
    .insert(projects)
    .values({ ...parsed, slug })
    .returning({ id: projects.id });

  await recordAudit({
    action: "project.create",
    entity: "project",
    entityId: inserted[0].id,
    detail: parsed.name,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/projects");
  redirect(`/projects/${inserted[0].id}`);
}

export async function updateProject(projectId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = readProject(formData);

  const before = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!before[0]) throw new Error("Project not found");


  await db
    .update(projects)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  /**
   * A status chosen here is a person's decision, so it is marked as such and
   * the apartments stop deciding it. Everything else on the form leaves that
   * alone: editing a location should not freeze a status.
   */
  if (shownCode(parsed.status, parsed.statusChoice) !== shownCode(before[0].status, before[0].statusChoice)) {
    await markProjectByHand(projectId, user);
  }

  await recordAudit({
    action: "project.update",
    entity: "project",
    entityId: projectId,
    detail: `${before[0].name} to ${parsed.name}, status ${before[0].status} to ${parsed.status}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

const unitSchema = z.object({
  code: z.string().min(1),
  floor: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  coveredArea: z.string().optional(),
  verandaArea: z.string().optional(),
  roofGardenArea: z.string().optional(),
  parkingSpaces: z.coerce.number().int().min(0).max(10).default(0),
  netPrice: z.string(),
  vatRate: z.string().optional(),
  status: z.enum(unitStatusEnum.enumValues),
  notes: z.string().optional(),
});

function readUnit(formData: FormData) {
  const status = splitChoice(String(formData.get("status") || "AVAILABLE"));
  const parsed = unitSchema.parse({
    code: formData.get("code"),
    floor: formData.get("floor") || undefined,
    bedrooms: formData.get("bedrooms") || undefined,
    coveredArea: formData.get("coveredArea") || undefined,
    verandaArea: formData.get("verandaArea") || undefined,
    roofGardenArea: formData.get("roofGardenArea") || undefined,
    parkingSpaces: formData.get("parkingSpaces") || 0,
    netPrice: String(formData.get("netPrice") ?? "0"),
    vatRate: formData.get("vatRate") || undefined,
    status: status.base,
    notes: formData.get("notes") || undefined,
  });

  return {
    code: parsed.code.trim(),
    floor: parsed.floor?.trim() || null,
    bedrooms: parsed.bedrooms ?? null,
    coveredArea: parsed.coveredArea ? String(Number(parsed.coveredArea)) : null,
    verandaArea: parsed.verandaArea ? String(Number(parsed.verandaArea)) : null,
    roofGardenArea: parsed.roofGardenArea ? String(Number(parsed.roofGardenArea)) : null,
    parkingSpaces: parsed.parkingSpaces,
    netPrice: fromCents(toCents(parsed.netPrice)),
    /**
     * Nineteen unless somebody says otherwise. The reduced rate is the buyer's
     * entitlement rather than the apartment's, so an apartment nobody has
     * bought yet is priced at the ordinary rate.
     */
    vatRate: Number(parsed.vatRate ?? 19).toFixed(3),
    status: parsed.status,
    statusChoice: status.choice,
    notes: parsed.notes?.trim() || null,
  };
}

export async function createUnit(projectId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const values = readUnit(formData);

  const inserted = await db
    .insert(units)
    .values({ projectId, ...values })
    .returning({ id: units.id });

  // An apartment entered as anything other than available was put there by a
  // person, so the money leaves it alone until somebody hands it back.
  if (values.status !== "AVAILABLE") {
    await markUnitByHand(inserted[0].id, user);
  }
  await followTheApartments(projectId, user);

  await recordAudit({
    action: "unit.create",
    entity: "unit",
    entityId: inserted[0].id,
    detail: `${values.code} at ${values.netPrice}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function updateUnit(unitId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const before = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  const unit = before[0];
  if (!unit) throw new Error("Unit not found");

  const values = readUnit(formData);
  await db
    .update(units)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(units.id, unitId));

  if (shownCode(values.status, values.statusChoice) !== shownCode(unit.status, unit.statusChoice)) {
    await markUnitByHand(unitId, user);
    await followTheApartments(unit.projectId, user);
  }

  await recordAudit({
    action: "unit.update",
    entity: "unit",
    entityId: unitId,
    detail: `price ${unit.netPrice} to ${values.netPrice}, status ${unit.status} to ${values.status}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/projects/${unit.projectId}`);
  redirect(`/projects/${unit.projectId}`);
}

/** Quick inline change from the units table, without opening the edit page. */
export async function updateUnitPrice(unitId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const netPrice = fromCents(toCents(String(formData.get("netPrice") ?? "0")));
  const picked = splitChoice(String(formData.get("status") ?? "AVAILABLE"));
  const status = unitStatusEnum.enumValues.find((one) => one === picked.base);
  if (!status) return;

  const before = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  await db
    .update(units)
    .set({ netPrice, status, statusChoice: picked.choice, updatedAt: new Date() })
    .where(eq(units.id, unitId));

  await recordAudit({
    action: "unit.update",
    entity: "unit",
    entityId: unitId,
    detail: `price ${before[0]?.netPrice} to ${netPrice}, status ${before[0]?.status} to ${status}`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/projects/${before[0]?.projectId ?? ""}`);
}

export async function uploadProjectDocuments(projectId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const { files, title, category } = readUploadFields(formData);
  await storeDocuments({
    files,
    title,
    category,
    attachTo: { projectId },
    user,
  });
  revalidatePath(`/projects/${projectId}`);
}

/** Files and photographs kept against one apartment. Several at a time is fine. */
export async function uploadUnitFiles(unitId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const { files, title, category } = readUploadFields(formData);

  const rows = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  const unit = rows[0];
  if (!unit) throw new Error("Unit not found");

  await storeDocuments({
    files,
    title,
    category,
    attachTo: { unitId, projectId: unit.projectId },
    user,
  });

  revalidatePath(`/projects/${unit.projectId}/units/${unitId}`);
  revalidatePath(`/projects/${unit.projectId}`);
}

export async function deleteUnitDocument(documentId: string, unitId: string, projectId: string) {
  const user = await requireUser(["ADMIN"]);
  await removeDocument(documentId, user);
  revalidatePath(`/projects/${projectId}/units/${unitId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectDocument(documentId: string, projectId: string) {
  const user = await requireUser(["ADMIN"]);
  await removeDocument(documentId, user);
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Somebody has gone over the record and confirmed it is still right.
 *
 * The date is what makes the checklist meaningful: a development whose record
 * nobody has looked at since the foundations were poured is worth knowing about.
 */
export async function markProjectChecked(projectId: string) {
  const user = await requireUser(["ADMIN"]);

  await db
    .update(projects)
    .set({ recordCheckedAt: new Date(), recordCheckedBy: user.email, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await recordAudit({
    action: "project.record.checked",
    entity: "project",
    entityId: projectId,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.checked");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

/**
 * Hand an apartment's status back to the money.
 *
 * The office sets a status by hand when it knows something the schedule does
 * not, and that choice then stands for good. This is the way back: the mark
 * comes off and the rule works the status out again from what has been paid, so
 * nobody has to remember which apartments were once overridden.
 */
export async function letTheMoneyDecide(unitId: string, projectId: string) {
  const user = await requireUser(["ADMIN"]);
  await handUnitBackToMoney(unitId, user);

  await recordAudit({
    action: "unit.status.released",
    entity: "unit",
    entityId: unitId,
    detail: "the status follows the payments again",
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.statusFollowsMoney");
  revalidatePath(`/projects/${projectId}/units/${unitId}`);
  revalidatePath(`/projects/${projectId}`);
}

/** The same for a development, whose status follows its apartments. */
export async function letTheApartmentsDecide(projectId: string) {
  const user = await requireUser(["ADMIN"]);
  await handProjectBackToApartments(projectId, user);

  await recordAudit({
    action: "project.status.released",
    entity: "project",
    entityId: projectId,
    detail: "the status follows the apartments again",
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.statusFollowsApartments");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

/* ---------------------------------------------------------------------------
   Getting rid of a record

   A development and an apartment can both be deleted outright, which a client
   and a lead cannot: those go to the recycle bin, because a person who
   telephoned once may telephone again. A building that was entered twice, or an
   apartment that turned out not to exist, is simply a mistake and should leave
   no trace.

   Neither will go while a contract is attached. That is not caution for its own
   sake: a contract carries a buyer, a schedule and receipted payments, and
   letting an apartment take all of that with it quietly is how a CRM loses
   money it has already banked. The refusal says which contract is in the way.
   --------------------------------------------------------------------------- */

export async function deleteProject(projectId: string) {
  const user = await requireUser(["ADMIN"]);

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return;

  const rows = await db.select({ id: units.id }).from(units).where(eq(units.projectId, projectId));

  /* Refused, not thrown. The record page says what is in the way before the
     button is shown, but the same delete now sits in a row of the list, where
     a thrown error would put a server error page in front of the office
     instead of a sentence telling them what to do first. */
  const inTheWay = await contractsOnUnits(rows.map((row) => row.id));
  if (inTheWay.length > 0) {
    await flash("said.contractsInTheWay", "bad");
    revalidatePath("/projects");
    return;
  }

  await db.delete(projects).where(eq(projects.id, projectId));

  await recordAudit({
    action: "project.delete",
    entity: "project",
    entityId: projectId,
    detail: `${project.name}, ${rows.length} apartments`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.deleted");
  revalidatePath("/projects");
  redirect("/projects");
}

export async function deleteUnit(unitId: string, projectId: string) {
  const user = await requireUser(["ADMIN"]);

  const [unit] = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  if (!unit) return;

  const inTheWay = await contractsOnUnits([unitId]);
  if (inTheWay.length > 0) {
    await flash("said.contractOnApartment", "bad");
    revalidatePath(`/projects/${projectId}`);
    return;
  }

  await db.delete(units).where(eq(units.id, unitId));
  await followTheApartments(projectId, user);

  await recordAudit({
    action: "unit.delete",
    entity: "unit",
    entityId: unitId,
    detail: unit.code,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.deleted");
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
