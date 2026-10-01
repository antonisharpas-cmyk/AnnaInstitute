import { getTranslator } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { importFolder, importState } from "@/lib/dataImport";
import { BackLink, Card, PageHeader } from "@/components/ui";
import DataUpload from "./DataUpload";

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
      </div>
    </>
  );
}
