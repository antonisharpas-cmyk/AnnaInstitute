import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subowners } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent } from "@/lib/money";
import { projectsOfSubowner } from "@/lib/subowners";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import ProfileCard from "@/components/ProfileCard";
import { updateSubowner } from "../actions";

export default async function SubownerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const found = await db.select().from(subowners).where(eq(subowners.id, id)).limit(1);
  const subowner = found[0];
  if (!subowner) notFound();

  const held = await projectsOfSubowner(id);

  const units = held.reduce((a, row) => a + row.unitCount, 0);
  const sold = held.reduce((a, row) => a + row.soldCount, 0);
  const value = held.reduce((a, row) => a + row.valueCents, 0);

  return (
    <>
      <BackLink href="/subowners" label={t("subowners.backToSubowners")} />
      <PageHeader
        title={subowner.name}
        subtitle={[subowner.company, subowner.contactName, subowner.email, subowner.phone]
          .filter(Boolean)
          .join(" . ")}
        action={
          <Pill tone={subowner.isActive ? "good" : "warn"}>
            {subowner.isActive ? t("agents.active") : t("agents.inactive")}
          </Pill>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("subowners.projects")} value={String(held.length)} />
        <Stat label={t("subowners.units")} value={String(units)} />
        <Stat label={t("subowners.sold")} value={String(sold)} />
        <Stat label={t("subowners.value")} value={formatAmount(value, locale)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={t("subowners.theirProjects")}>
            {held.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t("projects.title")}</th>
                      <th>{t("subowners.share")}</th>
                      <th>{t("subowners.role")}</th>
                      <th className="ctr">{t("subowners.units")}</th>
                      <th className="ctr">{t("subowners.sold")}</th>
                      <th className="ctr">{t("subowners.value")}</th>
                      <th>{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {held.map((row) => (
                      <tr key={row.partner.id}>
                        <td>
                          <Link
                            href={`/projects/${row.project.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold hover:underline"
                          >
                            {row.project.name}
                          </Link>
                          <div className="text-xs text-brand-graphite/60">
                            {row.project.location ?? ""}
                          </div>
                        </td>
                        <td>
                          {row.partner.sharePercent
                            ? formatPercent(Number(row.partner.sharePercent), locale)
                            : ""}
                        </td>
                        <td className="text-xs">{row.partner.role ?? ""}</td>
                        <td className="ctr">{row.unitCount}</td>
                        <td className="ctr">{row.soldCount}</td>
                        <td className="ctr">{formatAmount(row.valueCents, locale)}</td>
                        <td>
                          <Pill
                            tone={
                              row.project.status === "COMPLETED"
                                ? "good"
                                : row.project.status === "UNDER_CONSTRUCTION"
                                  ? "warn"
                                  : "neutral"
                            }
                          >
                            {t(`projects.status.${row.project.status}` as MessageKey)}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div>
          <ProfileCard
            title={t("subowners.profile")}
            action={updateSubowner.bind(null, id)}
            labels={{ edit: t("common.edit"), save: t("common.save"), cancel: t("common.cancel") }}
            fields={[
              { name: "name", label: t("common.name"), value: subowner.name, required: true },
              { name: "company", label: t("subowners.company"), value: subowner.company ?? "" },
              {
                name: "contactName",
                label: t("subowners.contact"),
                value: subowner.contactName ?? "",
              },
              {
                name: "email",
                label: t("leads.email"),
                value: subowner.email ?? "",
                kind: "email",
              },
              { name: "phone", label: t("leads.phone"), value: subowner.phone ?? "" },
              { name: "address", label: t("clients.address"), value: subowner.address ?? "" },
              { name: "country", label: t("clients.country"), value: subowner.country ?? "" },
              {
                name: "vatNumber",
                label: t("subowners.vatNumber"),
                value: subowner.vatNumber ?? "",
              },
              {
                name: "registryNumber",
                label: t("subowners.registryNumber"),
                value: subowner.registryNumber ?? "",
              },
              {
                name: "isActive",
                label: t("common.status"),
                kind: "checkbox",
                checked: subowner.isActive,
                display: subowner.isActive ? t("agents.active") : t("agents.inactive"),
                hint: t("agents.active"),
              },
              {
                name: "notes",
                label: t("common.notes"),
                kind: "textarea",
                value: subowner.notes ?? "",
              },
            ]}
          />
        </div>
      </div>
    </>
  );
}
