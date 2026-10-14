import { getTranslator } from "@/i18n";
import { recordingHistory } from "@/lib/history";
import SubmitButton from "@/components/SubmitButton";
import { setRecordingHistory } from "@/app/(app)/settings/actions";

/**
 * Recording history, as one card on the Settings page.
 *
 * On while the office brings in its past: old payments, contracts, commissions
 * and invoices are entered with no papers issued, no letters and no alerts.
 * Off again once they are in, and the CRM goes back to doing all three.
 */
export default async function HistorySwitch() {
  const { t } = await getTranslator();
  const on = await recordingHistory();
  return (
    <div
      className={`card mb-4 flex flex-wrap items-center justify-between gap-3 p-4 ${
        on ? "border-[color:var(--color-warning)]" : ""
      }`}
      data-history-switch
    >
      <div className="max-w-prose">
        <p className="flex items-center gap-2 font-semibold">
          <span
            aria-hidden="true"
            className={`inline-block h-2.5 w-2.5 rounded-full ${on ? "bg-[color:var(--color-warning)]" : "bg-brand-graphite/30"}`}
          />
          {t("history.title")}: {on ? t("history.on") : t("history.off")}
        </p>
        <p className="mt-1 text-xs text-brand-graphite/70">{on ? t("history.onHint") : t("history.offHint")}</p>
      </div>
      <form action={setRecordingHistory.bind(null, !on)}>
        <SubmitButton className={on ? "btn btn-primary" : "btn btn-secondary"}>
          {on ? t("history.turnOff") : t("history.turnOn")}
        </SubmitButton>
      </form>
    </div>
  );
}
