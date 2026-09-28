/* No server-only marker, for the same reason as ./index: the commission rule uses it from the scripts too. */
import { listEntries } from "./index";

/**
 * The stages of a payment schedule, by name.
 *
 * An installment keeps its stage as the words written on the contract, in
 * English and Greek. The CRM needs to know two things from those words: which
 * line is the reservation and which is the signing, because the letters to the
 * buyer and the agent's commission follow them. So a stage is recognised by
 * every name it has had: the CRM's own, the name the office gave it in the
 * Builder, and the names of the office's own stages that count as it.
 */
const plain = (value: string | null | undefined) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/* Words older contracts used before the stages were settled. */
const OLDER: Record<string, string[]> = {
  SIGNING: ["on signing of contract"],
};

export async function stageNames(): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (const entry of await listEntries("installmentStage")) {
    for (const name of [entry.defaultEn, entry.defaultEl, entry.labelEn, entry.labelEl]) {
      const key = plain(name);
      if (key && !byName.has(key)) byName.set(key, entry.base);
    }
  }
  for (const [base, names] of Object.entries(OLDER)) for (const name of names) byName.set(plain(name), base);
  return byName;
}

/** The built in stage an installment's words count as, or null for a stage the CRM has no rule for. */
export function stageFrom(names: Map<string, string>, label: string | null | undefined, labelEl?: string | null): string | null {
  return names.get(plain(label)) ?? names.get(plain(labelEl)) ?? null;
}

export type StageOption = { label: string; labelEl: string };

/**
 * What the schedule offers on each line, in the office's order and words, and
 * the office's name for each of the CRM's own stages, so the ready made plans
 * are written in the office's words too.
 */
export async function stageOptions(): Promise<{ choices: StageOption[]; named: Record<string, StageOption> }> {
  const entries = await listEntries("installmentStage");
  const word = (one: (typeof entries)[number]) => ({
    label: one.labelEn?.trim() || one.defaultEn,
    labelEl: one.labelEl?.trim() || one.defaultEl,
  });
  const choices = entries.filter((one) => one.active).map(word);
  const named: Record<string, StageOption> = {};
  for (const one of entries.filter((entry) => entry.builtin)) named[plain(one.defaultEn)] = word(one);
  /* The older wording of the signing reads as the signing today. */
  const signing = entries.find((one) => one.code === "SIGNING");
  if (signing) named[plain("On signing of contract")] = word(signing);
  return { choices, named };
}
