import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { importFolder, importState } from "@/lib/dataImport";
import { BackLink, Card, PageHeader } from "@/components/ui";
import DataUpload from "./DataUpload";
import FreshStart from "./FreshStart";
import { KEPT, freshPreview } from "@/lib/startFresh";

/*
 * Bring the data from the office's own computer onto the server.
 *
 * Everything on the server is replaced by what is in the archive: the
 * database and the uploaded files. What was there before is not deleted, it
 * is put aside on the disk beside it, so a mistake can be undone.
 */
export default async function DataPage() {
  await requireUser(["ADMIN"]);
  const { t } = await getTranslator();
  const state = importState();
  const possible = Boolean(importFolder());
  const preview = await freshPreview();

  return (
    <>
      <BackLink href="/settings" label={t("settings.title")} />
      <PageHeader title={t("data.title")} subtitle={t("data.subtitle")} />
      <div className="max-w-3xl space-y-4">
        <Card title={t("data.howTitle")}>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>{t("data.how1")}</li>
            <li>
              {t("data.how2")} <code className="rounded bg-brand-surface px-1">npm run data:export</code>
            </li>
            <li>{t("data.how3")}</li>
            <li>{t("data.how4")}</li>
          </ol>
          <p className="mt-3 text-xs text-brand-graphite/70">{t("data.warning")}</p>
        </Card>

        <Card title={t("data.uploadTitle")}>
          {possible ? (
            <>
              {state.kind === "done" ? (
                <p className="mb-3 text-xs text-brand-graphite/70">
                  {t("data.last")} {new Date(state.at).toLocaleString("en-GB")}: {state.summary}
                </p>
              ) : null}
              <DataUpload
                waiting={state.kind === "pending"}
                labels={{
                  choose: t("data.choose"),
                  upload: t("data.upload"),
                  uploading: t("data.uploading"),
                  checking: t("data.checking"),
                  ready: t("data.ready"),
                  restart: t("data.restart"),
                  restarting: t("data.restarting"),
                  back: t("data.cancel"),
                  failed: t("data.failed"),
                }}
              />
            </>
          ) : (
            <p className="text-sm">{t("data.notHere")}</p>
          )}
        </Card>

        {/* Clearing the trial data while keeping what was set up. */}
        <Card title={t("fresh.title")}>
          <div className="space-y-3 text-sm" data-fresh>
            <p>{t("fresh.intro")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="label">{t("fresh.cleared")}</p>
                <ul className="space-y-0.5 text-xs" data-fresh-counts>
                  {preview.parts
                    .filter((one) => one.count > 0)
                    .map((one) => (
                      <li key={one.what} className="flex justify-between gap-3 border-b border-brand-line py-0.5">
                        <span>{one.what}</span>
                        <span className="font-semibold">{one.count}</span>
                      </li>
                    ))}
                  <li className="flex justify-between gap-3 border-b border-brand-line py-0.5">
                    <span>{t("fresh.apartments")}</span>
                    <span className="font-semibold">{preview.apartmentsReset}</span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="label">{t("fresh.kept")}</p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {KEPT.map((one) => (
                    <li key={one}>{one}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs text-brand-graphite/70">{t("fresh.copy")}</p>
            <FreshStart
              labels={{
                type: t("fresh.type"),
                button: t("fresh.button"),
                working: t("fresh.working"),
                wrongWord: t("fresh.wrongWord"),
                done: t("fresh.done"),
                failed: t("fresh.failed"),
              }}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
