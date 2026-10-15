import Link from "next/link";
import type { MessageKey } from "@/i18n";
import SubmitButton from "@/components/SubmitButton";
import DateField from "@/components/DateField";
import { TITLES, titleWord } from "@/lib/titles";

type AgentRecord = {
  id: string;
  name: string;
  title?: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  birthDate?: string | null;
  commissionRate: string;
  vatRate?: string;
  campaignChannel?: string | null;
  isActive: boolean;
  notes: string | null;
};

export default function AgentForm({
  action,
  agent,
  cancelHref,
  t,
}: {
  action: (formData: FormData) => void | Promise<void>;
  agent?: AgentRecord;
  cancelHref: string;
  t: (key: MessageKey) => string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 sm:max-w-[12rem]">
          <label className="label" htmlFor="title">
            {t("clients.salutation")}
          </label>
          <select id="title" name="title" className="select" defaultValue={agent?.title ?? ""}>
            <option value="">{t("clients.salutationNone")}</option>
            {TITLES.map((one) => (
              <option key={one} value={one}>
                {titleWord(one)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="name">
            {t("common.name")}
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={agent?.name ?? ""}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="company">
            {t("agents.company")}
          </label>
          <input
            id="company"
            name="company"
            defaultValue={agent?.company ?? ""}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="email">
            {t("common.email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={agent?.email ?? ""}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="phone">
            {t("common.phone")}
          </label>
          <input id="phone" name="phone" defaultValue={agent?.phone ?? ""} className="input" />
        </div>

        <div>
          <label className="label" htmlFor="birthDate">
            {t("people.birthDate")}
          </label>
          <DateField id="birthDate" name="birthDate" defaultValue={agent?.birthDate ?? ""} />
          <p className="mt-1 text-xs text-brand-graphite/60">{t("people.birthDateHint")}</p>
        </div>

        <div>
          <label className="label" htmlFor="commissionRate">
            {t("agents.rate")}
          </label>
          <input
            id="commissionRate"
            name="commissionRate"
            defaultValue={agent ? Number(agent.commissionRate) : 3}
            className="input"
          />
        </div>

        {/* The VAT the agent charges on a commission: 19% unless changed, and each commission can still differ. */}
        <div>
          <label className="label" htmlFor="vatRate">
            {t("agents.vatRate")}
          </label>
          <input
            id="vatRate"
            name="vatRate"
            inputMode="decimal"
            defaultValue={agent?.vatRate !== undefined ? Number(agent.vatRate) : 19}
            className="input"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{t("agents.vatRateHint")}</p>
        </div>

        {/* How campaigns reach them. One campaign never goes to them both ways. */}
        <div>
          <label className="label" htmlFor="campaignChannel">
            {t("agents.campaignChannel")}
          </label>
          <select id="campaignChannel" name="campaignChannel" defaultValue={agent?.campaignChannel ?? "EMAIL"} className="select">
            <option value="EMAIL">{t("agents.channel.EMAIL")}</option>
            <option value="WHATSAPP">{t("agents.channel.WHATSAPP")}</option>
            <option value="BOTH">{t("agents.channel.BOTH")}</option>
          </select>
          <p className="mt-1 text-xs text-brand-graphite/60">{t("agents.campaignChannelHint")}</p>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={agent ? agent.isActive : true} />
            <span>{t("agents.active")}</span>
          </label>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            {t("common.notes")}
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={agent?.notes ?? ""}
            className="textarea"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-brand-line pt-4">
        <SubmitButton>{t("common.save")}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
