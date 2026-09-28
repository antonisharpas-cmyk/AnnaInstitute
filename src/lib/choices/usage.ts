import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ListKey } from "./lists";
import { listEntries } from "./index";

/**
 * How many records hold each value, for the Builder.
 *
 * A record counts under the office's own value when it has one, and under the
 * built in value otherwise, which is what the record shows.
 */
const WHERE: Record<ListKey, string> = {
  leadStatus: "select coalesce(status_choice, status::text) as code from leads where deleted_at is null",
  leadSource: "select coalesce(source_choice, source_kind::text) as code from leads where deleted_at is null",
  clientSource: "select coalesce(source_choice, source::text) as code from clients where deleted_at is null",
  idType: "select coalesce(id_type_choice, id_type::text) as code from clients where deleted_at is null and id_type is not null",
  projectStatus: "select coalesce(status_choice, status::text) as code from projects",
  unitStatus: "select coalesce(status_choice, status::text) as code from units",
  contractStatus: "select coalesce(status_choice, status::text) as code from contracts",
  contractKind: "select coalesce(kind_choice, kind::text) as code from contracts",
  /* Stages are words on each installment; they are matched to the list below. */
  installmentStage: "select label as code from installments",
  paymentMethod: "select method as code from payments where method is not null",
  appointmentType: "select coalesce(type_choice, type::text) as code from appointments",
  expenseCategory: "select coalesce(category_choice, category::text) as code from expenses",
};

export async function usageOf(list: ListKey): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const result = await db.execute(sql.raw(`select code, count(*)::int as n from (${WHERE[list]}) x group by code`));
    const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as { code: string; n: number }[];
    if (list === "installmentStage") {
      /* Each line counts under the stage its words belong to, own stages first. */
      const entries = await listEntries("installmentStage");
      const key = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
      for (const row of rows) {
        const words = key(row.code);
        const own = entries.find((one) => !one.builtin && [one.labelEn, one.labelEl].some((n) => key(n) === words));
        const built = entries.find((one) => one.builtin && [one.defaultEn, one.defaultEl, one.labelEn, one.labelEl].some((n) => key(n) === words));
        const code = (own ?? built)?.code;
        if (code) out.set(code, (out.get(code) ?? 0) + Number(row.n));
      }
      return out;
    }
    for (const row of rows) out.set(String(row.code), Number(row.n));
  } catch {
    /* A table that is not there yet has nothing on it. */
  }
  return out;
}
