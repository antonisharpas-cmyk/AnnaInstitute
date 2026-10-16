"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cashEntries } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { fromCents, parseAmount } from "@/lib/money";
import { splitChoice } from "@/lib/choices/lists";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { asOurCompanyId } from "@/lib/parties";

const typed = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

/** What the form says, or the reason it cannot be saved. */
async function read(formData: FormData) {
  const direction = String(formData.get("direction") ?? "OUT") === "IN" ? "IN" : "OUT";
  const amountCents = parseAmount(String(formData.get("amount") ?? "0"));
  const party = String(formData.get("party") ?? "").trim();
  const day = String(formData.get("entryDate") ?? "").trim();
  /* The category as on the invoices: a built in one, or the office's own counted as one. */
  const picked = splitChoice(String(formData.get("category") ?? "OTHER") || "OTHER");
  const known = (EXPENSE_CATEGORIES as readonly string[]).includes(picked.base);
  const category = known ? picked.base : "OTHER";
  const project = String(formData.get("projectId") ?? "");
  const values = {
    direction,
    entryDate: day ? new Date(`${day}T12:00:00`) : new Date(),
    amount: fromCents(amountCents),
    party,
    category,
    categoryChoice: known ? picked.choice : null,
    categoryOther: category === "OTHER" && !picked.choice ? typed(formData, "categoryOther") : null,
    projectId: project && project !== "NONE" ? project : null,
    ourCompanyId: await asOurCompanyId(typed(formData, "ourCompanyId")),
    description: typed(formData, "description"),
    notes: typed(formData, "notes"),
  };
  if (amountCents <= 0) return { error: "said.amountNeeded" as const, values };
  if (!party) return { error: "cash.needParty" as const, values };
  return { error: null, values };
}

const back = () => {
  revalidatePath("/invoices/cash");
  revalidatePath("/reports/costs");
  revalidatePath("/reports/shareholders");
};

export async function createCashEntry(formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const { error, values } = await read(formData);
  if (error) {
    await flash(error, "bad");
    back();
    return;
  }
  const [row] = await db.insert(cashEntries).values({ ...values, recordedByEmail: user.email }).returning({ id: cashEntries.id });
  await recordAudit({
    action: "cash.create",
    entity: "cash",
    entityId: row.id,
    detail: `${values.direction === "IN" ? "received from" : "paid to"} ${values.party}, ${values.amount}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  back();
}

export async function updateCashEntry(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const { error, values } = await read(formData);
  if (error) {
    await flash(error, "bad");
    revalidatePath(`/invoices/cash/${id}`);
    return;
  }
  await db.update(cashEntries).set({ ...values, updatedAt: new Date() }).where(eq(cashEntries.id, id));
  await recordAudit({
    action: "cash.update",
    entity: "cash",
    entityId: id,
    detail: `${values.direction === "IN" ? "received from" : "paid to"} ${values.party}, ${values.amount}`,
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.saved");
  back();
  redirect("/invoices/cash");
}

export async function deleteCashEntry(id: string) {
  const user = await requireUser(["ADMIN"]);
  const [row] = await db.delete(cashEntries).where(eq(cashEntries.id, id)).returning({ party: cashEntries.party, amount: cashEntries.amount });
  if (row) {
    await recordAudit({ action: "cash.delete", entity: "cash", entityId: id, detail: `${row.party}, ${row.amount}`, userId: user.id, userEmail: user.email });
  }
  await flash("said.deleted");
  back();
  redirect("/invoices/cash");
}
