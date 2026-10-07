import { isCustom } from "@/lib/choices";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  changeRequests,
  clients,
  contracts,
  installments,
  payments,
  refunds,
  projects,
  units,
} from "@/db/schema";
import { getTranslator, type MessageKey } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { formatAmount, formatPercent, toCents } from "@/lib/money";
import { partnersByProject } from "@/lib/subowners";
import Logo from "@/components/Logo";

/**
 * One page that says where a buyer stands.
 *
 * This is the thing the office is asked for on the telephone: what have I
 * bought, what did it cost, what have I paid, what is left and when is it due.
 * Today that means reading four screens and adding up; this prints it.
 *
 * It is a page rather than a generated file on purpose. A page can be printed
 * to paper or to PDF from any machine with no library involved, it can be sent
 * as a link to a colleague, and it is always the current truth rather than a
 * copy that was right last month. The furniture of the CRM is marked so it
 * disappears when it is printed: what comes out of the printer is the logo, the
 * buyer, the figures and the date it was produced.
 */
const day = (value: Date | null | undefined, locale: string) =>
  value ? new Date(value).toLocaleDateString(locale === "el" ? "el-GR" : "en-GB") : "";

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(["ADMIN"]);
  const { locale, t } = await getTranslator();

  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) notFound();

  const rows = await db
    .select({ contract: contracts, unit: units, project: projects, agent: agents })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .leftJoin(agents, eq(agents.id, contracts.agentId))
    .where(eq(contracts.clientId, id))
    .orderBy(asc(contracts.createdAt));

  const ids = rows.map((r) => r.contract.id);

  const [lines, paid, asked, held, paidBack] = await Promise.all([
    ids.length > 0
      ? db
          .select()
          .from(installments)
          .where(inArray(installments.contractId, ids))
          .orderBy(asc(installments.seq))
      : Promise.resolve([]),
    ids.length > 0
      ? db
          .select()
          .from(payments)
          .where(inArray(payments.contractId, ids))
          .orderBy(desc(payments.paidOn))
      : Promise.resolve([]),
    ids.length > 0
      ? db
          .select()
          .from(changeRequests)
          .where(inArray(changeRequests.contractId, ids))
          .orderBy(asc(changeRequests.requestedOn))
      : Promise.resolve([]),
    partnersByProject(),
    /* Money paid back by credit note, which the statement shows under the stages. */
    ids.length > 0
      ? db.select().from(refunds).where(inArray(refunds.contractId, ids)).orderBy(asc(refunds.paidOn))
      : Promise.resolve([]),
  ]);

  const paidPerInstallment = new Map<string, number>();
  for (const one of paid) {
    if (!one.installmentId) continue;
    paidPerInstallment.set(
      one.installmentId,
      (paidPerInstallment.get(one.installmentId) ?? 0) + toCents(one.amount),
    );
  }

  const backInAll = paidBack.reduce((sum, one) => sum + toCents(one.amount), 0);
  const owed = lines.reduce((sum, line) => sum + toCents(line.totalAmount), 0) - backInAll;
  const received = paid.reduce((sum, one) => sum + toCents(one.amount), 0) - backInAll;
  const outstanding = Math.max(0, owed - received);

  /** How a payment arrived, with older free text left exactly as it stands. */
  const howPaid = (value: string | null) => {
    if (!value) return "";
    const known = ["CASH", "BANK", "CHEQUE", "CARD", "OTHER"];
    return known.includes(value) || isCustom(value) ? t(`contracts.method.${value}` as MessageKey) : value;
  };

  const name = `${client.firstName} ${client.lastName}`.trim();

  return (
    <div className="statement">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/clients/${id}`} className="btn btn-secondary">
          {"←"} {t("common.backTo")} {name}
        </Link>
        <p className="text-xs text-brand-graphite/60">{t("clients.statementHint")}</p>
      </div>

      <header className="statehead">
        <div>
          <Logo width={150} />
          <p className="mt-1 text-xs text-brand-graphite/70">{t("app.subtitle")}</p>
        </div>
        <div className="text-right">
          <h1 className="text-lg font-semibold tracking-tight">{t("clients.statement")}</h1>
          <p className="text-xs text-brand-graphite/70">
            {t("clients.statementOn")} {day(new Date(), locale)}
          </p>
        </div>
      </header>

      <section className="stateblock">
        <h2 className="statetitle">{t("contracts.client")}</h2>
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          <p className="font-semibold">{name}</p>
          <p>{client.email ?? ""}</p>
          <p>{client.phone ?? ""}</p>
          <p>{[client.address, client.country].filter(Boolean).join(", ")}</p>
          {client.idNumber ? (
            <p>
              {t("clients.idNumber")}: {client.idNumber}
            </p>
          ) : null}
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="text-sm text-brand-graphite/60">{t("clients.noApartments")}</p>
      ) : (
        rows.map((row) => {
          const mine = lines.filter((line) => line.contractId === row.contract.id);
          const myRefunds = paidBack.filter((one) => one.contractId === row.contract.id);
          const mineBack = myRefunds.reduce((sum, one) => sum + toCents(one.amount), 0);
          /* A refund comes off what was paid; a delay penalty off the total as well. */
          const mineCredited = myRefunds.filter((one) => one.purpose === "PENALTY").reduce((sum, one) => sum + toCents(one.amount), 0);
          const mineOwed = mine.reduce((sum, line) => sum + toCents(line.totalAmount), 0) - mineCredited;
          const minePaid =
            paid.filter((one) => one.contractId === row.contract.id).reduce((sum, one) => sum + toCents(one.amount), 0) -
            mineBack;
          const partners = held.get(row.project.id) ?? [];

          return (
            <section className="stateblock" key={row.contract.id}>
              <h2 className="statetitle">
                {row.project.name} {row.unit.code}
              </h2>

              <div className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
                <p>
                  {t("contracts.reference")}: <strong>{row.contract.reference}</strong>
                </p>
                <p>
                  {t("contracts.contractDate")}: {day(row.contract.contractDate, locale) || ""}
                </p>
                <p>
                  {t("contracts.netPrice")}: {formatAmount(toCents(row.contract.netPrice), locale)}
                </p>
                <p>
                  {t("contracts.vat")}: {formatPercent(Number(row.contract.vatRate), locale)}
                </p>
                <p>
                  {t("clients.partner")}:{" "}
                  {partners.length === 0
                    ? t("clients.oursOnly")
                    : partners.map((one) => one.name).join(", ")}
                </p>
                {row.agent ? (
                  <p>
                    {t("contracts.agent")}: {row.agent.name}
                  </p>
                ) : null}
              </div>

              <table className="data">
                <thead>
                  <tr>
                    <th className="ctr">#</th>
                    <th>{t("contracts.stage")}</th>
                    <th className="ctr">{t("clients.period")}</th>
                    <th className="ctr">{t("common.total")}</th>
                    <th className="ctr">{t("clients.paid")}</th>
                    <th className="ctr">{t("dash.outstanding")}</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((line) => {
                    const total = toCents(line.totalAmount);
                    const against = paidPerInstallment.get(line.id) ?? 0;
                    return (
                      <tr key={line.id}>
                        <td className="ctr">{line.seq}</td>
                        <td>{locale === "el" ? line.labelEl || line.label : line.label}</td>
                        <td className="ctr">{day(line.dueDate, locale)}</td>
                        <td className="ctr">{formatAmount(total, locale)}</td>
                        <td className="ctr">{against > 0 ? formatAmount(against, locale) : ""}</td>
                        <td className="ctr">
                          {total - against > 0 ? formatAmount(total - against, locale) : ""}
                        </td>
                      </tr>
                    );
                  })}
                  {myRefunds.map((one) => (
                    <tr key={one.id}>
                      <td className="ctr">↩</td>
                      <td>
                        {toCents(one.amount) > 0 ? t("refunds.paidBack") : t("refunds.nothingBack")}: {t(`issued.purpose.${one.purpose}` as MessageKey)}
                      </td>
                      <td className="ctr">{day(one.paidOn, locale)}</td>
                      <td className="ctr">{toCents(one.amount) > 0 && one.purpose === "PENALTY" ? `−${formatAmount(toCents(one.amount), locale)}` : ""}</td>
                      <td className="ctr">{toCents(one.amount) > 0 ? `−${formatAmount(toCents(one.amount), locale)}` : t("credits.nothingShort")}</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="font-semibold">
                      {mineCredited > 0 ? t("refunds.totalAfter") : t("common.total")}
                    </td>
                    <td className="ctr font-semibold">{formatAmount(mineOwed, locale)}</td>
                    <td className="ctr font-semibold">{formatAmount(minePaid, locale)}</td>
                    <td className="ctr font-semibold">
                      {formatAmount(Math.max(0, mineOwed - minePaid), locale)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          );
        })
      )}

      {paid.length > 0 ? (
        <section className="stateblock">
          <h2 className="statetitle">{t("clients.docsReceipts")}</h2>
          <table className="data">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th>{t("contracts.reference")}</th>
                <th>{t("contracts.receipt")}</th>
                <th>{t("contracts.method")}</th>
                <th className="ctr">{t("contracts.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {paid.filter((one) => one.kind !== "CREDIT").map((one) => (
                <tr key={one.id}>
                  <td>{day(one.paidOn, locale)}</td>
                  <td>{rows.find((r) => r.contract.id === one.contractId)?.contract.reference}</td>
                  <td>{one.receiptNumber ?? ""}</td>
                  <td>
                    {howPaid(one.method)}
                    {one.methodOther ? `: ${one.methodOther}` : ""}
                  </td>
                  <td className="ctr">{formatAmount(toCents(one.amount), locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {asked.length > 0 ? (
        <section className="stateblock">
          <h2 className="statetitle">{t("clients.docsChanges")}</h2>
          <table className="data">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th>{t("common.name")}</th>
                <th>{t("common.status")}</th>
                <th className="ctr">{t("contracts.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {asked.map((one) => (
                <tr key={one.id}>
                  <td>{day(one.requestedOn, locale)}</td>
                  <td>{one.title}</td>
                  <td>{t(`contracts.changeStatus.${one.status}` as MessageKey)}</td>
                  <td className="ctr">
                    {one.costImpact ? formatAmount(toCents(one.costImpact), locale) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="statetotals">
        <div>
          <p className="label">{t("common.total")}</p>
          <p className="statefigure">{formatAmount(owed, locale)}</p>
        </div>
        <div>
          <p className="label">{t("contracts.paid")}</p>
          <p className="statefigure">{formatAmount(received, locale)}</p>
        </div>
        <div>
          <p className="label">{t("dash.outstanding")}</p>
          <p className="statefigure statefigure-owed">{formatAmount(outstanding, locale)}</p>
        </div>
      </section>

      <p className="mt-4 text-xs text-brand-graphite/60">{t("clients.statementNote")}</p>
    </div>
  );
}
