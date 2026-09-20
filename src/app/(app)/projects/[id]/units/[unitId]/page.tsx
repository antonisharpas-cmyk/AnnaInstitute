import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contracts, projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, toCents } from "@/lib/money";
import { documentsForUnit } from "@/lib/documents";
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

  const [sold, files] = await Promise.all([
    db.select({ contract: contracts }).from(contracts).where(eq(contracts.unitId, unitId)),
    documentsForUnit(unitId),
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
            <Pill>{t(`units.status.${row.unit.status}` as MessageKey)}</Pill>
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
            />
          </Card>

          {sold.length > 0 ? (
            <Card title={t("contracts.title")}>
              <ul className="space-y-1 text-sm">
                {sold.map((s) => (
                  <li key={s.contract.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/contracts/${s.contract.id}`}
                      className="font-semibold text-brand-teal-dark hover:underline"
                    >
                      {s.contract.reference}
                    </Link>
                    <span className="tabular-nums">
                      {formatAmount(toCents(s.contract.netPrice), locale)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-brand-graphite/60">
                This apartment is on a contract. Changing its price here does not change the
                contract, which carries its own agreed price and payment schedule.
              </p>
            </Card>
          ) : null}
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
