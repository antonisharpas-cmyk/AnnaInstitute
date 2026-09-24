"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { issueForPayment } from "@/lib/issued";

/**
 * Issue the invoice and receipt for a payment recorded before the CRM issued
 * them. Pressed by hand, one payment at a time, so old test payments never
 * use up numbers from the real series by themselves.
 */
export async function issuePapers(paymentId: string) {
  const user = await requireUser(["ADMIN"]);
  const pair = await issueForPayment(paymentId, { id: user.id, name: user.name });
  await recordAudit({
    action: "issued.byHand",
    entity: "payment",
    entityId: paymentId,
    detail: [pair.invoice ? `invoice ${pair.invoice.number}` : "", pair.receipt ? `receipt ${pair.receipt.number}` : ""]
      .filter(Boolean)
      .join(", "),
    userId: user.id,
    userEmail: user.email,
  });
  await flash("said.papersIssued");
  revalidatePath("/invoices/clients");
}
