import Link from "next/link";
import type { MessageKey } from "@/i18n";

type AgentRecord = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  commissionRate: string;
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
        <button type="submit" className="btn btn-primary">
          {t("common.save")}
        </button>
        <Link href={cancelHref} className="btn btn-secondary">
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
