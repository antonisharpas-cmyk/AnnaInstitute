"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { constructorPayments, constructorProjects, constructors, documents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { fromCents, parseAmount } from "@/lib/money";
import { paymentOf, jobOf, CONSTRUCTOR_STATUSES, type ConstructorStatus } from "@/lib/constructors";
import { removeDocument, storeDocuments } from "@/lib/uploads";

const typed = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

function read(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    company: typed(formData, "company"),
    contactName: typed(formData, "contactName"),
    email: typed(formData, "email"),
    phone: typed(formData, "phone"),
    address: typed(formData, "address"),
    vatNumber: typed(formData, "vatNumber"),
    registryNumber: typed(formData, "registryNumber"),
    notes: typed(formData, "notes"),
    isActive: String(formData.get("isActive") ?? "") === "on",
  };
}

const back = (id: string) => {
  revalidatePath(`/constructors/${id}`);
  revalidatePath("/constructors");
};

export async function createConstructor(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const values = read(formData);
  if (!values.name) throw new Error("A constructor needs a name.");
  const [row] = await db.insert(constructors).values(values).returning({ id: constructors.id });
  await recordAudit({ action: "constructor.create", entity: "constructor", entityId: row.id, detail: values.name, userId: user.id, userEmail: user.email });
  revalidatePath("/constructors");
  redirect(`/constructors/${row.id}`);
}

export async function updateConstructor(id: string, _previous: { ok: true } | { error: string } | null, formData: FormData): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser(["ADMIN"]);
  const values = read(formData);
  if (!values.name) return { error: "A constructor needs a name." };
  await db.update(constructors).set({ ...values, updatedAt: new Date() }).where(eq(constructors.id, id));
  await recordAudit({ action: "constructor.update", entity: "constructor", entityId: id, detail: values.name, userId: user.id, userEmail: user.email });
  back(id);
  return { ok: true };
}

/** A development this constructor builds, and the amount agreed for it. */
export async function addConstructorProject(constructorId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const projectId = typed(formData, "projectId");
  const amount = parseAmount(String(formData.get("agreedAmount") ?? "0"));
  if (!projectId) return;
  try {
    await db.insert(constructorProjects).values({ constructorId, projectId, agreedAmount: fromCents(amount), notes: typed(formData, "notes") });
  } catch {
    await flash("said.constructorTaken", "bad");
    back(constructorId);
    return;
  }
  await recordAudit({ action: "constructor.project", entity: "constructor", entityId: constructorId, detail: `${projectId}, ${fromCents(amount)}`, userId: user.id, userEmail: user.email });
  await flash("said.saved");
  back(constructorId);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateConstructorProject(jobId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const job = await jobOf(jobId);
  if (!job) return;
  const amount = parseAmount(String(formData.get("agreedAmount") ?? "0"));
  await db
    .update(constructorProjects)
    .set({ agreedAmount: fromCents(amount), notes: typed(formData, "notes"), updatedAt: new Date() })
    .where(eq(constructorProjects.id, jobId));
  await recordAudit({ action: "constructor.project.update", entity: "constructor", entityId: job.constructorId, detail: `${job.projectId}, ${fromCents(amount)}`, userId: user.id, userEmail: user.email });
  await flash("said.saved");
  back(job.constructorId);
}

/** The development off this constructor, payments and papers with it. */
export async function removeConstructorProject(jobId: string) {
  const user = await requireUser(["ADMIN"]);
  const job = await jobOf(jobId);
  if (!job) return;
  const pays = await db.select({ id: constructorPayments.id }).from(constructorPayments).where(eq(constructorPayments.constructorProjectId, jobId));
  if (pays.length > 0) {
    const docs = await db.select({ id: documents.id }).from(documents).where(inArray(documents.constructorPaymentId, pays.map((one) => one.id)));
    for (const doc of docs) await removeDocument(doc.id, user);
  }
  await db.delete(constructorProjects).where(eq(constructorProjects.id, jobId));
  await recordAudit({ action: "constructor.project.remove", entity: "constructor", entityId: job.constructorId, detail: job.projectId, userId: user.id, userEmail: user.email });
  await flash("said.deleted");
  back(job.constructorId);
}

async function filePapers(paymentId: string, formData: FormData, user: Awaited<ReturnType<typeof requireUser>>, label: string) {
  for (const [field, category, word] of [
    ["invoice", "INVOICE", "Constructor invoice"],
    ["receipt", "RECEIPT", "Constructor receipt"],
  ] as const) {
    const files = formData.getAll(field).filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) continue;
    const ids = await storeDocuments({ files, title: `${word}, ${label}`, category, attachTo: {}, user });
    if (ids.length > 0) await db.update(documents).set({ constructorPaymentId: paymentId }).where(inArray(documents.id, ids));
  }
}

