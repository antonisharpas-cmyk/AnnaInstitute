import Link from "next/link";
import type { projects as projectsTable } from "@/db/schema";
import type { MessageKey } from "@/i18n";
import SubmitButton from "@/components/SubmitButton";
import { shownCode } from "@/lib/choices/lists";

type Project = typeof projectsTable.$inferSelect;

export default function ProjectForm({
  action,
  project,
  cancelHref,
  t,
  statuses,
}: {
  action: (formData: FormData) => void | Promise<void>;
  project?: Project;
  /** No longer asked on the form: the companies are added on the development's own page. */
  companies?: { id: string; name: string }[];
  cancelHref: string;
  t: (key: MessageKey) => string;
  /** The statuses as the office has them in the Builder. */
  statuses: { value: string; label: string }[];
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
          <label className="label" htmlFor="mapsUrl">
            {t("projects.mapsUrl")}
          </label>
          <input
            id="mapsUrl"
            name="mapsUrl"
            inputMode="url"
            defaultValue={project?.mapsUrl ?? ""}
            placeholder="https://maps.app.goo.gl/..."
            className="input"
          />
          <p className="mt-1 text-xs text-brand-graphite/60">{t("projects.mapsUrlNote")}</p>
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
            defaultValue={project ? shownCode(project.status, project.statusChoice) : "UNDER_CONSTRUCTION"}
            className="select"
          >
            {statuses.map((one) => (
              <option key={one.value} value={one.value}>
                {one.label}
              </option>
            ))}
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
