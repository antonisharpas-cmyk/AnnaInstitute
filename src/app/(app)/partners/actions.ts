"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, partnerOffers, partners } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { isAllowed } from "@/lib/choices";
import { fromCents, parseAmount } from "@/lib/money";
import { removeDocument, storeDocument } from "@/lib/uploads";

const typed = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

/** A link as typed, with https:// in front when it was left off. */
const link = (value: string | null) => (value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null);

/** What the form says, or the reason it cannot be saved. */
async function read(formData: FormData) {
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    company: typed(formData, "company"),
    category: String(formData.get("category") ?? "").trim(),
    /* The kind typed under Others, kept only while Others is the category. */
    categoryOther: String(formData.get("category") ?? "").trim() === "OTHER" ? typed(formData, "categoryOther")?.slice(0, 80) ?? null : null,
    email: typed(formData, "email")?.toLowerCase() ?? null,
    mobile: typed(formData, "mobile"),
    locationUrl: link(typed(formData, "locationUrl")),
    notes: typed(formData, "notes"),
  };
  if (!values.name) return { error: "partners.needName" as const, values };
  if (!values.category || !(await isAllowed("partnerCategory", values.category))) return { error: "partners.needCategory" as const, values };
  if (values.category === "OTHER" && !values.categoryOther) return { error: "partners.needOtherKind" as const, values };
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
  await recordAudit({ action: "partner.create", entity: "partner", entityId: row.id, detail: `${values.name}, ${values.category}${values.categoryOther ? ` (${values.categoryOther})` : ""}`, userId: user.id, userEmail: user.email });
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
  await recordAudit({ action: "partner.update", entity: "partner", entityId: id, detail: `${values.name}, ${values.category}${values.categoryOther ? ` (${values.categoryOther})` : ""}`, userId: user.id, userEmail: user.email });
  await flash("said.saved");
  revalidatePath("/partners");
  redirect("/partners");
}

export async function deletePartner(id: string) {
  const user = await requireUser(["ADMIN"]);
  /* The pictures and PDFs of their offers go too, files and all. */
  const files = await db
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(partnerOffers, eq(partnerOffers.id, documents.partnerOfferId))
    .where(eq(partnerOffers.partnerId, id));
  for (const file of files) await removeDocument(file.id, user);
  const [row] = await db.delete(partners).where(eq(partners.id, id)).returning({ name: partners.name });
  if (row) await recordAudit({ action: "partner.delete", entity: "partner", entityId: id, detail: row.name, userId: user.id, userEmail: user.email });
  await flash("said.deleted");
  revalidatePath("/partners");
  redirect("/partners");
}

/* ---------------------------------------------------------------------------
   A partner's offers: an item, its price, and its pictures or PDFs
   --------------------------------------------------------------------------- */

const offerPage = (partnerId: string) => `/partners/${partnerId}`;

/** The item and its price from the form. The price may be left empty. */
function readOffer(formData: FormData) {
  const name = String(formData.get("offerName") ?? "").trim().slice(0, 200);
  const typedPrice = String(formData.get("price") ?? "").trim();
  const price = typedPrice ? fromCents(parseAmount(typedPrice)) : null;
  const notes = typed(formData, "offerNotes");
  return { name, price, notes };
}

/** The files chosen on the form, filed on the offer under its name. */
async function fileOnOffer(offerId: string, name: string, formData: FormData, user: Awaited<ReturnType<typeof requireUser>>) {
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  for (const [index, file] of files.entries()) {
    await storeDocument({
      file,
      title: files.length === 1 ? name : `${name} ${index + 1}`,
      category: "OTHER",
      attachTo: { partnerOfferId: offerId },
      user,
    });
  }
  return files.length;
}

export async function addPartnerOffer(partnerId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [partner] = await db.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.id, partnerId)).limit(1);
  if (!partner) return;
  const values = readOffer(formData);
  if (!values.name) {
    await flash("said.offerNeedsName", "bad");
    revalidatePath(offerPage(partnerId));
    return;
  }
  const [made] = await db
    .insert(partnerOffers)
    .values({ partnerId, ...values, createdById: user.id })
    .returning({ id: partnerOffers.id });
  const files = await fileOnOffer(made.id, values.name, formData, user);
  await recordAudit({
    action: "partner.offer.add",
    entity: "partner",
    entityId: partnerId,
    detail: `${values.name}${values.price ? `, ${values.price}` : ""}, ${files} file(s)`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.offerAdded");
  revalidatePath(offerPage(partnerId));
}

export async function updatePartnerOffer(offerId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const [offer] = await db.select().from(partnerOffers).where(eq(partnerOffers.id, offerId)).limit(1);
  if (!offer) return;
  const values = readOffer(formData);
  if (!values.name) {
    await flash("said.offerNeedsName", "bad");
    revalidatePath(offerPage(offer.partnerId));
    return;
  }
  await db.update(partnerOffers).set({ ...values, updatedAt: new Date() }).where(eq(partnerOffers.id, offerId));
  const files = await fileOnOffer(offerId, values.name, formData, user);
  await recordAudit({
    action: "partner.offer.edit",
    entity: "partner",
    entityId: offer.partnerId,
    detail: `${offer.name}${offer.price ? ` ${offer.price}` : ""} is now ${values.name}${values.price ? ` ${values.price}` : ""}${files ? `, ${files} file(s) added` : ""}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  revalidatePath(offerPage(offer.partnerId));
}

export async function deletePartnerOffer(offerId: string) {
  const user = await requireUser(["ADMIN"]);
  const [offer] = await db.select().from(partnerOffers).where(eq(partnerOffers.id, offerId)).limit(1);
  if (!offer) return;
  const files = await db.select({ id: documents.id }).from(documents).where(eq(documents.partnerOfferId, offerId));
  for (const file of files) await removeDocument(file.id, user);
  await db.delete(partnerOffers).where(eq(partnerOffers.id, offerId));
  await recordAudit({
    action: "partner.offer.delete",
    entity: "partner",
    entityId: offer.partnerId,
    detail: `${offer.name}${offer.price ? `, ${offer.price}` : ""}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.deleted");
  revalidatePath(offerPage(offer.partnerId));
  redirect(offerPage(offer.partnerId));
}

/** One picture or PDF taken off an offer, the file with it. */
export async function deletePartnerOfferFile(documentId: string, offerId: string) {
  const user = await requireUser(["ADMIN"]);
  const [offer] = await db.select({ partnerId: partnerOffers.partnerId }).from(partnerOffers).where(eq(partnerOffers.id, offerId)).limit(1);
  if (!offer) return;
  const [file] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.partnerOfferId, offerId)))
    .limit(1);
  if (file) await removeDocument(file.id, user);
  await flash("said.deleted");
  revalidatePath(offerPage(offer.partnerId));
  redirect(offerPage(offer.partnerId));
}
