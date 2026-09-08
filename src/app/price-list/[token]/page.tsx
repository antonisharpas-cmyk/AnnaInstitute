import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import { formatAmount, toCents } from "@/lib/money";
import { availableForPriceList, resolvePriceListToken } from "@/lib/priceList";

export const dynamic = "force-dynamic";

/**
 * The public price list.
 *
 * Reached by a long random token, with no login, because an agent should not
 * need an account to quote a price. It carries availability and prices only:
 * no buyer, no contract and no payment ever appears here.
 */
export default async function PriceListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolvePriceListToken(token);
  if (!link) notFound();

  const rows = await availableForPriceList();
  const byProject = new Map<
    string,
    {
      name: string;
      location: string | null;
      completionBy: string | null;
      units: typeof rows;
    }
  >();

  for (const row of rows) {
    const current = byProject.get(row.project.id);
    if (current) {
      current.units.push(row);
    } else {
      byProject.set(row.project.id, {
        name: row.project.name,
        location: row.project.location,
        completionBy: row.project.completionBy,
        units: [row],
      });
    }
  }

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-brand-line pb-5">
        <div>
          <Logo width={150} />
          <h1 className="mt-3 text-xl font-semibold">Available apartments</h1>
          <p className="text-sm text-brand-graphite/70">
            Prices before VAT. Correct as at {today}.
          </p>
        </div>
        <div className="text-right text-xs text-brand-graphite/60">
          {link.note ? <div className="font-semibold">{link.note}</div> : null}
          <div>Ermou 75, 6022 Larnaca</div>
          <div>+357 24 342 720</div>
          {link.expiresAt ? (
            <div className="mt-1">
              This list stops working on {new Date(link.expiresAt).toLocaleDateString("en-GB")}
            </div>
          ) : null}
        </div>
      </header>

      {byProject.size === 0 ? (
        <p className="py-10 text-center text-sm text-brand-graphite/60">
          Everything is sold at the moment.
        </p>
      ) : (
        [...byProject.values()].map((project) => (
          <section key={project.name} className="mb-8">
            <h2 className="text-base font-semibold">{project.name}</h2>
            <p className="mb-2 text-sm text-brand-graphite/70">
              {[project.location, project.completionBy].filter(Boolean).join(" . ")}
            </p>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Floor</th>
                    <th className="num">Bedrooms</th>
                    <th className="num">Covered</th>
                    <th className="num">Veranda</th>
                    <th className="num">Parking</th>
                    <th className="num">Price before VAT</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {project.units.map(({ unit }) => (
                    <tr key={unit.id}>
                      <td className="font-semibold">{unit.code}</td>
                      <td>{unit.floor ?? ""}</td>
                      <td className="num">{unit.bedrooms ?? ""}</td>
                      <td className="num">
                        {unit.coveredArea ? `${Number(unit.coveredArea)} m2` : ""}
                      </td>
                      <td className="num">
                        {unit.verandaArea ? `${Number(unit.verandaArea)} m2` : ""}
                      </td>
                      <td className="num">{unit.parkingSpaces}</td>
                      <td className="num font-semibold">{formatAmount(toCents(unit.netPrice))}</td>
                      <td>{unit.status === "RESERVED" ? "reserved" : "available"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <footer className="mt-10 border-t border-brand-line pt-4 text-xs text-brand-graphite/60">
        <p>
          VAT is charged in addition and depends on the buyer. The reduced rate applies only where
          the buyer qualifies, and their accountant confirms it before a figure is quoted.
        </p>
        <p className="mt-1">
          This page is live, so it always shows what is available now. Print it if you need a copy
          for a meeting.
        </p>
      </footer>
    </main>
  );
}
