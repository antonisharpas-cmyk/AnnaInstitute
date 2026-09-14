"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, units } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fromCents, toCents } from "@/lib/money";
import { readUploadFields, removeDocument, storeDocuments } from "@/lib/uploads";

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
  completionBy: z.string().optional(),
  status: z.enum(["PLANNING", "UNDER_CONSTRUCTION", "COMPLETED"]),
  description: z.string().optional(),
});

function readProject(formData: FormData) {
  return projectSchema.parse({
    name: formData.get("name"),
    location: formData.get("location") || undefined,
    completionBy: formData.get("completionBy") || undefined,
    status: formData.get("status") || "UNDER_CONSTRUCTION",
    description: formData.get("description") || undefined,
  });
}

/**
 * The company a development is built with.
 *
 * The form offers the companies already on record and a box for a new name, so
 * a partner can be added without leaving the page. A name that already exists is
 * reused rather than duplicated.
 */
async function companyFrom(formData: FormData): Promise<string | null> {
  const typed = String(formData.get("newCompany") ?? "").trim();
  if (typed) {
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.name, typed))
      .limit(1);
    if (existing[0]) return existing[0].id;

    const inserted = await db
      .insert(companies)
      .values({ name: typed })
      .returning({ id: companies.id });
    return inserted[0].id;
  }

  const chosen = String(formData.get("companyId") ?? "").trim();
  return chosen || null;
}

export async function createProject(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = readProject(formData);

  let slug = slugify(parsed.name);
  const clash = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
  if (clash.length > 0) slug = `${slug}_${Date.now().toString(36).slice(-4)}`;

  const companyId = await companyFrom(formData);

  const inserted = await db
    .insert(projects)
    .values({ ...parsed, slug, companyId })
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

  const companyId = await companyFrom(formData);

  await db
    .update(projects)
    .set({ ...parsed, companyId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

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
  status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "DELIVERED"]),
  notes: z.string().optional(),
});

function readUnit(formData: FormData) {
  const parsed = unitSchema.parse({
    code: formData.get("code"),
    floor: formData.get("floor") || undefined,
    bedrooms: formData.get("bedrooms") || undefined,
    coveredArea: formData.get("coveredArea") || undefined,
    verandaArea: formData.get("verandaArea") || undefined,
    roofGardenArea: formData.get("roofGardenArea") || undefined,
    parkingSpaces: formData.get("parkingSpaces") || 0,
    netPrice: String(formData.get("netPrice") ?? "0"),
    status: formData.get("status") || "AVAILABLE",
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
    status: parsed.status,
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
  const status = String(formData.get("status") ?? "AVAILABLE") as
    "AVAILABLE" | "RESERVED" | "SOLD" | "DELIVERED";

  const before = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  await db
    .update(units)
    .set({ netPrice, status, updatedAt: new Date() })
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

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}
