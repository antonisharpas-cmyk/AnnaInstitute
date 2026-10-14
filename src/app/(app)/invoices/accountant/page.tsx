import Link from "next/link";
import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { accountantFor, lastMonth, monthRange, monthsFrom, packCompanies, packHistory, packMonths, papersFor, PACK_GROUPS } from "@/lib/accountantPack";
import { Card, PageHeader } from "@/components/ui";
import PackPicker from "./PackPicker";
import Pick from "@/components/Pick";
import { many } from "@/lib/filters";

/**
 * For the accountant: the invoices, receipts and credit notes of the months
 * chosen, of one company or all of them, ticked and sent in one email to that
 * company's accountant, or downloaded as one ZIP.
 */
export const dynamic = "force-dynamic";

export default async function AccountantPage({ searchParams }: { searchParams: Promise<{ month?: string | string[]; company?: string | string[] }> }) {
  await requireUser(["ADMIN"]);
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  /* Only the months that have papers are offered; one or several can be chosen,
     last month when none is, or the newest month with papers if last month has none. */
  const recorded = await packMonths();
  const chosenMonths = monthsFrom(params.month ?? "");
  const months = chosenMonths.length > 0 ? chosenMonths : [recorded.includes(lastMonth()) ? lastMonth() : (recorded[0] ?? lastMonth())];
  /*
   * Which companies: none ticked is every company, "ours" is One Eleven itself,
   * otherwise one or several companies. Each has its own accountant, so the
   * address is filled in when exactly one is chosen.
   */
  const companies = await packCompanies();
  const picked = many(Array.isArray(params.company) ? params.company.join(",") : params.company).filter(
    (one) => one === "ours" || companies.some((c) => c.id === one && c.id),
  );
  const company = picked.join(",");
  const companyIds = picked.length === 0 ? null : picked.map((one) => (one === "ours" ? "" : one));
  const [items, to, history] = await Promise.all([
    papersFor(months, companyIds),
    accountantFor(picked.length === 1 ? picked[0] : ""),
    packHistory(8),
  ]);
  const companyName =
    companyIds === null ? "" : companyIds.map((id) => companies.find((one) => one.id === id)?.name ?? "").filter(Boolean).join(", ");
  const tag = locale === "el" ? "el-GR" : "en-GB";

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
          <Pick
            name="month"
            label={t("pack.months")}
            chosen={months}
            anything={label}
            choices={choices}
          />
          <Pick
            name="company"
            label={t("pack.company")}
            chosen={picked}
            anything={t("pack.allCompanies")}
            choices={companies.map((one) => ({
              value: one.id || "ours",
              label: `${one.name} (${one.projects.length > 0 ? one.projects.join(", ") : t("pack.noProjects")})`,
            }))}
          />
          <button type="submit" className="btn btn-secondary">
            {t("pack.show")}
          </button>
          {chosenMonths.length > 0 || picked.length > 0 ? (
            <Link href="/invoices/accountant" className="btn btn-secondary" prefetch={false} data-reset>
              {t("list.resetAll")}
            </Link>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-brand-graphite/60">{t("pack.monthsHint")}</p>
      </form>

      {/* What went to the accountant before, under the filters where it is seen. */}
      {history.length > 0 ? (
        <div className="mb-4">
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

      <Card title={companyName ? `${companyName}, ${label}` : label}>
        <PackPicker
          key={`${months.join(",")}|${company}`}
          months={months}
          company={company}
          items={items}
          groups={PACK_GROUPS}
          defaultTo={to}
          labels={{
            previous: t("pack.previous"),
            next: t("pack.next"),
            showing: t("pack.showing"),
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

    </>
  );
}

