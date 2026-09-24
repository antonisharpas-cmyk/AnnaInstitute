import { getTranslator } from "@/i18n";
import { readSetting } from "@/lib/settings";
import SubmitButton from "@/components/SubmitButton";
import { setAllEmails } from "@/app/(app)/settings/actions";

/**
 * The master switch for every email the CRM sends, as one card.
 *
 * On the Settings page and at the top of the automatic emails, so whoever is
 * looking at the letters can stop them all at once. Off holds everything:
 * automatic letters, receipts, appointment emails and reminders, daily
 * summaries and campaigns. They are still written and recorded, marked as held.
 */
export default async function EmailSwitch() {
  const { t } = await getTranslator();
  const on = (await readSetting("mail.enabled")) !== "no";
  return (
    <div
      className={`card mb-4 flex flex-wrap items-center justify-between gap-3 p-4 ${
        on ? "" : "border-[color:var(--color-negative)]"
      }`}
    >
      <div className="max-w-prose">
        <p className="flex items-center gap-2 font-semibold">
          <span
            aria-hidden="true"
            className={`inline-block h-2.5 w-2.5 rounded-full ${on ? "bg-[color:var(--color-positive,#2f855a)]" : "bg-[color:var(--color-negative)]"}`}
          />
          {t("mailSwitch.title")}: {on ? t("mailSwitch.on") : t("mailSwitch.off")}
        </p>
        <p className="mt-1 text-xs text-brand-graphite/70">{on ? t("mailSwitch.onHint") : t("mailSwitch.offHint")}</p>
      </div>
      <form action={setAllEmails.bind(null, !on)}>
        <SubmitButton className={on ? "btn btn-danger" : "btn btn-primary"}>
          {on ? t("mailSwitch.turnOff") : t("mailSwitch.turnOn")}
        </SubmitButton>
      </form>
    </div>
  );
}
