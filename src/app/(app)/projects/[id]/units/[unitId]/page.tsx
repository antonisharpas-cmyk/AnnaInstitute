import { optionsFor, shownCode } from "@/lib/choices";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { documentsForUnit } from "@/lib/documents";
import { whoHasThisApartment } from "@/lib/contracts";
import { categoryLabel, isImage, titleWithExtension } from "@/lib/fileLabels";
import { BackLink, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { LightboxGrid } from "@/components/Lightbox";
import UploadForm from "@/components/UploadForm";
import DeleteRecord from "@/components/DeleteRecord";
import UnitForm from "../../../UnitForm";
import { whatGoesWithUnit } from "@/lib/deletes";
import {
  deleteUnit,
  deleteUnitDocument,
  letTheMoneyDecide,
  updateUnit,
  uploadUnitFiles,
} from "../../../actions";

/** The order the groups appear in, so floor plans are always at the top. */
const GROUP_ORDER = ["FLOOR_PLAN", "PROGRESS_PHOTO", "OTHER"];

export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id, unitId } = await params;
  const { locale, t } = await getTranslator();

  const found = await db
    .select({ unit: units, project: projects })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(and(eq(units.id, unitId), eq(units.projectId, id)))
    .limit(1);

  const row = found[0];
  if (!row) notFound();

  const goes = await whatGoesWithUnit(unitId);

  const [sold, files, holder] = await Promise.all([
    /* Who has it, on what terms, and where the money stands. */
    whoHasThisApartment(unitId),
    documentsForUnit(unitId),
    /* Assigned to somebody without a contract yet: still worth naming. */
    row.unit.clientId
      ? db.select().from(clients).where(eq(clients.id, row.unit.clientId)).limit(1)
      : Promise.resolve([]),
  ]);

  // Grouped under a heading per category, in a fixed order.
  const groups = GROUP_ORDER.map((category) => ({
    category,
    items: files.filter((f) => f.category === category),
  }))
    .concat(
      files
        .filter((f) => !GROUP_ORDER.includes(f.category))
        .map((f) => ({ category: f.category, items: [f] })),
    )
    .filter((group) => group.items.length > 0);

  return (
    <>
      <BackLink href={`/projects/${id}`} label={t("projects.backToProject")} />
      <PageHeader
        title={`${t("units.edit")} ${row.unit.code}`}
        subtitle={row.project.name}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Pill>{t(`units.status.${shownCode(row.unit.status, row.unit.statusChoice)}` as MessageKey)}</Pill>
            {row.unit.statusByHandAt ? (
              <form action={letTheMoneyDecide.bind(null, unitId, id)}>
                <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                  {t("units.letMoneyDecide")}
                </button>
              </form>
            ) : null}
          </div>
        }
      />

      {row.unit.statusByHandAt ? (
        <p className="mb-3 text-xs text-brand-graphite/65">{t("units.statusByHand")}</p>
      ) : (
        <p className="mb-3 text-xs text-brand-graphite/65">{t("units.statusFromMoney")}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("units.details")}>
            <UnitForm
              action={updateUnit.bind(null, unitId)}
              unit={row.unit}
              cancelHref={`/projects/${id}`}
              t={t}
              statuses={await optionsFor("unitStatus", t, { current: shownCode(row.unit.status, row.unit.statusChoice) })}
            />
          </Card>

          {/*
            Who has it.

            Coming at this from the building, which is how the office works,
            the question is never "is there a contract" but "who bought it and
            where do they stand". So the buyer is named first and linked, the
            contract and its terms are read off here, and the money is summed
            up, all without leaving the apartment.
          */}
          <Card title={t("units.whoHasIt")}>
            {sold.length === 0 ? (
              holder[0] ? (
                <p className="text-sm">
                  <Link
                    href={`/clients/${holder[0].id}`}
                    className="font-semibold text-brand-teal-dark hover:underline"
                    prefetch={false}
                  >
                    {holder[0].firstName} {holder[0].lastName}
                  </Link>
                  <span className="ml-2 text-xs text-brand-graphite/60">
                    {t("units.heldNoContract")}
                  </span>
                </p>
              ) : (
                <Empty message={t("units.nobodyYet")} />
              )
            ) : (
              <ul className="divide-y divide-brand-line">
                {sold.map((s) => (
                  <li key={s.contract.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* The buyer, first, because that is the question. */}
                        {s.client ? (
                          <Link
                            href={`/clients/${s.client.id}`}
                            className="text-base font-semibold text-brand-teal-dark hover:underline"
                            prefetch={false}
                          >
                            {s.client.firstName} {s.client.lastName}
                          </Link>
                        ) : (
                          <span className="text-sm text-brand-graphite/50">
                            {t("units.nobodyOnTheContract")}
                          </span>
                        )}
                        <div className="mt-0.5 text-xs text-brand-graphite/70">
                          {[s.client?.phone, s.client?.email].filter(Boolean).join(" . ")}
                        </div>
                        <div className="mt-1 text-xs">
                          <Link
                            href={`/contracts/${s.contract.id}`}
                            className="font-semibold hover:underline"
                            prefetch={false}
                          >
                            {s.contract.reference}
                          </Link>
                          {s.contract.contractDate ? (
                            <span className="text-brand-graphite/60">
                              {" . "}
                              {new Date(s.contract.contractDate).toLocaleDateString(
                                locale === "el" ? "el-GR" : "en-GB",
                              )}
                            </span>
                          ) : null}
                          {s.agent ? (
                            <span className="text-brand-graphite/60">
                              {" . "}
                              {t("contracts.agent").toLowerCase()} {s.agent.name}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {s.contract.kind === "LAND_EXCHANGE" ? (
                          <Pill tone="teal">{t("contracts.kind.LAND_EXCHANGE")}</Pill>
                        ) : null}
                        {s.paidInFull ? <Pill tone="good">{t("contracts.paidInFull")}</Pill> : null}
                        <Pill
                          tone={
                            s.contract.status === "COMPLETED"
                              ? "good"
                              : s.contract.status === "CANCELLED"
                                ? "bad"
                                : s.contract.status === "ACTIVE"
                                  ? "warn"
                                  : "neutral"
                          }
                        >
                          {t(`contracts.status.${shownCode(s.contract.status, s.contract.statusChoice)}` as MessageKey)}
                        </Pill>
                      </div>
                    </div>

                    {/* The terms and the money, read off the contract. */}
                    <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="label">{t("contracts.netPrice")}</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatAmount(toCents(s.contract.netPrice), locale)}
                        </dd>
                      </div>
                      <div>
                        <dt className="label">{t("contracts.vat")}</dt>
                        <dd className="font-semibold tabular-nums">
                          {Number(s.contract.vatRate)}%
                        </dd>
                      </div>
                      {s.contract.cashAmount ? (
                        <div>
                          <dt className="label">{t("contracts.cash")}</dt>
                          <dd className="font-semibold tabular-nums">
                            {formatAmount(toCents(s.contract.cashAmount), locale)}
                          </dd>
                        </div>
                      ) : null}
                      {s.contract.cashAmount ? (
                        <div>
                          <dt className="label">{t("contracts.priceWithCash")}</dt>
                          <dd className="font-semibold tabular-nums" data-price-with-cash>
                            {formatAmount(toCents(s.contract.netPrice) + toCents(s.contract.cashAmount), locale)}
                          </dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="label">{t("contracts.paid")}</dt>
                        <dd className="font-semibold tabular-nums">
                          {formatAmount(s.paidCents, locale)}
                          <span className="text-xs font-normal text-brand-graphite/60">
                            {" "}
                            {t("common.of").toLowerCase()} {formatAmount(s.dueCents, locale)}
                          </span>
                        </dd>
                      </div>
                      {s.paidInFull ? null : (
                        <div>
                          <dt className="label">{t("dash.outstanding")}</dt>
                          <dd className="font-semibold tabular-nums">
                            {formatAmount(s.outstandingCents, locale)}
                          </dd>
                        </div>
                      )}
                    </dl>

                    <div className="mt-2">
                      <Link
                        href={`/contracts/${s.contract.id}`}
                        className="btn btn-secondary !px-3 !py-1 !text-xs"
                        prefetch={false}
                      >
                        {t("contracts.openTheContract")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {sold.length > 0 ? (
              <p className="mt-3 text-xs text-brand-graphite/60">{t("units.priceHereHint")}</p>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t("units.files")}>
            {groups.length === 0 ? <Empty message={t("common.none")} /> : null}

            {groups.map((group) => (
              <section key={group.category} className="mb-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-graphite">
                  {categoryLabel(group.category)}
                </h3>

                <LightboxGrid
                  items={group.items.map((doc) => ({
                    id: doc.id,
                    label: titleWithExtension(doc),
                    isImage: isImage(doc.mimeType),
                  }))}
                />

                <ul className="mt-2 space-y-1 text-sm">
                  {group.items.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-2">
                      <a
                        href={`/api/files/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 truncate text-brand-teal-dark hover:underline"
                      >
                        {titleWithExtension(doc)}
                      </a>
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <a
                          href={`/api/files/${doc.id}?download=1`}
                          className="btn btn-secondary !px-2 !py-1 !text-xs"
                        >
                          {t("common.download")}
                        </a>
                        <form action={deleteUnitDocument.bind(null, doc.id, unitId, id)}>
                          <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                            {t("common.delete")}
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <div className="border-t border-brand-line pt-4">
              <UploadForm
                action={uploadUnitFiles.bind(null, unitId)}
                categories={["FLOOR_PLAN", "PROGRESS_PHOTO", "OTHER"]}
                defaultCategory="FLOOR_PLAN"
                titlePlaceholder={`Floor Plan ${row.unit.code}`}
                submitLabel={t("common.add")}
                hint="Anything filed as a Floor Plan shows in the units table for this apartment."
              />
            </div>
          </Card>

          <DeleteRecord
            action={deleteUnit.bind(null, unitId, id)}
            label={t("remove.unit")}
            what={t("remove.unitWhat")}
            blocked={
              goes.contracts.length > 0
                ? `${t("remove.blockedByContracts")} ${goes.contracts.join(", ")}`
                : null
            }
            confirm={t("remove.confirm")}
          />
        </div>
      </div>
    </>
  );
}
