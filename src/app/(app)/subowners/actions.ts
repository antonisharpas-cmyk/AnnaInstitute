"use server";

import { cleanBirthDate } from "@/lib/buyers";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectPartners, subownerDirectors, subownerShares, subowners } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { ensureOneEleven } from "@/lib/subowners";
import { validColor } from "@/lib/issuer";
import { saveCompanyLogo } from "@/lib/companyLogo";

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
    /* What its own invoices, receipts and credit notes print. */
    tic: text(formData, "tic"),
    mobile: text(formData, "mobile"),
    fax: text(formData, "fax"),
    website: text(formData, "website"),
    bankName: text(formData, "bankName"),
    bankBeneficiary: text(formData, "bankBeneficiary"),
    bankAccount: text(formData, "bankAccount"),
    iban: text(formData, "iban")?.replace(/\s+/g, "").toUpperCase() ?? null,
    bic: text(formData, "bic")?.toUpperCase() ?? null,
    brandColor: validColor(text(formData, "brandColor")),
    nextInvoice: whole(formData, "nextInvoice"),
    nextReceipt: whole(formData, "nextReceipt"),
    nextCreditNote: whole(formData, "nextCreditNote"),
    notes: String(formData.get("notes") ?? "").trim() || null,
    isActive: String(formData.get("isActive") ?? "") === "on",
  };
}

function text(formData: FormData, name: string): string | null {
  return String(formData.get(name) ?? "").trim() || null;
}

/** A number a series carries on from: a whole number above nought, or nothing. */
function whole(formData: FormData, name: string): number | null {
  const n = Math.trunc(Number(String(formData.get(name) ?? "").replace(/\D/g, "")));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A logo chosen with a new company, made into a PNG for its papers. */
async function savedLogo(formData: FormData): Promise<string | null> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return null;
  return saveCompanyLogo(file);
}

export async function createSubowner(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const parsed = read(formData);
  if (!parsed.name) throw new Error("A company needs a name.");
  const logoPath = await savedLogo(formData);

  const inserted = await db
    .insert(subowners)
    .values({ ...parsed, logoPath })
    .returning({ id: subowners.id });
  /* One Eleven is a shareholder of every company from the start; the office adds the rest. */
  await ensureOneEleven(inserted[0].id);

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
  if (!parsed.name) return { error: "A company needs a name." };

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

/**
 * Put a company on a development.
 *
 * A company holds the whole of the development it is on; there is no share of
 * the development to type. The split is between the company's shareholders,
 * One Eleven always among them, and that is set on the company's own page.
 */
export async function addPartner(projectId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const subownerId = String(formData.get("subownerId") ?? "").trim();
  if (!subownerId) return;

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
        sharePercent: null,
        role: String(formData.get("role") ?? "").trim() || null,
        notes: String(formData.get("agreement") ?? "").trim() || null,
      })
      .where(eq(projectPartners.id, existing[0].id));
  } else {
    await db.insert(projectPartners).values({
      projectId,
      subownerId,
      sharePercent: null,
      role: String(formData.get("role") ?? "").trim() || null,
      notes: String(formData.get("agreement") ?? "").trim() || null,
    });
  }

  await recordAudit({
    action: "project.partner.add",
    entity: "project",
    entityId: projectId,
    detail: subownerId,
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
    birthDate: cleanBirthDate(String(formData.get("birthDate") ?? "")),
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

/** Change a director's details. */
export async function updateDirector(directorId: string, subownerId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await db
    .update(subownerDirectors)
    .set({
      name,
      role: String(formData.get("role") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      emailAlternate: String(formData.get("emailAlternate") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      birthDate: cleanBirthDate(String(formData.get("birthDate") ?? "")),
      updatedAt: new Date(),
    })
    .where(eq(subownerDirectors.id, directorId));
  await recordAudit({
    action: "subowner.director.update",
    entity: "subowner",
    entityId: subownerId,
    detail: name,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
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

/** The boxes of a shareholder, as the form sends them. */
function holderFrom(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? "").trim() || null;
  const share = String(formData.get("sharePercent") ?? "").trim().replace(",", ".");
  const kind = String(formData.get("holderKind") ?? "");
  return {
    sharePercent: share && Number.isFinite(Number(share)) ? Number(share).toFixed(3) : null,
    holderKind: kind === "PERSON" || kind === "COMPANY" ? kind : null,
    idNumber: text("idNumber"),
    email: text("email"),
    phone: text("phone"),
    birthDate: cleanBirthDate(text("birthDate")),
    address: text("address"),
    notes: text("notes"),
  };
}

/** The shareholders' percentages, without one of them, so a change can be checked against 100. */
async function othersHold(subownerId: string, leaveOut: string | null): Promise<number> {
  const rows = await db.select().from(subownerShares).where(eq(subownerShares.subownerId, subownerId));
  return rows.filter((row) => row.id !== leaveOut).reduce((sum, row) => sum + Number(row.sharePercent ?? 0), 0);
}

/**
 * Add a shareholder of the company.
 *
 * The shares are not forced to add up to a hundred. Every company here was set
 * up with different investors and the office may know only the holders it deals
 * with, so the page says what is unaccounted for rather than refusing the line.
 */
export async function addShareholder(subownerId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const holder = String(formData.get("holder") ?? "").trim();
  if (!holder) return;
  const details = holderFrom(formData);
  if ((await othersHold(subownerId, null)) + Number(details.sharePercent ?? 0) > 100.0001) {
    await flash("said.shareTooMuch", "bad");
    revalidatePath(`/subowners/${subownerId}`);
    return;
  }

  await db.insert(subownerShares).values({ subownerId, holder, ...details });

  await recordAudit({
    action: "subowner.share.add",
    entity: "subowner",
    entityId: subownerId,
    detail: `${holder} at ${details.sharePercent ?? "no"} percent`,
    userId: user.id,
    userEmail: user.email,
  });

  revalidatePath(`/subowners/${subownerId}`);
}

/** Change a shareholder's share or details. One Eleven's line keeps its name. */
export async function updateShareholder(shareId: string, subownerId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [row] = await db.select().from(subownerShares).where(eq(subownerShares.id, shareId)).limit(1);
  if (!row) return;
  const holder = row.isOneEleven ? row.holder : String(formData.get("holder") ?? "").trim() || row.holder;
  const details = holderFrom(formData);
  if ((await othersHold(subownerId, shareId)) + Number(details.sharePercent ?? 0) > 100.0001) {
    await flash("said.shareTooMuch", "bad");
    revalidatePath(`/subowners/${subownerId}`);
    return;
  }

  await db
    .update(subownerShares)
    .set({ holder, ...details, updatedAt: new Date() })
    .where(eq(subownerShares.id, shareId));

  await recordAudit({
    action: "subowner.share.update",
    entity: "subowner",
    entityId: subownerId,
    detail: `${holder} at ${details.sharePercent ?? "no"} percent`,
    userId: user.id,
    userEmail: user.email,
  });

  await flash("said.saved");
  revalidatePath(`/subowners/${subownerId}`);
}

export async function removeShareholder(shareId: string, subownerId: string) {
  const user = await requireUser(["ADMIN"]);
  const [row] = await db.select().from(subownerShares).where(eq(subownerShares.id, shareId)).limit(1);
  /* One Eleven is always a shareholder; its line can be changed but not taken off. */
  if (!row || row.isOneEleven) return;
  await db.delete(subownerShares).where(eq(subownerShares.id, shareId));

  await recordAudit({
    action: "subowner.share.remove",
    entity: "subowner",
    entityId: subownerId,
    detail: row.holder,
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

