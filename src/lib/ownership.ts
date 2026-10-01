import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectPartners, projects, subownerShares, subowners } from "@/db/schema";

/*
 * Who owns what share of each development.
 *
 * A development is held by a company, always the whole of it, and a
 * development no company holds is One Eleven's directly. Each company is owned
 * by its shareholders, One Eleven always among them, so a shareholder's share
 * of a development is its share of the company that holds it.
 *
 * Trivest holding a development, with One Eleven owning 33.33% of Trivest,
 * makes One Eleven's share of that development 33.33%.
 */

export type Who = { kind: "oneEleven" } | { kind: "holder"; name: string } | { kind: "company"; id: string };

export type HolderLine = { name: string; percent: number; isOneEleven: boolean };

export type CompanyOnProject = {
  id: string;
  name: string;
  /** The company's share of the development, as a fraction. */
  share: number;
  holders: HolderLine[];
};

export type ProjectHolding = {
  projectId: string;
  projectName: string;
  companies: CompanyOnProject[];
  /** What no company holds: One Eleven's own, as a fraction. */
  direct: number;
};

export const holderKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** Every development, the companies that hold it and who owns them. */
export async function holdings(): Promise<ProjectHolding[]> {
  const [projectRows, lines, shares] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name)),
    db
      .select({
        projectId: projectPartners.projectId,
        company: { id: subowners.id, name: subowners.name },
      })
      .from(projectPartners)
      .innerJoin(subowners, eq(subowners.id, projectPartners.subownerId)),
    db.select().from(subownerShares),
  ]);

  const holdersOf = new Map<string, HolderLine[]>();
  for (const row of shares) {
    const list = holdersOf.get(row.subownerId) ?? [];
    list.push({ name: row.holder, percent: Number(row.sharePercent ?? 0), isOneEleven: row.isOneEleven });
    holdersOf.set(row.subownerId, list);
  }

  return projectRows.map((project) => {
    const mine = lines.filter((line) => line.projectId === project.id);
    /* A company holds the whole of its development. Two on one development,
       which should not happen, would hold it between them in equal parts. */
    const companies = mine.map((line) => ({
      id: line.company.id,
      name: line.company.name,
      share: 1 / mine.length,
      holders: holdersOf.get(line.company.id) ?? [],
    }));
    const held = companies.reduce((sum, one) => sum + one.share, 0);
    return { projectId: project.id, projectName: project.name, companies, direct: Math.max(0, 1 - held) };
  });
}

/** A holder's share of one company, as a fraction. */
function holderShare(company: CompanyOnProject, who: Who): number {
  if (who.kind === "company") return company.id === who.id ? 1 : 0;
  const line =
    who.kind === "oneEleven"
      ? company.holders.find((one) => one.isOneEleven || /^\s*one\s*eleven\b/i.test(one.name))
      : company.holders.find((one) => holderKey(one.name) === holderKey(who.name));
  return line ? line.percent / 100 : 0;
}

export type ShareOfProject = {
  /** Of the development: what its sales, money and costs are shared by. */
  share: number;
  /**
   * Of the agents' commissions. The office's rule is that a commission is the
   * expense of the companies that hold the development, so the companies carry
   * it between them in proportion to their shares and the direct part carries
   * none of it. A development no company holds is One Eleven's alone, and so is
   * its commission.
   */
  commissionShare: number;
  lines: { via: string | null; companyShare: number; holderShare: number; share: number }[];
};

export function shareOf(holding: ProjectHolding, who: Who): ShareOfProject {
  const lines: ShareOfProject["lines"] = [];
  let share = 0;
  let commissionShare = 0;
  const companiesHeld = holding.companies.reduce((sum, one) => sum + one.share, 0);

  for (const company of holding.companies) {
    const part = holderShare(company, who);
    if (part <= 0) continue;
    const effective = company.share * part;
    share += effective;
    commissionShare += companiesHeld > 0 ? (company.share / companiesHeld) * part : 0;
    lines.push({ via: company.name, companyShare: company.share, holderShare: part, share: effective });
  }

  if (who.kind === "oneEleven" && holding.direct > 0) {
    share += holding.direct;
    if (holding.companies.length === 0) commissionShare += 1;
    lines.unshift({ via: null, companyShare: holding.direct, holderShare: 1, share: holding.direct });
  }

  return { share, commissionShare, lines };
}

/** Everybody who holds a share of any company, One Eleven first, for the picker. */
export async function shareholderChoices(): Promise<{ value: string; label: string }[]> {
  const rows = await db.select({ holder: subownerShares.holder, isOneEleven: subownerShares.isOneEleven }).from(subownerShares);
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.isOneEleven) continue;
    const key = holderKey(row.holder);
    if (key && !seen.has(key) && !/^one\s*eleven\b/.test(key)) seen.set(key, row.holder.trim());
  }
  return [
    { value: "oneEleven", label: "One Eleven" },
    ...[...seen.values()].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: `holder:${name}`, label: name })),
  ];
}

export function whoFrom(raw: string | undefined): Who | null {
  if (!raw) return null;
  if (raw === "oneEleven") return { kind: "oneEleven" };
  if (raw.startsWith("holder:")) return { kind: "holder", name: raw.slice(7) };
  if (raw.startsWith("company:")) return { kind: "company", id: raw.slice(8) };
  return null;
}
