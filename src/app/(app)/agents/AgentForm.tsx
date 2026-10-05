import Link from "next/link";
import type { MessageKey } from "@/i18n";
import SubmitButton from "@/components/SubmitButton";
import DateField from "@/components/DateField";

type AgentRecord = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  birthDate?: string | null;
  commissionRate: string;
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
