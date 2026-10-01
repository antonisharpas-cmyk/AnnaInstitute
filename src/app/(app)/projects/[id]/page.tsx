import { shownCode } from "@/lib/choices";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, units } from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { documentsForProjectWithUnits, floorPlansByUnit } from "@/lib/documents";
import { categoryLabel, fileLabel, isImage } from "@/lib/fileLabels";
import { partnersOfProject, subownerChoices } from "@/lib/subowners";
import { holdings, shareOf } from "@/lib/ownership";
import { projectChecklist } from "@/lib/projectHealth";
import { whatGoesWithProject } from "@/lib/deletes";
import { buyersByUnit } from "@/lib/contracts";
import { BackLink, Card, Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { LightboxGrid, LightboxLink } from "@/components/Lightbox";
import UploadForm from "@/components/UploadForm";
import DeleteRecord from "@/components/DeleteRecord";
import { PROJECT_FILE_CATEGORIES } from "@/lib/projectFiles";
import Disclosure from "@/components/Disclosure";
import Pagination, { paginate } from "@/components/Pagination";
import {
  deleteProject,
  deleteProjectDocument,
  markProjectChecked,
  uploadProjectDocuments,
} from "../actions";
import { addPartner, removePartner } from "../../subowners/actions";
import { letTheApartmentsDecide } from "../actions";

const PER_PAGE = 25;

const statusTone = (status: string) =>
  status === "AVAILABLE" ? "good" : status === "RESERVED" ? "warn" : "neutral";

const area = (value: string | null) => (value ? `${Number(value)} m2` : "");

/**
 * The development's files, under the four headings the office uses.
 *
 * The four come first and always in the same order, so somebody looking for the
 * brochure looks in the same place every time. Anything filed against an
 * apartment, a floor plan for instance, is gathered after them: it is that
 * apartment's paper rather than the building's, and burying it among the
 * pictures is how it gets lost. An empty heading is left out rather than shown
 * empty, since a heading with nothing under it only makes the card longer.
 */
type FileRow = {
  document: { id: string; category: string; title: string };
  unitCode: string | null;
};

/**
 * Pictures read in the order they were numbered.
 *
 * Thirteen pictures called 1 to 13 are meant to be looked at in that order, and
 * plain alphabetical puts 10 second. Numbers inside a title are compared as
 * numbers so they do not have to be typed as 01.
 */
const inOrder = (a: FileRow, b: FileRow) =>
  a.document.title.localeCompare(b.document.title, undefined, {
    numeric: true,
    sensitivity: "base",
  });

function groupProjectFiles<T extends FileRow>(rows: T[]) {
  const groups: { key: string; category: string; rows: T[] }[] = [];

  for (const category of PROJECT_FILE_CATEGORIES) {
    const mine = rows
      .filter((row) => row.document.category === category && !row.unitCode)
      .sort(inOrder);
    if (mine.length > 0) groups.push({ key: category, category, rows: mine });
  }

  const rest = rows.filter(
    (row) =>
      row.unitCode ||
      !(PROJECT_FILE_CATEGORIES as readonly string[]).includes(row.document.category),
  );
  if (rest.length > 0) groups.push({ key: "rest", category: "APARTMENTS", rows: rest });

  return groups;
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { locale, t } = await getTranslator();
  const { page, perPage, offset } = paginate(query, PER_PAGE);

  const found = await db
    .select({ project: projects })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  const project = found[0]?.project;
  if (!project) notFound();

  const goes = await whatGoesWithProject(id);

  const [rows, [totals], allFiles, plansByUnit, partners, choices, check] = await Promise.all([
    db
      .select()
      .from(units)
      .where(eq(units.projectId, id))
      .orderBy(asc(units.code))
      .limit(perPage)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
        available: sql<number>`count(*) filter (where ${units.status} = 'AVAILABLE')::int`,
        reserved: sql<number>`count(*) filter (where ${units.status} = 'RESERVED')::int`,
        sold: sql<number>`count(*) filter (where ${units.status} in ('SOLD','DELIVERED'))::int`,
        totalValue: sql<string>`coalesce(sum(${units.netPrice}), 0)`,
        soldValue: sql<string>`coalesce(sum(${units.netPrice}) filter (where ${units.status} in ('SOLD','DELIVERED')), 0)`,
      })
      .from(units)
      .where(eq(units.projectId, id)),
    documentsForProjectWithUnits(id),
    floorPlansByUnit(id),
    partnersOfProject(id),
    subownerChoices(),
    projectChecklist(id),
  ]);

  /* One Eleven's share: its part of the company that holds the development, or all of it when none does. */
  const holding = (await holdings()).find((one) => one.projectId === id);
  const ours = holding ? shareOf(holding, { kind: "oneEleven" }) : null;

  /* Who has each of the apartments on this page, so the list can say it. */
  const buyers = await buyersByUnit(rows.map((u) => u.id));

  return (
    <>
      <BackLink
        href="/projects"
        label={`${t("common.backTo")} ${t("projects.title").toLowerCase()}`}
      />
      <PageHeader
        title={project.name}
        subtitle={[partners.map((row) => row.subowner.name).join(", ") || null, project.location, project.completionBy]
          .filter(Boolean)
          .join(" . ")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${id}/edit`} className="btn btn-secondary">
              {t("projects.edit")}
            </Link>
            <Link
              href={`/projects/${id}/units/new`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              {t("units.new")}
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("dash.units")}
          value={String(totals?.count ?? 0)}
          hint={`${totals?.sold ?? 0} ${t("dash.sold").toLowerCase()}, ${
            totals?.available ?? 0
          } ${t("dash.available").toLowerCase()}${
            (totals?.reserved ?? 0) > 0 ? `, ${totals?.reserved} reserved` : ""
          }`}
        />
        <Stat
          label={t("projects.totalAmount")}
          value={formatAmount(toCents(totals?.totalValue ?? "0"), locale)}
        />
        <Stat
          label={t("projects.soldAmount")}
          value={formatAmount(toCents(totals?.soldValue ?? "0"), locale)}
        />
        <Stat
          label={t("common.status")}
          value={t(`projects.status.${shownCode(project.status, project.statusChoice)}` as MessageKey)}
          hint={project.statusByHandAt ? t("projects.statusByHand") : t("projects.statusFromUnits")}
        />
      </div>

      {project.statusByHandAt ? (
        <form action={letTheApartmentsDecide.bind(null, id)} className="mb-3">
          <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
            {t("projects.letApartmentsDecide")}
          </button>
        </form>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card
          title={t("subowners.partners")}
          action={
            <Link
              href={`/campaigns/new?audience=SUBOWNERS&project=${id}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary !px-3 !py-1 !text-xs"
            >
              {t("campaigns.announce")}
            </Link>
          }
        >
          {partners.length === 0 ? (
            <Empty message={t("subowners.oursAlone")} />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("subowners.role")}</th>
                  <th className="ctr">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((row) => (
                  <tr key={row.partner.id}>
                    <td>
                      <Link
                        href={`/subowners/${row.subowner.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold hover:underline"
                      >
                        {row.subowner.name}
                      </Link>
                      {row.subowner.company ? (
                        <div className="text-xs text-brand-graphite/60">{row.subowner.company}</div>
                      ) : null}
                    </td>
                    <td className="text-xs">
                      {row.partner.role ?? ""}
                      {row.partner.notes ? (
                        <div className="text-brand-graphite/60">{row.partner.notes}</div>
                      ) : null}
                    </td>
                    <td className="ctr">
                      <form action={removePartner.bind(null, row.partner.id, id)}>
                        <button type="submit" className="btn btn-secondary !px-2 !py-1 !text-xs">
                          {t("subowners.remove")}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {ours ? (
            <div className="mt-3 rounded border border-brand-line bg-brand-surface p-3" data-one-eleven-share>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{t("subowners.oneElevenShare")}</span>
                <span className="text-lg font-semibold text-brand-teal-dark">
                  {formatPercent(Math.round(ours.share * 100000) / 1000, locale)}
                </span>
              </div>
              <ul className="mt-1 text-xs text-brand-graphite/70">
                {ours.lines.map((line) => (
                  <li key={line.via ?? "direct"}>
                    {line.via
                      ? `${formatPercent(Math.round(line.share * 100000) / 1000, locale)} ${t("subowners.throughCompany")} ${line.via}`
                      : `${formatPercent(Math.round(line.share * 100000) / 1000, locale)} ${t("subowners.directly")}`}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-brand-graphite/60">{t("subowners.oneElevenHow")}</p>
            </div>
          ) : null}

          <div className="mt-3">
            <Disclosure showLabel={t("subowners.addPartner")} hideLabel={t("common.cancel")}>
              {choices.length === 0 ? (
                <p className="text-sm text-brand-graphite/60">
                  <Link href="/subowners/new" className="hover:underline">
                    {t("subowners.new")}
                  </Link>
                </p>
              ) : (
                <form
                  action={addPartner.bind(null, id)}
                  className="flex flex-wrap items-end gap-2 rounded border border-brand-line bg-brand-surface p-3"
                >
                  <div className="min-w-56 flex-1">
                    <label className="label" htmlFor="subownerId">
                      {t("subowners.title")}
                    </label>
                    <Link
                      href="/subowners/new"
                      target="_blank"
                      rel="noreferrer"
                      className="float-right text-xs text-brand-teal-dark hover:underline"
                    >
                      {t("subowners.new")}
                    </Link>
                    <select id="subownerId" name="subownerId" required className="select">
                      {choices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.name}
                          {choice.company ? ` . ${choice.company}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="role">
                      {t("subowners.role")}
                    </label>
                    <input
                      id="role"
                      name="role"
                      placeholder={t("subowners.rolePlaceholder")}
                      className="input !w-48"
                    />
                  </div>
                  <div className="min-w-56 flex-1">
                    <label className="label" htmlFor="agreement">
                      {t("subowners.agreement")}
                    </label>
                    <input
                      id="agreement"
                      name="agreement"
                      placeholder={t("subowners.agreementPlaceholder")}
                      className="input"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    {t("common.add")}
                  </button>
                </form>
              )}
            </Disclosure>
          </div>
        </Card>

        <Card
          title={t("projects.record")}
          action={
            <form action={markProjectChecked.bind(null, id)}>
              <button type="submit" className="btn btn-secondary !px-3 !py-1 !text-xs">
                {t("projects.markChecked")}
              </button>
            </form>
          }
        >
          <p className="mb-3 text-xs text-brand-graphite/60">
            {check.done} {t("common.of")} {check.total} {t("projects.recordDone")}
            {check.checkedAt
              ? ` . ${t("projects.lastChecked")} ${new Date(check.checkedAt)
                  .toISOString()
                  .slice(0, 10)}${check.checkedBy ? `, ${check.checkedBy}` : ""}`
              : ` . ${t("projects.neverChecked")}`}
          </p>
          <ul className="divide-y divide-brand-line text-sm">
            {check.items.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 py-1.5">
                <span className={item.done ? "text-brand-graphite/60" : "font-medium"}>
                  {t(`projects.check.${item.key}` as MessageKey)}
                </span>
                <Pill tone={item.done ? "good" : item.important ? "warn" : "neutral"}>
                  {item.done ? t("projects.checkDone") : t("projects.checkMissing")}
                </Pill>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mb-4">
        <Card title={t("units.title")}>
          {rows.length === 0 ? (
            <Empty message={t("common.none")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("units.code")}</th>
                    <th className="ctr">{t("units.floor")}</th>
                    <th className="ctr">{t("units.bedrooms")}</th>
                    <th className="ctr">{t("units.covered")}</th>
                    <th className="ctr">{t("units.veranda")}</th>
                    <th className="ctr">{t("units.roofGarden")}</th>
                    <th className="ctr">{t("units.price")}</th>
                    <th className="ctr">{t("common.status")}</th>
                    <th>{t("units.buyer")}</th>
                    <th className="ctr">{t("units.floorPlan")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const plans = plansByUnit.get(u.id) ?? [];
                    return (
                      <tr key={u.id}>
                        <td className="font-semibold">{u.code}</td>
                        <td className="ctr">{u.floor ?? ""}</td>
                        <td className="ctr">{u.bedrooms ?? ""}</td>
                        <td className="ctr">{area(u.coveredArea)}</td>
                        <td className="ctr">{area(u.verandaArea)}</td>
                        <td className="ctr">{area(u.roofGardenArea)}</td>
                        <td className="ctr font-semibold">
                          {/*
                            One price, and only one.

                            The apartment's price is what the office is asking
                            for it. How that price is made up, what part is
                            before VAT, what rate applies to this buyer and what
                            part is paid in cash, is a term of the contract
                            rather than a property of the apartment, so it lives
                            there and this stays a single figure.
                          */}
                          {formatAmount(toCents(u.netPrice), locale)}
                        </td>
                        <td className="ctr">
                          <Pill tone={statusTone(u.status) as "good" | "warn" | "neutral"}>
                            {t(`units.status.${shownCode(u.status, u.statusChoice)}` as MessageKey)}
                          </Pill>
                          {u.statusByHandAt ? (
                            /*
                              Whose word this status is on.
                              
                              A status the money proved and a status somebody
                              typed look identical otherwise, and they are not
                              the same thing: the second one stays put when a
                              payment arrives. Saying so here is what stops the
                              office wondering why a paid apartment still reads
                              as reserved.
                            */
                            <div className="mt-0.5 text-xs text-brand-graphite/60">
                              {t("units.byHandShort")}
                            </div>
                          ) : null}
                        </td>
                        {/*
                          Who has it, in the list itself.

                          An apartment reading sold and naming nobody made the
                          office open every one to find the buyer. The name
                          links to their card and the contract number under it
                          links to the contract.
                        */}
                        <td className="text-xs">
                          {buyers.get(u.id) ? (
                            <>
                              <Link
                                href={`/clients/${buyers.get(u.id)!.clientId}`}
                                className="font-semibold text-brand-teal-dark hover:underline"
                                prefetch={false}
                              >
                                {buyers.get(u.id)!.name}
                              </Link>
                              {buyers.get(u.id)!.contractId ? (
                                <div>
                                  <Link
                                    href={`/contracts/${buyers.get(u.id)!.contractId}`}
                                    className="text-brand-graphite/60 hover:underline"
                                    prefetch={false}
                                  >
                                    {buyers.get(u.id)!.reference}
                                  </Link>
                                </div>
                              ) : (
                                <div className="text-brand-graphite/55">
                                  {t("units.noContractYet")}
                                </div>
                              )}
                            </>
                          ) : null}
                        </td>
                        <td className="ctr">
                          <LightboxLink
                            items={plans.map((doc) => ({
                              id: doc.id,
                              label: fileLabel(doc, u.code),
                              isImage: isImage(doc.mimeType),
                            }))}
                          />
                        </td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Link
                              href={`/projects/${id}/units/${u.id}`}
                              className="btn btn-secondary !px-3 !py-1 !text-xs"
                            >
                              {t("common.edit")}
                            </Link>
                            <Link
                              href={`/campaigns/new?template=new_property&unit=${u.id}`}
                              target="_blank"
                              rel="noreferrer"
                              title={t("campaigns.announceNote")}
                              className="btn btn-secondary !px-3 !py-1 !text-xs"
                            >
                              {t("campaigns.announce")}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            basePath={`/projects/${id}`}
            params={query}
            info={{ page, perPage, total: totals?.count ?? 0 }}
            labels={{
              previous: t("common.previous"),
              next: t("common.next"),
              showing: t("common.showing"),
              of: t("common.of"),
            }}
          />

          <div className="mt-4 border-t border-brand-line pt-4">
            <Link href={`/projects/${id}/units/new`} className="btn btn-primary">
              {t("units.addRow")}
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("projects.files")}>
            {allFiles.length === 0 ? (
              <Empty message={t("common.none")} />
            ) : (
              <div className="space-y-6">
                {groupProjectFiles(allFiles).map((group) => (
                  <section key={group.key}>
                    <h3 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-brand-graphite/70">
                      {group.category === "APARTMENTS"
                        ? t("projects.apartmentFiles")
                        : categoryLabel(group.category)}
                      <span className="text-brand-graphite/40">{group.rows.length}</span>
                    </h3>

                    <LightboxGrid
                      items={group.rows.map((row) => ({
                        id: row.document.id,
                        label: fileLabel(row.document, row.unitCode),
                        isImage: isImage(row.document.mimeType),
                      }))}
                    />

                    <ul className="mt-3 divide-y divide-brand-line text-sm">
                      {group.rows.map((row) => (
                        <li
                          key={row.document.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2"
                        >
                          <div className="min-w-0">
                            <a
                              href={`/api/files/${row.document.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-brand-teal-dark hover:underline"
                            >
                              {fileLabel(row.document, row.unitCode)}
                            </a>
                            <div className="text-xs text-brand-graphite/60">
                              {new Date(row.document.createdAt).toLocaleDateString(
                                locale === "el" ? "el-GR" : "en-GB",
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {group.category === "APARTMENTS" ? (
                              <Pill>{categoryLabel(row.document.category)}</Pill>
                            ) : null}
                            <a
                              href={`/api/files/${row.document.id}?download=1`}
                              className="btn btn-secondary !px-2 !py-1 !text-xs"
                            >
                              {t("common.download")}
                            </a>
                            {row.document.unitId ? (
                              <Link
                                href={`/projects/${id}/units/${row.document.unitId}`}
                                className="btn btn-secondary !px-2 !py-1 !text-xs"
                              >
                                {t("common.edit")}
                              </Link>
                            ) : (
                              <form action={deleteProjectDocument.bind(null, row.document.id, id)}>
                                <button
                                  type="submit"
                                  className="btn btn-secondary !px-2 !py-1 !text-xs"
                                >
                                  {t("common.delete")}
                                </button>
                              </form>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-brand-line pt-4">
              <UploadForm
                action={uploadProjectDocuments.bind(null, id)}
                categories={PROJECT_FILE_CATEGORIES}
                defaultCategory="PICTURES"
                titlePlaceholder="Exterior and interior"
                submitLabel={t("common.add")}
                hint="A file added here belongs to the whole development. Files added on an apartment show at the end, under the apartment they belong to."
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title={t("projects.details")}>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="label">{t("projects.location")}</dt>
                <dd>
                  {project.location ?? ""}
                  {project.mapsUrl ? (
                    <a
                      href={project.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-xs text-brand-teal-dark hover:underline"
                      data-maps-link
                    >
                      {t("projects.onTheMap")}
                    </a>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="label">{t("projects.completion")}</dt>
                <dd>{project.completionBy ?? ""}</dd>
              </div>
              {project.description ? (
                <div>
                  <dt className="label">{t("projects.description")}</dt>
                  <dd>{project.description}</dd>
                </div>
              ) : null}
            </dl>
            <Link href={`/projects/${id}/edit`} className="btn btn-secondary mt-3 w-full">
              {t("projects.edit")}
            </Link>
          </Card>

          <DeleteRecord
            action={deleteProject.bind(null, id)}
            label={t("remove.project")}
            what={t("remove.projectWhat")}
            blocked={
              goes.contracts.length > 0
                ? `${t("remove.blockedByContracts")} ${goes.contracts.slice(0, 5).join(", ")}`
                : null
            }
            confirm={t("remove.confirm")}
          />
        </div>
      </div>
    </>
  );
}
