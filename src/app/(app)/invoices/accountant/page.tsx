import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { accountantFor, lastMonth, monthRange, monthsFrom, packCompanies, packHistory, packMonths, papersFor, PACK_GROUPS } from "@/lib/accountantPack";
import { Card, PageHeader } from "@/components/ui";
import PackPicker from "./PackPicker";

/**
 * For the accountant: the invoices, receipts and credit notes of the months
 * chosen, of one company or all of them, ticked and sent in one email to that
 * company's accountant, or downloaded as one ZIP.
 */
export const dynamic = "force-dynamic";

export default async function AccountantPage({ searchParams }: { searchParams: Promise<{ month?: string | string[]; company?: string }> }) {
  await requireUser(["ADMIN"]);
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  /* Only the months that have papers are offered; one or several can be chosen,
     last month when none is, or the newest month with papers if last month has none. */
  const recorded = await packMonths();
  const chosenMonths = monthsFrom(params.month ?? "");
  const months = chosenMonths.length > 0 ? chosenMonths : [recorded.includes(lastMonth()) ? lastMonth() : (recorded[0] ?? lastMonth())];
  /* "" is every company, "ours" One Eleven itself, otherwise one company: each has its own accountant. */
  const companies = await packCompanies();
  const rawCompany = String(params.company ?? "").trim();
  const company = rawCompany === "ours" || companies.some((one) => one.id === rawCompany && one.id) ? rawCompany : "";
  const companyId = company === "" ? null : company === "ours" ? "" : company;
  const [items, to, history] = await Promise.all([papersFor(months, companyId), accountantFor(company), packHistory(8)]);
  const tag = locale === "el" ? "el-GR" : "en-GB";
  const companyName = companyId === null ? "" : (companies.find((one) => one.id === companyId)?.name ?? "");

  /* The months with papers, newest first, and any month asked for in the address. */
  const choices = monthsFrom([...recorded, ...months])
    .reverse()
    .map((value) => ({ value, label: monthRange(value).from.toLocaleDateString(tag, { month: "long", year: "numeric" }) }));
  const label = months.map((one) => choices.find((c) => c.value === one)?.label ?? monthRange(one).label).join(", ");

  return (
    <>
      <PageHeader title={t("pack.title")} subtitle={t("pack.subtitle")} />

      <form action="/invoices/accountant" method="get" className="mb-4" data-pack-filters>
        <div className="flex flex-wrap items-end gap-2">
          {/* A dropdown with a tick for each month that has papers. */}
          <div>
            <span className="label">{t("pack.months")}</span>
            <details className="relative" data-pack-months>
              <summary className="select !w-72 cursor-pointer list-none truncate">{label}</summary>
              <div className="absolute z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded border border-brand-line bg-white p-2 shadow-lg dark:bg-[color:var(--color-surface)]">
                {choices.length === 0 ? (
                  <p className="p-1 text-sm text-brand-graphite/60">{t("pack.nothing")}</p>
                ) : (
                  choices.map((one) => (
                    <label key={one.value} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-brand-surface">
                      <input type="checkbox" name="month" value={one.value} defaultChecked={months.includes(one.value)} />
                      {one.label}
                    </label>
                  ))
                )}
              </div>
            </details>
          </div>
          <div>
            <label className="label" htmlFor="packCompany">
              {t("pack.company")}
            </label>
            <select id="packCompany" name="company" defaultValue={company} className="select !w-[28rem] max-w-full" data-pack-company>
              <option value="">{t("pack.allCompanies")}</option>
              {companies.map((one) => (
                <option key={one.id || "ours"} value={one.id || "ours"}>
                  {one.name} ({one.projects.length > 0 ? one.projects.join(", ") : t("pack.noProjects")})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            {t("pack.show")}
          </button>
        </div>
        <p className="mt-1 text-xs text-brand-graphite/60">{t("pack.monthsHint")}</p>
      </form>

      <Card title={companyName ? `${companyName}, ${label}` : label}>
        <PackPicker
          key={`${months.join(",")}|${company}`}
          months={months}
          company={company}
          items={items}
          groups={PACK_GROUPS}
          defaultTo={to}
          labels={{
            groups: {
              invoice: t("pack.group.invoice"),
              receipt: t("pack.group.receipt"),
              credit: t("pack.group.credit"),
              companyInvoice: t("pack.group.companyInvoice"),
              received: t("pack.group.received"),
              constructor: t("pack.group.constructor"),
              commission: t("pack.group.commission"),
              refundAck: t("pack.group.refundAck"),
            },
            all: t("pack.all"),
            none: t("pack.none"),
            nothing: t("pack.nothing"),
            number: t("pack.number"),
            date: t("common.date"),
            party: t("pack.party"),
            about: t("pack.about"),
            total: t("pack.total"),
            voided: t("pack.voided"),
            cancelled: t("pack.cancelled"),
            pending: t("pack.pending"),
            unsigned: t("pack.unsigned"),
            credited: t("pack.credited"),
            noFile: t("pack.noFile"),
            chosen: t("pack.chosen"),
            to: t("pack.to"),
            toHint: t("pack.toHint"),
            note: t("pack.note"),
            noteHint: t("pack.noteHint"),
            download: t("pack.download"),
            downloading: t("pack.downloading"),
            send: t("pack.send"),
            sending: t("pack.sending"),
          }}
        />
      </Card>

      {history.length > 0 ? (
        <div className="mt-4">
          <Card title={t("pack.history")}>
            <ul className="divide-y divide-brand-line text-sm" data-pack-history>
              {history.map((one, i) => (
                <li key={i} className="py-2">
                  <span className="font-semibold">
                    {one.month ? monthsFrom(one.month).map((m) => monthRange(m).from.toLocaleDateString(tag, { month: "long", year: "numeric" })).join(", ") : ""}
                  </span>
                  <span className="text-brand-graphite/70">
                    {" "}
                    . {new Date(one.at).toLocaleString(tag)} . {one.detail}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}

