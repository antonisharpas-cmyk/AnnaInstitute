import Link from "next/link";
import type { projects as projectsTable } from "@/db/schema";
import type { MessageKey } from "@/i18n";
import SubmitButton from "@/components/SubmitButton";

type Project = typeof projectsTable.$inferSelect;

export default function ProjectForm({
  action,
  project,
  companies,
  cancelHref,
  t,
}: {
  action: (formData: FormData) => void | Promise<void>;
  project?: Project;
  companies: { id: string; name: string }[];
  cancelHref: string;
  t: (key: MessageKey) => string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            {t("common.name")}
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={project?.name ?? ""}
            placeholder="Magnum Opus Quattro"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="companyId">
            {t("projects.company")}
          </label>
          <select
            id="companyId"
            name="companyId"
            defaultValue={project?.companyId ?? ""}
            className="select"
          >
            <option value="">{t("projects.noCompany")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="newCompany">
            {t("projects.newCompany")}
          </label>
          <input
            id="newCompany"
            name="newCompany"
            placeholder={t("projects.newCompanyPlaceholder")}
            className="input"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{t("projects.newCompanyNote")}</p>
        </div>

        <div>
          <label className="label" htmlFor="location">
            {t("projects.location")}
          </label>
          <input
            id="location"
            name="location"
            defaultValue={project?.location ?? ""}
            placeholder="Nea Drosia, Larnaca"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="completionBy">
            {t("projects.completion")}
          </label>
          <input
            id="completionBy"
            name="completionBy"
            defaultValue={project?.completionBy ?? ""}
            placeholder="Q2 2028"
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="status">
            {t("common.status")}
          </label>
          <select
            id="status"
            name="status"
            defaultValue={project?.status ?? "UNDER_CONSTRUCTION"}
            className="select"
          >
            <option value="PLANNING">{t("projects.status.PLANNING")}</option>
            <option value="UNDER_CONSTRUCTION">{t("projects.status.UNDER_CONSTRUCTION")}</option>
            <option value="COMPLETED">{t("projects.status.COMPLETED")}</option>
            <option value="DELIVERED">{t("projects.status.DELIVERED")}</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            {t("projects.description")}
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={project?.description ?? ""}
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
