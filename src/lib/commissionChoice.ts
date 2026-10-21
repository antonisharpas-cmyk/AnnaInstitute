import { normalizeAmount, parseAmount } from "@/lib/money";

/*
 * What a form says was agreed with the agent for one contract.
 *
 *   STANDARD  the agent's usual rate, nothing stored on the contract
 *   RATE      another rate for this contract alone
 *   FIXED     a fixed amount before VAT, whatever the price
 *
 * And whether the agent is paid in cash, which asks for no invoice, no
 * receipt and no letter. Shared by the contract form and the agent's page.
 */
export type CommissionMode = "STANDARD" | "RATE" | "FIXED";

export function commissionFromForm(formData: FormData): {
  commissionRate: string | null;
  commissionFixed: string | null;
  commissionInCash: boolean;
} {
  const mode = String(formData.get("commissionMode") ?? "STANDARD") as CommissionMode;
  const inCash = String(formData.get("commissionInCash") ?? "") === "on";
  if (mode === "RATE") {
    const typed = String(formData.get("commissionRate") ?? "").replace(",", ".").trim();
    const rate = Number(typed);
    if (typed !== "" && Number.isFinite(rate) && rate >= 0) {
      return { commissionRate: rate.toFixed(3), commissionFixed: null, commissionInCash: inCash };
    }
  }
  if (mode === "FIXED") {
    const fixed = normalizeAmount(String(formData.get("commissionFixed") ?? ""));
    if (fixed && parseAmount(fixed) > 0) return { commissionRate: null, commissionFixed: fixed, commissionInCash: inCash };
  }
  return { commissionRate: null, commissionFixed: null, commissionInCash: inCash };
}

/** The choice a stored contract stands for, for the form to open on. */
export function commissionModeOf(contract: { commissionRate?: string | null; commissionFixed?: string | null } | undefined): CommissionMode {
  if (contract?.commissionFixed != null && contract.commissionFixed !== "") return "FIXED";
  if (contract?.commissionRate != null && contract.commissionRate !== "") return "RATE";
  return "STANDARD";
}