/** A payment to the constructor, Pending until it is marked Paid or Cancelled. */
export async function addConstructorPayment(jobId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const job = await jobOf(jobId);
  if (!job) return;
  const amount = parseAmount(String(formData.get("amount") ?? "0"));
  if (amount <= 0) {
    await flash("said.amountNeeded", "bad");
    back(job.constructorId);
    return;
  }
  const day = String(formData.get("paidOn") ?? "").trim();
  const kind = typed(formData, "kind");
  const [row] = await db
    .insert(constructorPayments)
    .values({
      constructorProjectId: jobId,
      paidOn: day ? new Date(`${day}T12:00:00`) : new Date(),
      kind,
      amount: fromCents(amount),
      status: "PENDING",
      notes: typed(formData, "notes"),
      recordedByEmail: user.email,
    })
    .returning({ id: constructorPayments.id });
  await filePapers(row.id, formData, user, kind ?? fromCents(amount));
  await recordAudit({ action: "constructor.payment", entity: "constructor", entityId: job.constructorId, detail: `${kind ?? ""} ${fromCents(amount)}`.trim(), userId: user.id, userEmail: user.email });
  await flash("said.saved");
  back(job.constructorId);
}

/** Paid, Cancelled, or back to Pending. */
export async function setConstructorPaymentStatus(paymentId: string, status: ConstructorStatus) {
  const user = await requireUser(["ADMIN"]);
  if (!(CONSTRUCTOR_STATUSES as readonly string[]).includes(status)) return;
  const found = await paymentOf(paymentId);
  if (!found) return;
  await db
    .update(constructorPayments)
    .set({ status, statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(constructorPayments.id, paymentId));
  await recordAudit({ action: "constructor.payment.status", entity: "constructor", entityId: found.job.constructorId, detail: `${found.payment.kind ?? ""} ${found.payment.amount} ${status}`.trim(), userId: user.id, userEmail: user.email });
  await flash("said.saved");
  back(found.job.constructorId);
}

/** The constructor's invoice or receipt, added after the payment was written down. */
export async function uploadConstructorPapers(paymentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const found = await paymentOf(paymentId);
  if (!found) return;
  await filePapers(paymentId, formData, user, found.payment.kind ?? found.payment.amount);
  await flash("said.saved");
  back(found.job.constructorId);
}

export async function deleteConstructorPayment(paymentId: string) {
  const user = await requireUser(["ADMIN"]);
  const found = await paymentOf(paymentId);
  if (!found) return;
  const docs = await db.select({ id: documents.id }).from(documents).where(eq(documents.constructorPaymentId, paymentId));
  for (const doc of docs) await removeDocument(doc.id, user);
  await db.delete(constructorPayments).where(eq(constructorPayments.id, paymentId));
  await recordAudit({ action: "constructor.payment.delete", entity: "constructor", entityId: found.job.constructorId, detail: `${found.payment.kind ?? ""} ${found.payment.amount}`.trim(), userId: user.id, userEmail: user.email });
  await flash("said.deleted");
  back(found.job.constructorId);
}

export async function deleteConstructor(id: string) {
  const user = await requireUser(["ADMIN"]);
  const jobs = await db.select({ id: constructorProjects.id }).from(constructorProjects).where(eq(constructorProjects.constructorId, id));
  for (const job of jobs) await removeConstructorProject(job.id);
  await db.delete(constructors).where(eq(constructors.id, id));
  await recordAudit({ action: "constructor.delete", entity: "constructor", entityId: id, userId: user.id, userEmail: user.email });
  revalidatePath("/constructors");
  redirect("/constructors");
}
