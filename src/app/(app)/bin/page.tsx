import Link from "next/link";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { BIN_DAYS, readBin } from "@/lib/undo";
import { Card, PageHeader } from "@/components/ui";
import { NothingYet } from "@/components/Nothing";
import { IconClock } from "@/components/icons";
import { forGood, putBack } from "./actions";

/**
 * The recycle bin.
 *
 * Nothing the office deletes by hand disappears on the spot. It waits here for
 * thirty days, out of every list and every count, and a single button puts it
 * back where it was. Clearing it for good is the only irreversible thing on the
 * page, so it is the only thing that says so.
 */
export default async function BinPage() {
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();
  const { leads, clients } = await readBin();

  const day = (value: Date | null) =>
    value
      ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "";

  const left = (value: Date | null) => {
    if (!value) return 0;
    const gone = (Date.now() - new Date(value).getTime()) / 86_400_000;
    return Math.max(0, Math.ceil(BIN_DAYS - gone));
  };

  const rows = [
    ...leads.map((row) => ({
      id: row.id,
      kind: "lead" as const,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || row.id,
      note: [row.email, row.phone].filter(Boolean).join(" . "),
      deletedAt: row.deletedAt,
    })),
    ...clients.map((row) => ({
      id: row.id,
      kind: "client" as const,
      name: `${row.lastName} ${row.firstName}`.trim(),
      note: [row.email, row.phone].filter(Boolean).join(" . "),
      deletedAt: row.deletedAt,
    })),
  ].sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));

  return (
    <>
      <PageHeader title={t("bin.title")} subtitle={t("bin.subtitle")} />

      <Card flush>
        {rows.length === 0 ? (
          <NothingYet
            title={t("bin.empty")}
            note={t("bin.emptyNote")}
            icon={<IconClock size={20} />}
            action={
              <Link href="/leads" className="btn btn-secondary !py-1 !text-xs">
                {t("nav.leads")}
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("bin.deletedOn")}</th>
                  <th className="ctr">{t("bin.daysLeft")}</th>
                  <th className="ctr">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td>
                      <span className="font-semibold">{row.name}</span>
                      {row.note ? (
                        <div className="text-xs text-brand-graphite/60">{row.note}</div>
                      ) : null}
                    </td>
                    <td className="text-xs">
                      {row.kind === "lead" ? t("bin.lead") : t("bin.client")}
                    </td>
                    <td className="whitespace-nowrap text-xs">{day(row.deletedAt)}</td>
                    <td className="ctr tabular-nums">{left(row.deletedAt)}</td>
                    <td className="ctr">
                      <div className="flex justify-center gap-1">
                        <form action={putBack.bind(null, row.kind, row.id)}>
                          <button type="submit" className="btn btn-primary !px-2 !py-1 !text-xs">
                            {t("bin.restore")}
                          </button>
                        </form>
                        <form action={forGood.bind(null, row.kind, row.id)}>
                          <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                            {t("bin.forGood")}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-brand-graphite/60">{t("bin.warn")}</p>
          </div>
        )}
      </Card>
    </>
  );
}
