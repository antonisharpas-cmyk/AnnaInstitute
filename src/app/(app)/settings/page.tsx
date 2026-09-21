import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { readSettings } from "@/lib/settings";
import { buildSummaries, summaryText } from "@/lib/appointmentSummary";
import { emailConfigured } from "@/lib/messaging";
import { Card, Empty, PageHeader } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { saveAppointmentSettings, sendSummaryNow } from "./actions";

/**
 * The admin panel, which is one panel so far.
 *
 * The office asked for the day's summary to be configurable from here: whether
 * it goes, at what hour, and what happens on a day with nothing on it. And
 * because a setting nobody can see the effect of is a setting nobody trusts,
 * the page also shows exactly what each person will receive, as it stands right
 * now, and offers to send it this minute.
 */
export default async function SettingsPage() {
  await requireUser(["ADMIN"]);
  const { t } = await getTranslator();

  const config = await readSettings([
    "appointments.summaryOn",
    "appointments.summaryHour",
    "appointments.summaryWhenEmpty",
    "appointments.summaryLastResult",
  ]);

  const summaries = await buildSummaries(0);

  return (
    <>
      <PageHeader title={t("settings.title")} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={t("settings.appointments")}>
            <form action={saveAppointmentSettings} className="space-y-4">
              <label className="flex items-start gap-2 rounded border border-brand-line bg-brand-surface p-3 text-sm">
                <input
                  type="checkbox"
                  name="on"
                  defaultChecked={config["appointments.summaryOn"] === "yes"}
                  className="mt-0.5"
                />
                <span>
                  {t("settings.summaryOn")}
                  <span className="mt-0.5 block text-xs text-brand-graphite/60">
                    {t("settings.summaryOnHint")}
                  </span>
                </span>
              </label>

              <div className="sm:w-48">
                <label className="label" htmlFor="hour">
                  {t("settings.summaryHour")}
                </label>
                <input
                  id="hour"
                  name="hour"
                  inputMode="numeric"
                  defaultValue={config["appointments.summaryHour"]}
                  className="input"
                />
                <p className="mt-1 text-xs text-brand-graphite/60">
                  {t("settings.summaryHourHint")}
                </p>
              </div>

              <label className="flex items-start gap-2 rounded border border-brand-line bg-brand-surface p-3 text-sm">
                <input
                  type="checkbox"
                  name="whenEmpty"
                  defaultChecked={config["appointments.summaryWhenEmpty"] === "yes"}
                  className="mt-0.5"
                />
                <span>
                  {t("settings.summaryWhenEmpty")}
                  <span className="mt-0.5 block text-xs text-brand-graphite/60">
                    {t("settings.summaryWhenEmptyHint")}
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3 border-t border-brand-line pt-4">
                <SubmitButton>{t("common.save")}</SubmitButton>
                <span className="text-xs text-brand-graphite/60">
                  {t("settings.lastRun")}:{" "}
                  {config["appointments.summaryLastResult"] || t("settings.neverRun")}
                </span>
              </div>
            </form>

            <form action={sendSummaryNow} className="mt-4 border-t border-brand-line pt-4">
              <SubmitButton className="btn btn-secondary">{t("settings.sendNow")}</SubmitButton>
            </form>

            {emailConfigured() ? null : (
              <p className="mt-3 max-w-prose rounded border border-[color:var(--color-warning)] bg-brand-surface px-3 py-2 text-xs">
                {t("settings.noEmailYet")}
              </p>
            )}

            <p className="mt-3 max-w-prose text-xs text-brand-graphite/55">
              {t("settings.byScheduler")}
            </p>
          </Card>
        </div>

        <div>
          <Card title={t("settings.preview")}>
            <p className="mb-3 text-xs text-brand-graphite/60">{t("settings.previewHint")}</p>
            {summaries.length === 0 ? (
              <Empty message={t("team.none")} />
            ) : (
              <ul className="space-y-3 text-sm">
                {summaries.map((summary) => (
                  <li key={summary.id}>
                    <p className="font-semibold">{summary.name}</p>
                    <p className="text-xs break-all text-brand-graphite/60">
                      {summary.email ?? t("team.noEmail")}
                    </p>
                    <pre className="mt-1 overflow-x-auto rounded border border-brand-line bg-brand-surface p-2 text-xs whitespace-pre-wrap">
                      {summaryText(summary, 0)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
