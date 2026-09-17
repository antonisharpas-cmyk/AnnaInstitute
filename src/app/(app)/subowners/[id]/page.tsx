import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subowners } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent } from "@/lib/money";
import { directorsOf, projectsOfSubowner, sharesOf } from "@/lib/subowners";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import ProfileCard from "@/components/ProfileCard";
import Disclosure from "@/components/Disclosure";
import {
  addDirector,
  addShareholder,
  removeDirector,
  removeShareholder,
  updateSubowner,
} from "../actions";

export default async function SubownerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getTranslator();

  const found = await db.select().from(subowners).where(eq(subowners.id, id)).limit(1);
  const subowner = found[0];
  if (!subowner) notFound();

  const [held, directors, shares] = await Promise.all([
    projectsOfSubowner(id),
    directorsOf(id),
    sharesOf(id),
  ]);

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

        <div className="space-y-4">
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

          <Card title={t("subowners.directors")}>
            {directors.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <ul className="divide-y divide-brand-line text-sm">
                {directors.map((person) => (
                  <li key={person.id} className="py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{person.name}</p>
                      <form action={removeDirector.bind(null, person.id, id)}>
                        <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                          {t("subowners.remove")}
                        </button>
                      </form>
                    </div>
                    {person.role ? (
                      <p className="text-xs text-brand-graphite/60">{person.role}</p>
                    ) : null}
                    {[person.email, person.emailAlternate].filter(Boolean).map((address) => (
                      <p key={address} className="text-xs break-all">
                        <a
                          href={`mailto:${address}`}
                          className="text-brand-teal-dark hover:underline"
                        >
                          {address}
                        </a>
                      </p>
                    ))}
                    {person.phone ? (
                      <p className="text-xs">
                        <a
                          href={`tel:${person.phone}`}
                          className="text-brand-teal-dark hover:underline"
                        >
                          {person.phone}
                        </a>
                      </p>
                    ) : null}
                    {person.notes ? (
                      <p className="mt-1 text-xs text-brand-graphite/60">{person.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3">
              <Disclosure showLabel={t("subowners.addDirector")} hideLabel={t("common.cancel")}>
                <form
                  action={addDirector.bind(null, id)}
                  className="grid gap-2 rounded border border-brand-line bg-brand-surface p-3"
                >
                  <div>
                    <label className="label" htmlFor="directorName">
                      {t("common.name")}
                    </label>
                    <input id="directorName" name="name" required className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="directorRole">
                      {t("subowners.role")}
                    </label>
                    <input
                      id="directorRole"
                      name="role"
                      placeholder={t("subowners.directorPlaceholder")}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="directorEmail">
                      {t("leads.email")}
                    </label>
                    <input id="directorEmail" name="email" type="email" className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="directorEmailAlternate">
                      {t("subowners.secondEmail")}
                    </label>
                    <input
                      id="directorEmailAlternate"
                      name="emailAlternate"
                      type="email"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="directorPhone">
                      {t("leads.phone")}
                    </label>
                    <input id="directorPhone" name="phone" className="input" />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    {t("common.add")}
                  </button>
                </form>
              </Disclosure>
            </div>
          </Card>

          <Card title={t("subowners.shareholders")}>
            {shares.rows.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("subowners.holder")}</th>
                    <th className="ctr">{t("subowners.share")}</th>
                    <th className="ctr">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shares.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.holder}
                        {row.notes ? (
                          <div className="text-xs text-brand-graphite/60">{row.notes}</div>
                        ) : null}
                      </td>
                      <td className="ctr">
                        {row.sharePercent ? formatPercent(Number(row.sharePercent), locale) : ""}
                      </td>
                      <td className="ctr">
                        <form action={removeShareholder.bind(null, row.id, id)}>
                          <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                            {t("subowners.remove")}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {shares.unaccounted > 0 ? (
                  <tfoot>
                    <tr>
                      <td className="text-xs text-brand-graphite/60">
                        {t("subowners.unaccounted")}
                      </td>
                      <td className="ctr font-semibold">
                        {formatPercent(shares.unaccounted, locale)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            )}

            <div className="mt-3">
              <Disclosure showLabel={t("subowners.addShareholder")} hideLabel={t("common.cancel")}>
                <form
                  action={addShareholder.bind(null, id)}
                  className="grid gap-2 rounded border border-brand-line bg-brand-surface p-3"
                >
                  <div>
                    <label className="label" htmlFor="holder">
                      {t("subowners.holder")}
                    </label>
                    <input
                      id="holder"
                      name="holder"
                      required
                      placeholder={t("subowners.holderPlaceholder")}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="holderShare">
                      {t("subowners.share")}
                    </label>
                    <input
                      id="holderShare"
                      name="sharePercent"
                      inputMode="decimal"
                      className="input !w-28"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    {t("common.add")}
                  </button>
                </form>
              </Disclosure>
            </div>
            <p className="mt-2 text-xs text-brand-graphite/60">{t("subowners.sharesHint")}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
