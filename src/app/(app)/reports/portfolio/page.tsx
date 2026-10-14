import { redirect } from "next/navigation";

/**
 * This report is now part of Apartment Sales. An old link or bookmark lands
 * there, with whatever development, company and period it carried.
 */
export default async function MovedReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const keep = new URLSearchParams();
  for (const key of ["period", "from", "to", "project", "partner"]) {
    const value = params[key];
    if (typeof value === "string" && value) keep.set(key, value);
  }
  const query = keep.toString();
  redirect(`/reports/apartments${query ? `?${query}` : ""}`);
}
