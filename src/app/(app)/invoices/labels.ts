import type { getTranslator } from "@/i18n";

type T = Awaited<ReturnType<typeof getTranslator>>["t"];

/** The words on the company invoice form, in one place for both pages. */
export function invoiceLabels(t: T): Record<string, string> {
  return {
    weCharge: t("invoices.weCharge"),
    weChargeHint: t("invoices.weChargeHint"),
    weReceived: t("invoices.weReceived"),
    weReceivedHint: t("invoices.weReceivedHint"),
    partnerTo: t("invoices.partnerTo"),
    choosePartner: t("invoices.choosePartner"),
    sentTo: t("invoices.sentTo"),
    partnerNoEmail: t("invoices.partnerNoEmail"),
    partnerOptional: t("invoices.partnerOptional"),
    notAPartner: t("invoices.notAPartner"),
    otherPlaceholder: t("invoices.otherPlaceholder"),
    descriptionExample: t("invoices.descriptionExample"),
    ourNumber: t("invoices.ourNumber"),
    numberedByCrm: t("invoices.numberedByCrm"),
    vatRate: t("invoices.vatRate"),
    lockedNote: t("invoices.lockedNote"),
    issueAndSend: t("invoices.issueAndSend"),
    saveAndSend: t("invoices.saveAndSend"),
    supplier: t("invoices.supplier"),
    category: t("invoices.category"),
    reference: t("invoices.reference"),
    description: t("invoices.description"),
    issued: t("invoices.issued"),
    due: t("invoices.due"),
    net: t("invoices.net"),
    vat: t("invoices.vat"),
    total: t("invoices.total"),
    alreadyPaid: t("invoices.alreadyPaid"),
    project: t("invoices.project"),
    noProject: t("invoices.noProject"),
    files: t("invoices.files"),
    filesNote: t("invoices.filesNote"),
    notes: t("common.notes"),
    save: t("common.save"),
    cancel: t("common.cancel"),
  };
}
