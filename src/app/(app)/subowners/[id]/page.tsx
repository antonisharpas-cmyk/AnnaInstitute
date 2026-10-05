import { shownCode } from "@/lib/choices";
import LogoUpload from "./LogoUpload";
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
import { birthdayText } from "@/lib/buyers";
import DateField from "@/components/DateField";
import DeleteRecord from "@/components/DeleteRecord";
import {
  addDirector,
  addShareholder,
  deleteSubowner,
  removeDirector,
  updateDirector,
  removeShareholder,
  updateShareholder,
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

      {/* One column, in the office's order: what they hold, the company, its
          directors and contacts, and who owns it. */}
      <div className="space-y-4" data-company-sections>
        <div>
          <Card title={t("subowners.theirProjects")}>
            {held.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t("projects.title")}</th>
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
                            {t(`projects.status.${shownCode(row.project.status, row.project.statusChoice)}` as MessageKey)}
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
              { name: "tic", label: t("subowners.tic"), value: subowner.tic ?? "" },
              { name: "mobile", label: t("subowners.mobile"), value: subowner.mobile ?? "" },
              { name: "fax", label: t("subowners.fax"), value: subowner.fax ?? "" },
              { name: "website", label: t("subowners.website"), value: subowner.website ?? "" },
              { name: "bankName", label: t("subowners.bankName"), value: subowner.bankName ?? "" },
              {
                name: "bankBeneficiary",
                label: t("subowners.bankBeneficiary"),
                value: subowner.bankBeneficiary ?? "",
                placeholder: subowner.company || subowner.name,
              },
              { name: "bankAccount", label: t("subowners.bankAccount"), value: subowner.bankAccount ?? "" },
              { name: "iban", label: t("subowners.iban"), value: subowner.iban ?? "" },
              { name: "bic", label: t("subowners.bic"), value: subowner.bic ?? "" },
              {
                name: "brandColor",
                label: t("subowners.brandColor"),
                value: subowner.brandColor ?? "",
                placeholder: "#3D8397",
                hint: t("subowners.brandColorHint"),
              },
              {
                name: "nextInvoice",
                label: t("subowners.nextInvoice"),
                kind: "number",
                value: subowner.nextInvoice ? String(subowner.nextInvoice) : "",
                placeholder: "1",
              },
              {
                name: "nextReceipt",
                label: t("subowners.nextReceipt"),
                kind: "number",
                value: subowner.nextReceipt ? String(subowner.nextReceipt) : "",
                placeholder: "1",
              },
              {
                name: "nextCreditNote",
                label: t("subowners.nextCreditNote"),
                kind: "number",
                value: subowner.nextCreditNote ? String(subowner.nextCreditNote) : "",
                placeholder: "1",
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

          <Card title={t("subowners.papers")}>
            <div className="space-y-3 text-sm" data-company-papers>
              <p className="text-xs text-brand-graphite/70">{t("subowners.papersHint")}</p>
              <div className="flex flex-wrap items-start gap-4">
                <LogoUpload
                  issuer={id}
                  name={subowner.name}
                  current={
                    subowner.logoPath
                      ? `/api/companies/logo?issuer=${id}&v=${encodeURIComponent(subowner.logoPath)}`
                      : null
                  }
                  color={subowner.brandColor || "#3D8397"}
                  labels={{
                    choose: t("subowners.logo"),
                    uploading: t("subowners.logoUploading"),
                    hint: t("subowners.logoHint"),
                    saved: t("subowners.logoSaved"),
                    failed: t("subowners.logoFailed"),
                    none: t("subowners.noLogo"),
                    remove: t("subowners.removeLogo"),
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {(["invoice", "receipt", "credit"] as const).map((kind) => (
                    <a
                      key={kind}
                      href={`/api/companies/sample?issuer=${id}&kind=${kind}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary !text-xs"
                      data-sample={kind}
                    >
                      {t(`subowners.sample.${kind}` as MessageKey)}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </Card>

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
                    {person.birthDate ? (
                      <p className="text-xs" data-director-birthday>
                        {t("people.birthDate")}: {birthdayText(person.birthDate, locale)}
                      </p>
                    ) : null}
                    {person.notes ? (
                      <p className="mt-1 text-xs text-brand-graphite/60">{person.notes}</p>
                    ) : null}
                    <div className="mt-1">
                      <Disclosure showLabel={t("common.edit")} hideLabel={t("common.cancel")} tone="secondary">
                        <DirectorForm action={updateDirector.bind(null, person.id, id)} t={t} row={person} />
                      </Disclosure>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3">
              <Disclosure key={directors.length} showLabel={t("subowners.addDirector")} hideLabel={t("common.cancel")}>
                <DirectorForm action={addDirector.bind(null, id)} t={t} />
              </Disclosure>
            </div>
          </Card>

          <Card title={t("subowners.shareholders")}>
            <table className="data" data-shareholders>
              <thead>
                <tr>
                  <th>{t("subowners.holder")}</th>
                  <th className="ctr">{t("subowners.share")}</th>
                  <th className="ctr">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {shares.rows.map((row) => (
                  <tr key={row.id} data-holder={row.holder}>
                    <td>
                      <span className="font-semibold">{row.holder}</span>
                      {row.isOneEleven ? (
                        <span className="ml-2">
                          <Pill tone="teal">{t("subowners.alwaysOurs")}</Pill>
                        </span>
                      ) : null}
                      <div className="text-xs text-brand-graphite/60">
                        {[
                          row.holderKind ? t(`subowners.kind.${row.holderKind}` as MessageKey) : null,
                          row.idNumber,
                          row.email,
                          row.phone,
                          row.birthDate ? `${t("people.birthDate")} ${birthdayText(row.birthDate, locale)}` : null,
                          row.address,
                        ]
                          .filter(Boolean)
                          .join(" . ")}
                      </div>
                      {row.notes ? <div className="text-xs text-brand-graphite/60">{row.notes}</div> : null}
                    </td>
                    <td className="ctr font-semibold">
                      {row.sharePercent ? formatPercent(Number(row.sharePercent), locale) : ""}
                    </td>
                    <td className="ctr">
                      <div className="flex flex-wrap justify-center gap-1">
                        <Disclosure showLabel={t("common.edit")} hideLabel={t("common.cancel")} tone="secondary">
                          <HolderForm
                            action={updateShareholder.bind(null, row.id, id)}
                            t={t}
                            row={row}
                            fixedName={row.isOneEleven}
                          />
                        </Disclosure>
                        {row.isOneEleven ? null : (
                          <form action={removeShareholder.bind(null, row.id, id)}>
                            <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                              {t("subowners.remove")}
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {shares.unaccounted > 0 ? (
                <tfoot>
                  <tr>
                    <td className="text-xs text-brand-graphite/60">{t("subowners.unaccounted")}</td>
                    <td className="ctr font-semibold">{formatPercent(shares.unaccounted, locale)}</td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>

            <div className="mt-3">
              <Disclosure showLabel={t("subowners.addShareholder")} hideLabel={t("common.cancel")}>
                <HolderForm action={addShareholder.bind(null, id)} t={t} />
              </Disclosure>
            </div>
            <p className="mt-2 text-xs text-brand-graphite/60">{t("subowners.sharesHint")}</p>
          </Card>

          <DeleteRecord
            action={deleteSubowner.bind(null, id)}
            label={t("remove.partner")}
            what={t("remove.partnerWhat")}
            confirm={t("remove.confirm")}
          />
        </div>
      </div>
    </>
  );
}

/** A shareholder's boxes, to add one or to change one. */
function HolderForm({
  action,
  t,
  row,
  fixedName,
}: {
  action: (formData: FormData) => void | Promise<void>;
  t: (key: MessageKey) => string;
  row?: {
    holder: string;
    sharePercent: string | null;
    holderKind: string | null;
    idNumber: string | null;
    email: string | null;
    phone: string | null;
    birthDate?: string | null;
    address: string | null;
    notes: string | null;
  };
  fixedName?: boolean;
}) {
  return (
    <form action={action} className="grid gap-2 rounded border border-brand-line bg-brand-surface p-3 text-left sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">{t("subowners.holder")}</label>
        {fixedName ? (
          <div className="text-sm font-semibold">{row?.holder}</div>
        ) : (
          <input name="holder" required defaultValue={row?.holder ?? ""} placeholder={t("subowners.holderPlaceholder")} className="input" />
        )}
      </div>
      <div>
        <label className="label">{t("subowners.share")}</label>
        <input
          name="sharePercent"
          inputMode="decimal"
          defaultValue={row?.sharePercent ? String(Number(row.sharePercent)) : ""}
          placeholder="33.33"
          className="input"
        />
      </div>
      <div>
        <label className="label">{t("subowners.holderKind")}</label>
        <select name="holderKind" defaultValue={row?.holderKind ?? "PERSON"} className="select">
          <option value="PERSON">{t("subowners.kind.PERSON")}</option>
          <option value="COMPANY">{t("subowners.kind.COMPANY")}</option>
        </select>
      </div>
      <div>
        <label className="label">{t("subowners.idNumber")}</label>
        <input name="idNumber" defaultValue={row?.idNumber ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("common.email")}</label>
        <input name="email" type="email" defaultValue={row?.email ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("common.phone")}</label>
        <input name="phone" defaultValue={row?.phone ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("people.birthDate")}</label>
        <DateField name="birthDate" defaultValue={row?.birthDate ?? ""} />
      </div>
      <div>
        <label className="label">{t("common.address")}</label>
        <input name="address" defaultValue={row?.address ?? ""} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">{t("common.notes")}</label>
        <input name="notes" defaultValue={row?.notes ?? ""} className="input" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary">
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}

/** A director's boxes, to add one or to change one. */
function DirectorForm({
  action,
  t,
  row,
}: {
  action: (formData: FormData) => void | Promise<void>;
  t: (key: MessageKey) => string;
  row?: {
    name: string;
    role: string | null;
    email: string | null;
    emailAlternate: string | null;
    phone: string | null;
    birthDate: string | null;
  };
}) {
  return (
    <form action={action} className="grid gap-2 rounded border border-brand-line bg-brand-surface p-3" data-director-form>
      <div>
        <label className="label">{t("common.name")}</label>
        <input name="name" required defaultValue={row?.name ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("subowners.role")}</label>
        <input name="role" defaultValue={row?.role ?? ""} placeholder={t("subowners.directorPlaceholder")} className="input" />
      </div>
      <div>
        <label className="label">{t("leads.email")}</label>
        <input name="email" type="email" defaultValue={row?.email ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("subowners.secondEmail")}</label>
        <input name="emailAlternate" type="email" defaultValue={row?.emailAlternate ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("leads.phone")}</label>
        <input name="phone" defaultValue={row?.phone ?? ""} className="input" />
      </div>
      <div>
        <label className="label">{t("people.birthDate")}</label>
        <DateField name="birthDate" defaultValue={row?.birthDate ?? ""} />
      </div>
      <button type="submit" className="btn btn-primary">
        {row ? t("common.save") : t("common.add")}
      </button>
    </form>
  );
}
