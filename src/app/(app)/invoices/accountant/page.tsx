import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { lastMonth, monthPapers, monthRange, packHistory, PACK_GROUPS } from "@/lib/accountantPack";
import { readSetting } from "@/lib/settings";
import { Card, PageHeader } from "@/components/ui";
import PackPicker from "./PackPicker";

/**
 * For the accountant: a month's invoices, receipts and credit notes, ticked
 * and sent in one email, or downloaded as one ZIP.
 */
export const dynamic = "force-dynamic";

export default async function AccountantPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireUser(["ADMIN"]);
  const params = await searchParams;
  const { locale, t } = await getTranslator();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : lastMonth();
  const [items, to, history] = await Promise.all([monthPapers(month), readSetting("accountant.email"), packHistory(8)]);
  const tag = locale === "el" ? "el-GR" : "en-GB";

  /* The last eighteen months to choose from, this one first. */
  const now = new Date();
  const months = Array.from({ length: 18 }, (_, i) => {
    const one = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${one.getFullYear()}-${String(one.getMonth() + 1).padStart(2, "0")}`;
    return { value, label: one.toLocaleDateString(tag, { month: "long", year: "numeric" }) };
  });

  return (
    <>
      <PageHeader title={t("pack.title")} subtitle={t("pack.subtitle")} />

      <form action="/invoices/accountant" method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="packMonth">
            {t("pack.month")}
          </label>
          <select id="packMonth" name="month" defaultValue={month} className="select !w-56">
            {months.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary">
          {t("pack.show")}
        </button>
      </form>

      <Card title={months.find((one) => one.value === month)?.label ?? month}>
        <PackPicker
          key={month}
          month={month}
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
                    {one.month ? monthRange(one.month).from.toLocaleDateString(tag, { month: "long", year: "numeric" }) : ""}
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

