import Link from "next/link";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { listConstructors } from "@/lib/constructors";
import { formatAmount, toCents } from "@/lib/money";
import { Card, Empty, PageHeader, Pill } from "@/components/ui";

/** Every constructor, with the developments they build and where the money stands. */
export const dynamic = "force-dynamic";

export default async function ConstructorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser(["ADMIN"]);
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const rows = await listConstructors(params.q ?? "");
  const money = (value: string) => formatAmount(toCents(value), locale);

  return (
    <>
      <PageHeader
        title={t("constructors.title")}
        subtitle={t("constructors.subtitle")}
        action={
          <Link href="/constructors/new" className="btn btn-primary">
            {t("constructors.new")}
          </Link>
        }
      />
      <Card>
        <form action="/constructors" method="get" className="mb-3 flex gap-2">
          <input name="q" defaultValue={params.q ?? ""} placeholder={t("constructors.searchPlaceholder")} className="input sm:max-w-md" />
          <button type="submit" className="btn btn-secondary">
            {t("common.search")}
          </button>
        </form>
        {rows.length === 0 ? (
          <Empty message={t("constructors.none")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("constructors.projects")}</th>
                  <th className="ctr">{t("constructors.agreed")}</th>
                  <th className="ctr">{t("constructors.paid")}</th>
                  <th className="ctr">{t("constructors.pending")}</th>
                  <th className="ctr">{t("constructors.remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.builder.id}>
                    <td>
                      <Link href={`/constructors/${row.builder.id}`} className="font-semibold hover:underline" data-open>
                        {row.builder.name}
                      </Link>
                      <div className="text-xs text-brand-graphite/60">
                        {[row.builder.company, row.builder.phone, row.builder.email].filter(Boolean).join(" . ")}
                      </div>
                      {row.builder.isActive ? null : <Pill>{t("constructors.inactive")}</Pill>}
                    </td>
                    <td className="text-xs">{row.projects ?? ""}</td>
                    <td className="ctr nowrap">{money(row.agreed)}</td>
                    <td className="ctr nowrap">{money(row.paid)}</td>
                    <td className="ctr nowrap">{money(row.pending)}</td>
                    <td className="ctr nowrap font-semibold">{formatAmount(toCents(row.agreed) - toCents(row.paid), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
