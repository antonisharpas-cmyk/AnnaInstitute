import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contracts, projectPartners, subowners, units } from "@/db/schema";
import { readSettings } from "@/lib/settings";
import type { IssuedSnapshot } from "@/lib/paymentPdf";

/*
 * Who issues a paper.
 *
 * An apartment's invoices, receipts and credit notes go out from the company
 * that holds its development, in that company's name, with its logo, its
 * registration and tax numbers, its bank and its own running numbers. A
 * development no company holds is One Eleven's, and so are One Eleven's own
 * fees to the companies.
 *
 * One Eleven's details are in Settings; every other company's are on its own
 * page. The issuer id is empty for One Eleven and the company's id otherwise,
 * which is also how each series of numbers is kept apart.
 */

export type Issuer = IssuedSnapshot["company"];

export const ONE_ELEVEN = "";

/** One Eleven's own logo, shipped with the app. */
export const ONE_ELEVEN_LOGO = "public:brand/oneeleven-logo.png";
export const ONE_ELEVEN_COLOR = "#3D8397";

const COMPANY_KEYS = [
  "company.name",
  "company.registration",
  "company.vat",
  "company.tic",
  "company.address",
  "company.phone",
  "company.mobile",
  "company.fax",
  "company.email",
  "company.website",
  "company.bankName",
  "company.beneficiary",
  "company.bankAccount",
  "company.iban",
  "company.swift",
] as const;

/** One Eleven, from Settings. */
export async function companyDetails(): Promise<Issuer> {
  const c = await readSettings([...COMPANY_KEYS]);
  return {
    issuerId: ONE_ELEVEN,
    name: c["company.name"],
    registration: c["company.registration"],
    vat: c["company.vat"],
    tic: c["company.tic"],
    address: c["company.address"],
    phone: c["company.phone"],
    mobile: c["company.mobile"],
    fax: c["company.fax"],
    email: c["company.email"],
    website: c["company.website"],
    bankName: c["company.bankName"],
    beneficiary: c["company.beneficiary"] || c["company.name"],
    bankAccount: c["company.bankAccount"],
    iban: c["company.iban"],
    swift: c["company.swift"],
    logo: ONE_ELEVEN_LOGO,
    color: ONE_ELEVEN_COLOR,
  };
}

type CompanyRow = typeof subowners.$inferSelect;

/** A company as its papers name it. The legal name is the one on the paper. */
export function issuerFromCompany(company: CompanyRow): Issuer {
  const legal = company.company?.trim() || company.name;
  return {
    issuerId: company.id,
    name: legal,
    registration: company.registryNumber ?? "",
    vat: company.vatNumber ?? "",
    tic: company.tic ?? "",
    address: [company.address, company.country].map((one) => (one ?? "").trim()).filter(Boolean).join(", "),
    phone: company.phone ?? "",
    mobile: company.mobile ?? "",
    fax: company.fax ?? "",
    email: company.email ?? "",
    website: company.website ?? "",
    bankName: company.bankName ?? "",
    beneficiary: company.bankBeneficiary?.trim() || legal,
    bankAccount: company.bankAccount ?? "",
    iban: company.iban ?? "",
    swift: company.bic ?? "",
    logo: company.logoPath ?? "",
    color: validColor(company.brandColor) ?? ONE_ELEVEN_COLOR,
  };
}

export function validColor(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
}

/**
 * The company that holds each development, by development.
 *
 * A development held by two companies, which should not happen, is invoiced
 * by the first of them by name, so the answer is always the same one.
 */
export async function issuerOfProjects(): Promise<Map<string, string>> {
  const rows = await db
    .select({ projectId: projectPartners.projectId, subownerId: projectPartners.subownerId })
    .from(projectPartners)
    .innerJoin(subowners, eq(subowners.id, projectPartners.subownerId))
    .orderBy(asc(subowners.name));
  const map = new Map<string, string>();
  for (const row of rows) if (!map.has(row.projectId)) map.set(row.projectId, row.subownerId);
  return map;
}

/** The company that holds one development, or One Eleven. */
export async function issuerIdOfProject(projectId: string | null | undefined): Promise<string> {
  if (!projectId) return ONE_ELEVEN;
  const [row] = await db
    .select({ subownerId: projectPartners.subownerId })
    .from(projectPartners)
    .innerJoin(subowners, eq(subowners.id, projectPartners.subownerId))
    .where(eq(projectPartners.projectId, projectId))
    .orderBy(asc(subowners.name))
    .limit(1);
  return row?.subownerId ?? ONE_ELEVEN;
}

export async function issuerIdOfContract(contractId: string): Promise<string> {
  const [row] = await db
    .select({ projectId: units.projectId })
    .from(contracts)
    .leftJoin(units, eq(units.id, contracts.unitId))
    .where(eq(contracts.id, contractId))
    .limit(1);
  return issuerIdOfProject(row?.projectId ?? null);
}

/** The details a paper prints for an issuer id. */
export async function issuerDetails(issuerId: string): Promise<Issuer> {
  if (!issuerId) return companyDetails();
  const [company] = await db.select().from(subowners).where(eq(subowners.id, issuerId)).limit(1);
  return company ? issuerFromCompany(company) : companyDetails();
}

export async function issuerForProject(projectId: string | null | undefined): Promise<Issuer> {
  return issuerDetails(await issuerIdOfProject(projectId));
}

/** Where a company's series carries on from, as typed on its page. */
export async function companySeriesStart(
  issuerId: string,
  which: "nextInvoice" | "nextReceipt" | "nextCreditNote",
): Promise<number | null> {
  if (!issuerId) return null;
  const [row] = await db
    .select({ n: subowners[which] })
    .from(subowners)
    .where(eq(subowners.id, issuerId))
    .limit(1);
  const n = Number(row?.n ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}
