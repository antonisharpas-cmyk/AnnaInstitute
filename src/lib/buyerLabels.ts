import type { MessageKey } from "@/i18n";
import type { ExtrasLabels } from "@/components/BuyerExtras";

/** The words the second buyer and bank boxes say, in the screen's language. */
export function extrasLabels(t: (key: MessageKey) => string): ExtrasLabels {
  return {
    name: t("common.name"),
    surname: t("common.surname"),
    email: t("common.email"),
    phone: t("common.phone"),
    idType: t("clients.idType"),
    idNumber: t("clients.idNumber"),
    country: t("clients.country"),
    address: t("clients.address"),
    birthDate: t("clients.birthDate"),
    notRecorded: t("clients.notRecorded"),
    relation: t("clients.second.relation"),
    relationHint: t("clients.second.relationHint"),
    secondToggle: t("clients.second.toggle"),
    secondHint: t("clients.second.hint"),
    loanToggle: t("clients.loan.toggle"),
    loanHint: t("clients.loan.hint"),
    bank: t("clients.loan.bank"),
    bankHint: t("clients.loan.bankHint"),
    contact: t("clients.loan.contact"),
    contactHint: t("clients.loan.contactHint"),
    loanEmail: t("clients.loan.email"),
    loanEmailHint: t("clients.loan.emailHint"),
    loanPhone: t("clients.loan.phone"),
    loanNotes: t("clients.loan.notes"),
  };
}
