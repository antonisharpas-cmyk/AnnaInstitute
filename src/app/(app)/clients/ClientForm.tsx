import Link from "next/link";
import type { clients as clientsTable } from "@/db/schema";
import type { MessageKey } from "@/i18n";
import SubmitButton from "@/components/SubmitButton";
import SourceAgentFields from "@/components/SourceAgentFields";

type Client = typeof clientsTable.$inferSelect;

export default function ClientForm({
  action,
  client,
  cancelHref,
  t,
  idTypes,
  sources,
  agents = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  client?: Client;
  cancelHref: string;
  t: (key: MessageKey) => string;
  /** What the two pickers offer, as the office has them in the Builder. */
  idTypes: { value: string; label: string }[];
  sources: { value: string; label: string }[];
  /** For a client an agent brought: which agent. */
  agents?: { value: string; label: string; hint?: string }[];
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">
            {t("common.name")}
          </label>
          <input
            id="firstName"
            name="firstName"
            required
            defaultValue={client?.firstName ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="lastName">
            Surname
          </label>
          <input
            id="lastName"
            name="lastName"
            required
            defaultValue={client?.lastName ?? ""}
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
            defaultValue={client?.email ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            {t("common.phone")}
          </label>
          <input
            id="phone"
            name="phone"
            defaultValue={client?.phone ?? ""}
            placeholder="+357 99 000000"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="idType">
            {t("clients.idType")}
          </label>
          <select id="idType" name="idType" className="select" defaultValue={client?.idType ?? ""}>
            <option value="">{t("clients.notRecorded")}</option>
            {idTypes.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="idNumber">
            {t("clients.idNumber")}
          </label>
          <input
            id="idNumber"
            name="idNumber"
            defaultValue={client?.idNumber ?? ""}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="vatNumber">
            {t("clients.vatNumber")}
          </label>
          <input
            id="vatNumber"
            name="vatNumber"
            defaultValue={client?.vatNumber ?? ""}
            placeholder={t("clients.vatNumberHint")}
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="country">
            {t("clients.country")}
          </label>
          <input
            id="country"
            name="country"
            defaultValue={client?.country ?? ""}
            placeholder="Cyprus"
            className="input"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">
            {t("clients.address")}
          </label>
          <input
            id="address"
            name="address"
            defaultValue={client?.address ?? ""}
            className="input"
          />
        </div>
        <div className="space-y-4">
          <SourceAgentFields
            sources={sources}
            agents={agents}
            defaultSource={client?.source ?? "BUYER"}
            defaultAgentId={client?.agentId ?? null}
            labels={{
              source: t("clients.source"),
              agent: t("clients.referralAgent"),
              choose: t("common.choose"),
              search: t("common.searchByName"),
              noMatch: t("common.noMatch"),
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            {t("common.notes")}
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={client?.notes ?? ""}
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
